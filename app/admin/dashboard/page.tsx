"use client";

import { useEffect, useMemo, useState } from "react";

type PlayerOpt = { id: string; full_name: string };

type Statement = {
  months: Array<{
    year: number;
    month: number;
    fee: number;
    paid: number;
    forgiven: number;
    due: number;
    status: "paid" | "partial" | "due" | "no_fee_config";
  }>;
  credit: number;
  payments: Array<{
    id: string;
    date: string;
    amount: number;
    description: string | null;
    target_year: number | null;
  }>;
  summary: {
    totalPaid: number;
    totalAllocated: number;
    totalForgiven: number;
    totalDue: number;
  };
};

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function statusLabel(s: Statement["months"][number]["status"]) {
  if (s === "paid") return "Pago";
  if (s === "partial") return "Parcial";
  if (s === "due") return "Em aberto";
  return "Mensalidade não configurada";
}

function rowClassesByStatus(status: Statement["months"][number]["status"]) {
  if (status === "paid") {
    return "bg-emerald-950/30 border-emerald-900/50 text-emerald-300";
  }
  if (status === "partial" || status === "due") {
    return "bg-red-950/30 border-red-900/50 text-red-300";
  }
  return "bg-zinc-950/40 text-zinc-400";
}

export default function AdminDashboardPage() {
  const [players, setPlayers] = useState<PlayerOpt[]>([]);
  const [playerId, setPlayerId] = useState<string>("");
  const [playerName, setPlayerName] = useState<string | null>(null);

  const [statement, setStatement] = useState<Statement | null>(null);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingPlayers(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/players");
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Erro ao carregar jogadores.");
        setPlayers(data.players ?? []);
      } catch (e: any) {
        setError(e?.message ?? "Falha ao carregar jogadores.");
      } finally {
        setLoadingPlayers(false);
      }
    })();
  }, []);

  async function loadStatement(id: string) {
    setPlayerId(id);
    setStatement(null);
    setPlayerName(null);
    setError(null);

    if (!id) return;

    setLoadingStatement(true);
    try {
      const res = await fetch(`/api/admin/player-statement?playerId=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao carregar extrato.");

      setPlayerName(data.player?.full_name ?? null);
      setStatement(data.statement ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Falha ao carregar extrato.");
    } finally {
      setLoadingStatement(false);
    }
  }

  const safe = useMemo(() => {
    if (!statement) return null;
    return {
      credit: n(statement.credit),
      summary: {
        totalPaid: n(statement.summary?.totalPaid),
        totalAllocated: n(statement.summary?.totalAllocated),
        totalForgiven: n(statement.summary?.totalForgiven),
        totalDue: n(statement.summary?.totalDue),
      },
      months: (statement.months ?? []).map((m) => ({
        ...m,
        fee: n(m.fee),
        paid: n(m.paid),
        forgiven: n(m.forgiven),
        due: n(m.due),
      })),
      payments: (statement.payments ?? []).map((p) => ({ ...p, amount: n(p.amount) })),
    };
  }, [statement]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard (Admin)</h1>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <div className="text-sm text-zinc-400">
          Selecione um jogador para ver mensalidades e pagamentos (sem PIN).
        </div>

        <div className="flex flex-col md:flex-row gap-3 items-start md:items-end">
          <div className="w-full md:w-105">
            <label className="text-sm text-zinc-300">Jogador</label>
            <select
              value={playerId}
              onChange={(e) => loadStatement(e.target.value)}
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none focus:border-zinc-600"
              disabled={loadingPlayers}
            >
              <option value="">
                {loadingPlayers ? "Carregando..." : "Selecione..."}
              </option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>

          {loadingStatement && (
            <div className="text-sm text-zinc-400 mt-2 md:mt-0">Carregando extrato...</div>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-xl p-3">
            {error}
          </div>
        )}
      </div>

      {safe && (
        <div className="space-y-6">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
              <div>
                <div className="text-sm text-zinc-400">Jogador</div>
                <div className="text-lg font-semibold">{playerName}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-zinc-400">Crédito atual</div>
                <div className="text-2xl font-semibold">R$ {safe.credit.toFixed(2)}</div>
              </div>
            </div>

            <div className="mt-4 grid md:grid-cols-4 gap-3 text-sm">
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
                <div className="text-zinc-400">Total pago</div>
                <div className="font-semibold">R$ {safe.summary.totalPaid.toFixed(2)}</div>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
                <div className="text-zinc-400">Total alocado</div>
                <div className="font-semibold">R$ {safe.summary.totalAllocated.toFixed(2)}</div>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
                <div className="text-zinc-400">Total perdoado</div>
                <div className="font-semibold">R$ {safe.summary.totalForgiven.toFixed(2)}</div>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
                <div className="text-zinc-400">Total em aberto</div>
                <div className="font-semibold">R$ {safe.summary.totalDue.toFixed(2)}</div>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
            <h2 className="text-lg font-semibold">Mensalidades (mês a mês)</h2>
            <div className="overflow-x-auto mt-3">
              <table className="min-w-full text-sm">
                <thead className="text-zinc-400">
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 pr-4">Mês</th>
                    <th className="text-left py-2 pr-4">Mensalidade</th>
                    <th className="text-left py-2 pr-4">Pago</th>
                    <th className="text-left py-2 pr-4">Perdoado</th>
                    <th className="text-left py-2 pr-4">Em aberto</th>
                    <th className="text-left py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {safe.months.map((m) => (
                    <tr
                      key={`${m.year}-${m.month}`}
                      className={`border-b ${rowClassesByStatus(m.status)}`}
                    >
                      <td className="py-2 pr-4">
                        {String(m.month).padStart(2, "0")}/{m.year}
                      </td>
                      <td className="py-2 pr-4">R$ {m.fee.toFixed(2)}</td>
                      <td className="py-2 pr-4">R$ {m.paid.toFixed(2)}</td>
                      <td className="py-2 pr-4">R$ {m.forgiven.toFixed(2)}</td>
                      <td className="py-2 pr-4">R$ {m.due.toFixed(2)}</td>
                      <td className="py-2 pr-4 font-medium">{statusLabel(m.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
            <h2 className="text-lg font-semibold">Pagamentos</h2>
            <div className="mt-3 space-y-2">
              {safe.payments.map((p) => (
                <div
                  key={p.id}
                  className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3 flex items-start justify-between gap-3"
                >
                  <div>
                    <div className="text-sm text-zinc-300">
                      {new Date(p.date + "T00:00:00").toLocaleDateString("pt-BR")}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {p.description ?? "Sem descrição"}
                    </div>
                  </div>
                  <div className="font-semibold">R$ {p.amount.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
