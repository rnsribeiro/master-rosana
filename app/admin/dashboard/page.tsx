"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Player = {
  id: string;
  full_name: string;
};

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

function statusLabel(s: Statement["months"][number]["status"]) {
  if (s === "paid") return "Pago";
  if (s === "partial") return "Parcial";
  if (s === "due") return "Em aberto";
  return "Mensalidade não configurada";
}

function rowClassByStatus(status: Statement["months"][number]["status"]) {
  if (status === "paid") return "bg-emerald-950/35 border-emerald-900/40";
  if (status === "partial") return "bg-amber-950/30 border-amber-900/40";
  if (status === "due") return "bg-red-950/35 border-red-900/40";
  return "bg-zinc-950/20 border-zinc-900/50";
}

export default function DashboardAdminPage() {
  const searchParams = useSearchParams();
  const playerFromUrl = searchParams.get("playerId") ?? searchParams.get("player");

  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>("");

  const [statement, setStatement] = useState<Statement | null>(null);
  const [loadingStatement, setLoadingStatement] = useState(false);

  const [error, setError] = useState<string | null>(null);

  async function loadPlayers() {
    setLoadingPlayers(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/players");
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Erro ao carregar jogadores.");
        return;
      }

      const list = (data.players ?? []) as Player[];
      setPlayers(list);

      // ✅ auto-select via URL
      if (playerFromUrl) {
        const exists = list.some((p) => p.id === playerFromUrl);
        if (exists) setSelectedPlayerId(playerFromUrl);
      }
    } catch {
      setError("Falha de rede ao carregar jogadores.");
    } finally {
      setLoadingPlayers(false);
    }
  }

  async function loadStatement(playerId: string) {
    setLoadingStatement(true);
    setError(null);
    setStatement(null);

    try {
      const res = await fetch(`/api/admin/player-statement?playerId=${encodeURIComponent(playerId)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Erro ao carregar extrato do jogador.");
        return;
      }

      setPlayerName(data.player?.full_name ?? "");
      setStatement(data.statement ?? null);
    } catch {
      setError("Falha de rede ao carregar extrato.");
    } finally {
      setLoadingStatement(false);
    }
  }

  useEffect(() => {
    loadPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedPlayerId) return;
    loadStatement(selectedPlayerId);
  }, [selectedPlayerId]);

  const sortedPayments = useMemo(() => {
    const list = statement?.payments ?? [];
    return list.slice().sort((a, b) => (a.date > b.date ? -1 : 1));
  }, [statement]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard (Admin)</h1>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <div className="text-sm text-zinc-400">
          Selecione um jogador para ver mensalidades e pagamentos (sem PIN).
        </div>

        <div>
          <label className="text-sm text-zinc-300">Jogador</label>
          <select
            className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none"
            value={selectedPlayerId}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
            disabled={loadingPlayers}
          >
            <option value="">Selecione…</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-xl p-3">
            {error}
          </div>
        )}
      </div>

      {loadingStatement && (
        <div className="text-zinc-400">Carregando extrato…</div>
      )}

      {statement && (
        <div className="space-y-6">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
              <div>
                <div className="text-sm text-zinc-400">Jogador</div>
                <div className="text-lg font-semibold">{playerName}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-zinc-400">Crédito atual</div>
                <div className="text-2xl font-semibold">
                  R$ {Number(statement.credit ?? 0).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="mt-4 grid md:grid-cols-4 gap-3 text-sm">
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
                <div className="text-zinc-400">Total pago</div>
                <div className="font-semibold">R$ {Number(statement.summary?.totalPaid ?? 0).toFixed(2)}</div>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
                <div className="text-zinc-400">Total alocado</div>
                <div className="font-semibold">R$ {Number(statement.summary?.totalAllocated ?? 0).toFixed(2)}</div>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
                <div className="text-zinc-400">Total perdoado</div>
                <div className="font-semibold">R$ {Number(statement.summary?.totalForgiven ?? 0).toFixed(2)}</div>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
                <div className="text-zinc-400">Total em aberto</div>
                <div className="font-semibold">R$ {Number(statement.summary?.totalDue ?? 0).toFixed(2)}</div>
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
                  {statement.months.map((m) => (
                    <tr
                      key={`${m.year}-${m.month}`}
                      className={`border-b ${rowClassByStatus(m.status)}`}
                    >
                      <td className="py-2 pr-4">
                        {String(m.month).padStart(2, "0")}/{m.year}
                      </td>
                      <td className="py-2 pr-4">R$ {Number(m.fee ?? 0).toFixed(2)}</td>
                      <td className="py-2 pr-4">R$ {Number(m.paid ?? 0).toFixed(2)}</td>
                      <td className="py-2 pr-4">R$ {Number(m.forgiven ?? 0).toFixed(2)}</td>
                      <td className="py-2 pr-4">R$ {Number(m.due ?? 0).toFixed(2)}</td>
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
              {sortedPayments.map((p) => (
                <div
                  key={p.id}
                  className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3 flex items-start justify-between gap-3"
                >
                  <div>
                    <div className="text-sm text-zinc-300">
                      {new Date(p.date + "T00:00:00").toLocaleDateString("pt-BR")}
                    </div>
                    <div className="text-xs text-zinc-500">{p.description ?? "Sem descrição"}</div>
                  </div>
                  <div className="font-semibold">R$ {Number(p.amount ?? 0).toFixed(2)}</div>
                </div>
              ))}

              {sortedPayments.length === 0 && (
                <div className="text-sm text-zinc-400">Nenhum pagamento encontrado.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
