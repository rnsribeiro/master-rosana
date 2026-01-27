"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Tx = {
  id: string;
  type: "in" | "out";
  date: string; // yyyy-mm-dd
  amount: number;
  description: string | null;
  player_id: string | null;

  // ✅ vem do JOIN: players:player_id(full_name)
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

export default function FinanceiroAdminPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    // agrega últimos 12 meses por (entradas, saídas)
    const map = new Map<string, { month: string; in: number; out: number }>();

    for (const t of txs) {
      const key = ymLabel(t.date);
      const row = map.get(key) ?? { month: key, in: 0, out: 0 };
      if (t.type === "in") row.in += t.amount;
      else row.out += t.amount;
      map.set(key, row);
    }

    // ordena por data real
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
          <div className="text-xl font-semibold text-emerald-400">
            R$ {totalIn.toFixed(2)}
          </div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
          <div className="text-sm text-zinc-400">Total de saídas</div>
          <div className="text-xl font-semibold text-red-400">
            R$ {totalOut.toFixed(2)}
          </div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
          <div className="text-sm text-zinc-400">Caixa atual</div>
          <div
            className={`text-xl font-semibold ${
              cash >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            R$ {cash.toFixed(2)}
          </div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
          <div className="text-sm text-zinc-400">Em aberto (todos)</div>
          <div className="text-xl font-semibold">R$ {openDue.toFixed(2)}</div>
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
        <h2 className="text-lg font-semibold mb-3">
          Entradas x Saídas (últimos 12 meses)
        </h2>
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
          Dica: se quiser cores específicas no gráfico (verde/verm), eu ajusto.
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

                {/* ✅ nova coluna */}
                <th className="text-left py-2 pr-4">Jogador</th>

                <th className="text-left py-2 pr-4">Ano</th>
                <th className="text-left py-2 pr-4">Comprovante</th>
              </tr>
            </thead>

            <tbody>
              {txs.map((t) => (
                <tr key={t.id} className="border-b border-zinc-900">
                  <td className="py-2 pr-4">
                    {new Date(t.date + "T00:00:00").toLocaleDateString("pt-BR")}
                  </td>

                  {/* ✅ cor por tipo */}
                  <td
                    className={`py-2 pr-4 font-medium ${
                      t.type === "in" ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {t.type === "in" ? "Entrada" : "Saída"}
                  </td>

                  <td className="py-2 pr-4">R$ {t.amount.toFixed(2)}</td>
                  <td className="py-2 pr-4">{t.description ?? "-"}</td>

                  {/* ✅ mostra nome só nas entradas */}
                  <td className="py-2 pr-4">
                    {t.type === "in" ? t.players?.full_name ?? "-" : "-"}
                  </td>

                  <td className="py-2 pr-4">{t.target_year ?? "-"}</td>
                  <td className="py-2 pr-4">
                    {t.receipt_path ? <span className="text-zinc-300">OK</span> : "-"}
                  </td>
                </tr>
              ))}

              {txs.length === 0 && (
                <tr>
                  <td className="py-4 text-zinc-500" colSpan={7}>
                    Nenhuma transação encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-zinc-500 mt-2">
          Obs: o nome do jogador aparece apenas nas entradas (pagamentos).
        </p>
      </div>
    </div>
  );
}
