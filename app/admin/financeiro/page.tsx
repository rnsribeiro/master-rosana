"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

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

function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function ymLabel(dateISO: string) {
  const d = new Date(dateISO + "T00:00:00");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${mm}/${d.getFullYear()}`;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default function FinanceiroAdminPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      const sData = await sRes.json().catch(() => ({}));
      const tData = await tRes.json().catch(() => ({}));

      if (!sRes.ok) throw new Error(sData?.error ?? "Erro ao carregar resumo.");
      if (!tRes.ok) throw new Error(tData?.error ?? "Erro ao carregar transações.");

      setSummary({
        totalIn: n(sData.totalIn),
        totalOut: n(sData.totalOut),
        cash: n(sData.cash),
        totalOpenDue: n(sData.totalOpenDue),
      });

      setTxs(
        (tData.transactions ?? []).map((t: any) => ({
          ...t,
          amount: n(t.amount),
          target_year: t.target_year == null ? null : Number(t.target_year),
          player_name: t.player_name ?? t.players?.full_name ?? null,
        }))
      );
    } catch (e: any) {
      setError(e?.message ?? "Falha ao carregar.");
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

  function openEdit(t: TxRow) {
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
    } catch (e: any) {
      setError(e?.message ?? "Falha ao salvar.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteTx(t: TxRow) {
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
    } catch (e: any) {
      setError(e?.message ?? "Falha ao excluir.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Financeiro</h1>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-xl bg-zinc-100 text-zinc-950 px-4 py-2 font-medium disabled:opacity-60"
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
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
                <th className="text-left py-2 pr-4">Ações</th>
              </tr>
            </thead>

            <tbody>
              {txs.map((t) => {
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
                    <td className="py-2 pr-4">{t.receipt_path ? <span className="text-zinc-300">OK</span> : "-"}</td>

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
                  </tr>
                );
              })}

              {txs.length === 0 && (
                <tr>
                  <td className="py-4 text-zinc-500" colSpan={8}>
                    Nenhuma transação encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal simples */}
      {editOpen && editTx && (
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
