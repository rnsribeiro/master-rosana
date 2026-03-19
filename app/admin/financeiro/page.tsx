"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useAdminRole } from "@/components/admin/admin-role-provider";
import { ReadOnlyBanner } from "@/components/admin/admin-access-notice";

type TxRow = {
  id: string;
  type: "in" | "out";
  date: string; // yyyy-mm-dd
  amount: number;
  description: string | null;
  player_id: string | null;
  player_name?: string | null;
  target_year: number | null;
  receipt_path: string | null;
  created_at: string;
};

type Summary = {
  totalIn: number;
  totalOut: number;
  cash: number;
  totalOpenDue: number;
};

type SummaryResponse = Partial<Summary> & {
  error?: string;
};

type TxApiRelation = {
  full_name: string | null;
};

type TxApiRow = Omit<TxRow, "amount" | "target_year" | "player_name"> & {
  amount: number | string | null;
  target_year: number | string | null;
  player_name?: string | null;
  players?: TxApiRelation[] | TxApiRelation | null;
};

type TransactionsResponse = {
  error?: string;
  transactions?: TxApiRow[];
};

type SnapshotFormat = "svg" | "png" | "pdf";
type TypeFilter = "all" | "in" | "out";
type ReceiptFilter = "all" | "with" | "without";

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function getPlayerName(tx: TxApiRow) {
  if (tx.player_name) return tx.player_name;
  if (Array.isArray(tx.players)) return tx.players[0]?.full_name ?? null;
  return tx.players?.full_name ?? null;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(objectUrl);
}

async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("Falha ao converter arquivo para data URL."));
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo gerado."));
    reader.readAsDataURL(blob);
  });
}

function getSvgDimensions(svgText: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;

  const widthAttr = svg.getAttribute("width");
  const heightAttr = svg.getAttribute("height");
  const viewBox = svg.getAttribute("viewBox");

  const width = widthAttr ? Number(widthAttr) : 0;
  const height = heightAttr ? Number(heightAttr) : 0;

  if (width > 0 && height > 0) {
    return { width, height };
  }

  if (viewBox) {
    const [, , vbWidth, vbHeight] = viewBox.split(/\s+/).map(Number);
    if (vbWidth > 0 && vbHeight > 0) {
      return { width: vbWidth, height: vbHeight };
    }
  }

  throw new Error("Nao foi possivel identificar o tamanho do SVG.");
}

async function svgToPngBlob(svgText: string, width: number, height: number) {
  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = window.URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Falha ao carregar a imagem SVG."));
      img.src = svgUrl;
    });

    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Falha ao criar o canvas para exportacao.");
    }

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Falha ao gerar o arquivo PNG."));
      }, "image/png");
    });
  } finally {
    window.URL.revokeObjectURL(svgUrl);
  }
}

function ymLabel(dateISO: string) {
  const d = new Date(dateISO + "T00:00:00");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${mm}/${d.getFullYear()}`;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function openReceipt(transactionId: string) {
  window.open(`/api/admin/finance/receipts/${transactionId}`, "_blank", "noopener,noreferrer");
}

function downloadReceiptFile(transactionId: string) {
  const a = document.createElement("a");
  a.href = `/api/admin/finance/receipts/${transactionId}?download=1`;
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function FinanceiroAdminPage() {
  const { canEdit } = useAdminRole();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [snapshotYear, setSnapshotYear] = useState(String(new Date().getFullYear()));
  const [snapshotLoading, setSnapshotLoading] = useState<SnapshotFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [dateYearFilter, setDateYearFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [receiptFilter, setReceiptFilter] = useState<ReceiptFilter>("all");

  // modal edição
  const [editOpen, setEditOpen] = useState(false);
  const [editTx, setEditTx] = useState<TxRow | null>(null);

  const [eDate, setEDate] = useState("");
  const [eAmount, setEAmount] = useState<number>(0);
  const [eDesc, setEDesc] = useState("");
  const [eYear, setEYear] = useState<number | "">("");

  async function getTokenOrThrow(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Token ausente. Faça login novamente.");
    return token;
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [sRes, tRes] = await Promise.all([
        fetch("/api/admin/finance/summary"),
        fetch("/api/admin/finance/transactions?limit=500"),
      ]);

      const sData = (await sRes.json().catch(() => ({}))) as SummaryResponse;
      const tData = (await tRes.json().catch(() => ({}))) as TransactionsResponse;

      if (!sRes.ok) throw new Error(sData?.error ?? "Erro ao carregar resumo.");
      if (!tRes.ok) throw new Error(tData?.error ?? "Erro ao carregar transações.");

      setSummary({
        totalIn: n(sData.totalIn),
        totalOut: n(sData.totalOut),
        cash: n(sData.cash),
        totalOpenDue: n(sData.totalOpenDue),
      });

      setTxs(
        (tData.transactions ?? []).map((t) => ({
          id: t.id,
          type: t.type,
          date: t.date,
          amount: n(t.amount),
          description: t.description,
          player_id: t.player_id,
          target_year: t.target_year == null ? null : Number(t.target_year),
          receipt_path: t.receipt_path,
          created_at: t.created_at,
          player_name: getPlayerName(t),
        }))
      );
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Falha ao carregar."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const chartData = useMemo(() => {
    const map = new Map<string, { month: string; in: number; out: number }>();

    for (const t of txs) {
      const key = ymLabel(t.date);
      const row = map.get(key) ?? { month: key, in: 0, out: 0 };
      if (t.type === "in") row.in += t.amount;
      else row.out += t.amount;
      map.set(key, row);
    }

    const parseKey = (k: string) => {
      const [mm, yyyy] = k.split("/");
      return new Date(Number(yyyy), Number(mm) - 1, 1).getTime();
    };

    return Array.from(map.values())
      .sort((a, b) => parseKey(a.month) - parseKey(b.month))
      .slice(-12);
  }, [txs]);

  const totalIn = summary?.totalIn ?? 0;
  const totalOut = summary?.totalOut ?? 0;
  const cash = summary?.cash ?? 0;
  const openDue = summary?.totalOpenDue ?? 0;

  const yearOptions = useMemo(() => {
    return Array.from(new Set(txs.map((tx) => tx.date.slice(0, 4)))).sort(
      (a, b) => Number(b) - Number(a)
    );
  }, [txs]);

  const filteredTxs = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return txs.filter((tx) => {
      if (typeFilter !== "all" && tx.type !== typeFilter) return false;

      const txYear = tx.date.slice(0, 4);
      if (dateYearFilter !== "all" && txYear !== dateYearFilter) return false;

      const txMonth = tx.date.slice(5, 7);
      if (monthFilter !== "all" && txMonth !== monthFilter) return false;

      if (receiptFilter === "with" && !tx.receipt_path) return false;
      if (receiptFilter === "without" && tx.receipt_path) return false;

      if (!search) return true;

      const haystack = [
        tx.description ?? "",
        tx.player_name ?? "",
        tx.type === "in" ? "entrada" : "saida",
        tx.amount.toFixed(2),
        tx.date,
        tx.target_year != null ? String(tx.target_year) : "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [txs, searchTerm, typeFilter, dateYearFilter, monthFilter, receiptFilter]);

  function clearFilters() {
    setSearchTerm("");
    setTypeFilter("all");
    setDateYearFilter("all");
    setMonthFilter("all");
    setReceiptFilter("all");
  }

  function openEdit(t: TxRow) {
    if (!canEdit) return;
    setEditTx(t);
    setEDate(t.date);
    setEAmount(t.amount);
    setEDesc(t.description ?? "");
    setEYear(t.target_year ?? "");
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditTx(null);
  }

  async function saveEdit() {
    if (!editTx) return;
    if (!canEdit) {
      setError("Seu perfil esta em modo somente leitura.");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(eDate)) {
      setError("Data inválida (YYYY-MM-DD).");
      return;
    }
    if (!(Number(eAmount) > 0)) {
      setError("Valor inválido.");
      return;
    }

    let yearPayload: number | null | undefined = undefined;
    if (editTx.type === "in") {
      if (eYear === "") yearPayload = null;
      else {
        const y = Number(eYear);
        if (!Number.isInteger(y) || y < 2000 || y > 2100) {
          setError("Ano alvo inválido.");
          return;
        }
        yearPayload = y;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getTokenOrThrow();

      const res = await fetch(`/api/admin/finance/transactions/${editTx.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // ✅ token aqui
        },
        body: JSON.stringify({
          date: eDate,
          amount: Number(eAmount),
          description: eDesc ? eDesc : null,
          ...(editTx.type === "in" ? { target_year: yearPayload } : {}),
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error ?? "Erro ao salvar.");
      }

      closeEdit();
      await load();
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Falha ao salvar."));
    } finally {
      setLoading(false);
    }
  }

  async function deleteTx(t: TxRow) {
    if (!canEdit) {
      setError("Seu perfil esta em modo somente leitura.");
      return;
    }

    if (!confirm("Excluir este registro?")) return;

    setLoading(true);
    setError(null);

    try {
      const token = await getTokenOrThrow();

      const res = await fetch(`/api/admin/finance/transactions/${t.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`, // ✅ token aqui
        },
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error ?? "Erro ao excluir.");
      }

      await load();
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Falha ao excluir."));
    } finally {
      setLoading(false);
    }
  }

  async function exportSpreadsheet() {
    setExporting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/finance/export");
      const body = await res.blob();

      if (!res.ok) {
        let message = "Erro ao exportar planilha.";

        try {
          const parsed = JSON.parse(await body.text());
          message = parsed?.error ?? message;
        } catch {
          // noop
        }

        throw new Error(message);
      }

      downloadBlob(
        body,
        `transacoes-financeiras-${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Falha ao exportar."));
    } finally {
      setExporting(false);
    }
  }

  async function fetchAnnualSvg(year: number) {
    const res = await fetch(`/api/admin/finance/annual-status/image?year=${year}`);
    const body = await res.text();

    if (!res.ok) {
      let message = "Erro ao gerar imagem anual.";

      try {
        const parsed = JSON.parse(body) as { error?: string };
        message = parsed?.error ?? message;
      } catch {
        // noop
      }

      throw new Error(message);
    }

    const { width, height } = getSvgDimensions(body);
    return { svgText: body, width, height };
  }

  async function exportAnnualImage(format: SnapshotFormat) {
    const year = Number(snapshotYear);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setError("Informe um ano valido entre 2000 e 2100.");
      return;
    }

    setSnapshotLoading(format);
    setError(null);

    try {
      const { svgText, width, height } = await fetchAnnualSvg(year);

      if (format === "svg") {
        downloadBlob(
          new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }),
          `mensalidades-${year}.svg`
        );
        return;
      }

      const pngBlob = await svgToPngBlob(svgText, width, height);

      if (format === "png") {
        downloadBlob(pngBlob, `mensalidades-${year}.png`);
        return;
      }

      const { jsPDF } = await import("jspdf");
      const pngDataUrl = await blobToDataUrl(pngBlob);
      const pageWidth = Math.max(300, width * 0.75);
      const pageHeight = Math.max(200, height * 0.75);
      const pdf = new jsPDF({
        orientation: pageWidth >= pageHeight ? "landscape" : "portrait",
        unit: "pt",
        format: [pageWidth, pageHeight],
        compress: true,
      });

      pdf.addImage(pngDataUrl, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
      const pdfBlob = pdf.output("blob");
      downloadBlob(pdfBlob, `mensalidades-${year}.pdf`);
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Falha ao gerar imagem."));
    } finally {
      setSnapshotLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-semibold">Financeiro</h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            onClick={exportSpreadsheet}
            disabled={exporting}
            className="w-full rounded-xl border border-zinc-700 px-4 py-2 font-medium hover:border-zinc-500 disabled:opacity-60 sm:w-auto"
          >
            {exporting ? "Exportando..." : "Exportar transacoes"}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="w-full rounded-xl bg-zinc-100 px-4 py-2 font-medium text-zinc-950 disabled:opacity-60 sm:w-auto"
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {!canEdit && (
        <ReadOnlyBanner description="Seu perfil pode consultar transacoes, comprovantes e exportacoes, mas nao pode editar ou excluir lancamentos." />
      )}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Quadro anual de mensalidades</h2>
            <p className="text-sm text-zinc-400">
              Gera um quadro anual com os jogadores nas linhas e os meses do ano nas colunas.
              Verde significa pago, amarelo parcial, vermelho em aberto e cinza sem cobranca.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
            <div className="w-full sm:w-auto">
              <label className="text-sm text-zinc-300">Ano</label>
              <input
                type="number"
                min={2000}
                max={2100}
                value={snapshotYear}
                onChange={(e) => setSnapshotYear(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 sm:w-32"
              />
            </div>

            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
              <button
                onClick={() => exportAnnualImage("svg")}
                disabled={snapshotLoading !== null}
                className="w-full rounded-xl border border-zinc-700 px-4 py-2 font-medium hover:border-zinc-500 disabled:opacity-60 sm:w-auto"
              >
                {snapshotLoading === "svg" ? "Gerando SVG..." : "SVG"}
              </button>
              <button
                onClick={() => exportAnnualImage("png")}
                disabled={snapshotLoading !== null}
                className="w-full rounded-xl border border-zinc-700 px-4 py-2 font-medium hover:border-zinc-500 disabled:opacity-60 sm:w-auto"
              >
                {snapshotLoading === "png" ? "Gerando PNG..." : "PNG"}
              </button>
              <button
                onClick={() => exportAnnualImage("pdf")}
                disabled={snapshotLoading !== null}
                className="w-full rounded-xl border border-zinc-700 px-4 py-2 font-medium hover:border-zinc-500 disabled:opacity-60 sm:w-auto"
              >
                {snapshotLoading === "pdf" ? "Gerando PDF..." : "PDF"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-xl p-3">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-4 gap-3">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
          <div className="text-sm text-zinc-400">Total de entradas</div>
          <div className="text-xl font-semibold text-emerald-200">R$ {totalIn.toFixed(2)}</div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
          <div className="text-sm text-zinc-400">Total de saídas</div>
          <div className="text-xl font-semibold text-red-200">R$ {totalOut.toFixed(2)}</div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
          <div className="text-sm text-zinc-400">Caixa atual</div>
          <div className="text-xl font-semibold">R$ {cash.toFixed(2)}</div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
          <div className="text-sm text-zinc-400">Em aberto (todos)</div>
          <div className="text-xl font-semibold">R$ {openDue.toFixed(2)}</div>
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
        <h2 className="text-lg font-semibold mb-3">Entradas x Saídas (últimos 12 meses)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="in" />
              <Bar dataKey="out" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
        <h2 className="text-lg font-semibold">Todas as transações</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <label className="text-sm text-zinc-300">Buscar</label>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2"
              placeholder="Jogador, descricao, valor..."
            />
          </div>

          <div>
            <label className="text-sm text-zinc-300">Tipo</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2"
            >
              <option value="all">Todos</option>
              <option value="in">Entradas</option>
              <option value="out">Saidas</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-zinc-300">Ano da data</label>
            <select
              value={dateYearFilter}
              onChange={(e) => setDateYearFilter(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2"
            >
              <option value="all">Todos</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-zinc-300">Mes</label>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2"
            >
              <option value="all">Todos</option>
              <option value="01">Janeiro</option>
              <option value="02">Fevereiro</option>
              <option value="03">Marco</option>
              <option value="04">Abril</option>
              <option value="05">Maio</option>
              <option value="06">Junho</option>
              <option value="07">Julho</option>
              <option value="08">Agosto</option>
              <option value="09">Setembro</option>
              <option value="10">Outubro</option>
              <option value="11">Novembro</option>
              <option value="12">Dezembro</option>
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div className="w-full md:w-56">
            <label className="text-sm text-zinc-300">Comprovante</label>
            <select
              value={receiptFilter}
              onChange={(e) => setReceiptFilter(e.target.value as ReceiptFilter)}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2"
            >
              <option value="all">Todos</option>
              <option value="with">Com comprovante</option>
              <option value="without">Sem comprovante</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-zinc-400">
              Exibindo <span className="text-zinc-200">{filteredTxs.length}</span> de{" "}
              <span className="text-zinc-200">{txs.length}</span> registro(s)
            </div>
            <button
              onClick={clearFilters}
              className="rounded-xl border border-zinc-800 px-4 py-2 text-sm hover:border-zinc-600"
            >
              Limpar filtros
            </button>
          </div>
        </div>

        <div className="overflow-x-auto mt-3">
          <table className="min-w-full text-sm">
            <thead className="text-zinc-400">
              <tr className="border-b border-zinc-800">
                <th className="text-left py-2 pr-4">Data</th>
                <th className="text-left py-2 pr-4">Tipo</th>
                <th className="text-left py-2 pr-4">Valor</th>
                <th className="text-left py-2 pr-4">Descrição</th>
                <th className="text-left py-2 pr-4">Jogador</th>
                <th className="text-left py-2 pr-4">Ano</th>
                <th className="text-left py-2 pr-4">Comprovante</th>
                {canEdit && <th className="text-left py-2 pr-4">Acoes</th>}
              </tr>
            </thead>

            <tbody>
              {filteredTxs.map((t) => {
                const isIn = t.type === "in";
                return (
                  <tr
                    key={t.id}
                    className={[
                      "border-b border-zinc-900",
                      isIn ? "bg-emerald-950/15" : "bg-red-950/15",
                    ].join(" ")}
                  >
                    <td className="py-2 pr-4">
                      {new Date(t.date + "T00:00:00").toLocaleDateString("pt-BR")}
                    </td>
                    <td className={["py-2 pr-4", isIn ? "text-emerald-200" : "text-red-200"].join(" ")}>
                      {isIn ? "Entrada" : "Saída"}
                    </td>
                    <td className="py-2 pr-4">R$ {t.amount.toFixed(2)}</td>
                    <td className="py-2 pr-4">{t.description ?? "-"}</td>

                    <td className="py-2 pr-4">
                      {t.player_id && t.player_name ? (
                        <Link
                          className="underline text-zinc-200 hover:text-zinc-100"
                          href={`/admin/dashboard?playerId=${t.player_id}`}
                        >
                          {t.player_name}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td className="py-2 pr-4">{t.target_year ?? "-"}</td>
                    <td className="py-2 pr-4">
                      {t.receipt_path ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => openReceipt(t.id)}
                            className="rounded-lg border border-zinc-800 px-3 py-1 hover:border-zinc-600"
                          >
                            Ver
                          </button>
                          <button
                            onClick={() => downloadReceiptFile(t.id)}
                            className="rounded-lg border border-zinc-800 px-3 py-1 hover:border-zinc-600"
                          >
                            Baixar
                          </button>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>

                    {canEdit && (
                      <td className="py-2 pr-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEdit(t)}
                            className="rounded-lg border border-zinc-800 px-3 py-1 hover:border-zinc-600"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => deleteTx(t)}
                            className="rounded-lg border border-red-900/60 text-red-200 px-3 py-1 hover:border-red-700"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}

              {filteredTxs.length === 0 && (
                <tr>
                  <td className="py-4 text-zinc-500" colSpan={canEdit ? 8 : 7}>
                    Nenhuma transação encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal simples */}
      {canEdit && editOpen && editTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Editar registro</div>
                <div className="text-sm text-zinc-400">
                  {editTx.type === "in" ? "Entrada" : "Saída"}
                  {editTx.type === "in" && editTx.player_name ? ` • ${editTx.player_name}` : ""}
                </div>
              </div>
              <button className="text-zinc-400 hover:text-zinc-200" onClick={() => setEditOpen(false)}>
                ✕
              </button>
            </div>

            <div className="mt-4 grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-zinc-300">Data</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
                  value={eDate}
                  onChange={(e) => setEDate(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm text-zinc-300">Valor</label>
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
                  value={Number.isFinite(eAmount) ? eAmount : 0}
                  onChange={(e) => setEAmount(Number(e.target.value))}
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm text-zinc-300">Descrição</label>
                <input
                  className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
                  value={eDesc}
                  onChange={(e) => setEDesc(e.target.value)}
                />
              </div>

              {editTx.type === "in" && (
                <div className="md:col-span-2">
                  <label className="text-sm text-zinc-300">Ano (alvo)</label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
                    value={eYear}
                    onChange={(e) => setEYear(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="Ex: 2025"
                  />
                  <div className="mt-1 text-xs text-zinc-500">
                    Ao salvar, o sistema recalcula as allocations dessa entrada.
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeEdit}
                className="rounded-xl border border-zinc-800 px-4 py-2 hover:border-zinc-600"
              >
                Cancelar
              </button>
              <button
                onClick={saveEdit}
                disabled={loading || !isUuid(editTx.id)}
                className="rounded-xl bg-zinc-100 text-zinc-950 px-4 py-2 font-medium disabled:opacity-60"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
