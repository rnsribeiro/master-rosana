"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type Tx = {
  id: string;
  type: "in" | "out";
  date: string; // yyyy-mm-dd
  amount: number;
  description: string | null;
  player_id: string | null;

  // vem do JOIN: players:player_id(full_name)
  players?: { full_name: string } | null;

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

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function ymLabel(dateISO: string) {
  const d = new Date(dateISO + "T00:00:00");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${mm}/${d.getFullYear()}`;
}

function moneyInputToNumber(s: string) {
  const normalized = s.replace(/\s/g, "").replace(",", ".");
  const x = Number(normalized);
  return Number.isFinite(x) ? x : NaN;
}

export default function FinanceiroAdminPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Tx | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Tx | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [sRes, tRes] = await Promise.all([
        fetch("/api/admin/finance/summary"),
        fetch("/api/admin/finance/transactions?limit=500"),
      ]);

      const sData: any = await sRes.json();
      const tData: any = await tRes.json();

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
          players: t.players ?? null,
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

  async function saveEdit(next: {
    date: string;
    amount: number;
    description: string | null;
    target_year: number | null;
  }) {
    if (!editing) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/finance/transactions/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao salvar.");

      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/finance/transactions/${confirmDelete.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao excluir.");

      setConfirmDelete(null);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Falha ao excluir.");
    } finally {
      setSaving(false);
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
          <div className="text-xl font-semibold text-emerald-400">R$ {totalIn.toFixed(2)}</div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
          <div className="text-sm text-zinc-400">Total de saídas</div>
          <div className="text-xl font-semibold text-red-400">R$ {totalOut.toFixed(2)}</div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
          <div className="text-sm text-zinc-400">Caixa atual</div>
          <div className={`text-xl font-semibold ${cash >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            R$ {cash.toFixed(2)}
          </div>
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
        <p className="text-xs text-zinc-500 mt-2">
          Se quiser cores específicas no gráfico (verde/verm), eu ajusto.
        </p>
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
              {txs.map((t) => (
                <tr key={t.id} className="border-b border-zinc-900">
                  <td className="py-2 pr-4">
                    {new Date(t.date + "T00:00:00").toLocaleDateString("pt-BR")}
                  </td>

                  <td
                    className={`py-2 pr-4 font-medium ${
                      t.type === "in" ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {t.type === "in" ? "Entrada" : "Saída"}
                  </td>

                  <td className="py-2 pr-4">R$ {t.amount.toFixed(2)}</td>
                  <td className="py-2 pr-4">{t.description ?? "-"}</td>

                  {/* ✅ LINK pro dashboard já selecionando o jogador */}
                  <td className="py-2 pr-4">
                    {t.type === "in" ? (
                      t.player_id ? (
                        <a
                          href={`/admin/dashboard?player=${encodeURIComponent(t.player_id)}`}
                          className="underline text-zinc-200 hover:text-white"
                          title="Abrir no Dashboard"
                        >
                          {t.players?.full_name ?? "-"}
                        </a>
                      ) : (
                        t.players?.full_name ?? "-"
                      )
                    ) : (
                      "-"
                    )}
                  </td>

                  <td className="py-2 pr-4">{t.target_year ?? "-"}</td>
                  <td className="py-2 pr-4">
                    {t.receipt_path ? <span className="text-zinc-300">OK</span> : "-"}
                  </td>

                  <td className="py-2 pr-4">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(t)}
                        className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:border-zinc-500"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(t)}
                        className="rounded-lg border border-red-900/60 bg-red-950/30 px-2 py-1 text-xs text-red-300 hover:border-red-700"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

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

      {/* MODAL EDITAR */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">Editar registro</div>
                <div className="text-xs text-zinc-400">
                  {editing.type === "in" ? "Entrada" : "Saída"} •{" "}
                  {editing.type === "in" ? editing.players?.full_name ?? "—" : "—"}
                </div>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="text-zinc-400 hover:text-zinc-200"
                disabled={saving}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <EditForm
              tx={editing}
              saving={saving}
              onCancel={() => setEditing(null)}
              onSave={saveEdit}
            />
          </div>
        </div>
      )}

      {/* MODAL EXCLUIR */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
            <div className="text-lg font-semibold">Excluir registro?</div>
            <div className="text-sm text-zinc-300">
              {confirmDelete.type === "in" ? "Entrada" : "Saída"} em{" "}
              {new Date(confirmDelete.date + "T00:00:00").toLocaleDateString("pt-BR")} • R${" "}
              {confirmDelete.amount.toFixed(2)}
            </div>
            {confirmDelete.type === "in" && (
              <div className="text-xs text-zinc-400">
                Jogador: {confirmDelete.players?.full_name ?? "—"}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-xl border border-zinc-700 px-3 py-2 text-sm"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                onClick={doDelete}
                className="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                disabled={saving}
              >
                {saving ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditForm({
  tx,
  saving,
  onCancel,
  onSave,
}: {
  tx: { date: string; amount: number; description: string | null; target_year: number | null };
  saving: boolean;
  onCancel: () => void;
  onSave: (next: { date: string; amount: number; description: string | null; target_year: number | null }) => void;
}) {
  const [date, setDate] = useState(tx.date);
  const [amount, setAmount] = useState(String(tx.amount));
  const [desc, setDesc] = useState(tx.description ?? "");
  const [year, setYear] = useState(tx.target_year ? String(tx.target_year) : "");

  const parsedAmount = useMemo(() => moneyInputToNumber(amount), [amount]);

  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const amountOk = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const yearOk = year.trim() === "" || /^\d{4}$/.test(year.trim());

  const canSave = dateOk && amountOk && yearOk && !saving;

  return (
    <div className="mt-4 space-y-3">
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-zinc-300">Data</label>
          <input
            className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none focus:border-zinc-600"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            placeholder="yyyy-mm-dd"
          />
          {!dateOk && <div className="text-xs text-red-300 mt-1">Use o formato yyyy-mm-dd.</div>}
        </div>

        <div>
          <label className="text-sm text-zinc-300">Valor</label>
          <input
            className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none focus:border-zinc-600"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="20.00"
          />
          {!amountOk && <div className="text-xs text-red-300 mt-1">Informe um valor &gt; 0.</div>}
        </div>
      </div>

      <div>
        <label className="text-sm text-zinc-300">Descrição</label>
        <input
          className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none focus:border-zinc-600"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Opcional"
        />
      </div>

      <div>
        <label className="text-sm text-zinc-300">Ano (opcional)</label>
        <input
          className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none focus:border-zinc-600"
          value={year}
          onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="2025"
        />
        {!yearOk && <div className="text-xs text-red-300 mt-1">Ano inválido.</div>}
        <div className="text-xs text-zinc-500 mt-1">
          Para entradas, o ano é usado para alocar mensalidades (o sistema recalcula allocations ao salvar).
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="rounded-xl border border-zinc-700 px-3 py-2 text-sm"
          disabled={saving}
        >
          Cancelar
        </button>
        <button
          onClick={() =>
            onSave({
              date,
              amount: parsedAmount,
              description: desc.trim() ? desc.trim() : null,
              target_year: year.trim() ? Number(year) : null,
            })
          }
          className="rounded-xl bg-zinc-100 text-zinc-950 px-3 py-2 text-sm font-medium disabled:opacity-60"
          disabled={!canSave}
          title={!canSave ? "Verifique os campos antes de salvar." : "Salvar"}
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}
