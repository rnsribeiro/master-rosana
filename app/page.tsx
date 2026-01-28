"use client";

import { useState } from "react";

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

function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export default function Home() {
  const [nameQuery, setNameQuery] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    setError(null);
    setStatement(null);
    setPlayerName(null);

    if (nameQuery.trim().length < 2) {
      setError("Digite pelo menos 2 caracteres do nome.");
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      setError("PIN deve ter exatamente 6 números.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/player-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nameQuery, pin }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Erro ao buscar.");
        return;
      }

      if (!data.found) {
        setError("Não encontrado. Verifique nome e PIN.");
        return;
      }

      setPlayerName(data.player.full_name);
      setStatement(data.statement);
    } catch {
      setError("Falha de rede.");
    } finally {
      setLoading(false);
    }
  }

  function statusLabel(s: Statement["months"][number]["status"]) {
    if (s === "paid") return "Pago";
    if (s === "partial") return "Parcial";
    if (s === "due") return "Em aberto";
    return "Mensalidade não configurada";
  }

  function rowClasses(status: Statement["months"][number]["status"]) {
    if (status === "paid") return "bg-emerald-950/30 border-emerald-900/50 text-emerald-300";
    if (status === "partial" || status === "due")
      return "bg-red-950/30 border-red-900/50 text-red-300";
    return "bg-zinc-950/40 text-zinc-400";
  }

  // ✅ normaliza para evitar undefined
  const safe = statement
    ? {
        ...statement,
        credit: n(statement.credit),
        summary: {
          totalPaid: n(statement.summary?.totalPaid),
          totalAllocated: n(statement.summary?.totalAllocated),
          totalForgiven: n(statement.summary?.totalForgiven),
          totalDue: n(statement.summary?.totalDue),
        },
        months: statement.months.map((m) => ({
          ...m,
          fee: n(m.fee),
          paid: n(m.paid),
          forgiven: n(m.forgiven),
          due: n(m.due),
        })),
        payments: statement.payments.map((p) => ({
          ...p,
          amount: n(p.amount),
        })),
      }
    : null;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Consulta de Contribuições</h1>
            <p className="text-zinc-400 mt-1">
              Digite parte do seu nome e seu PIN de 6 dígitos para ver seus pagamentos.
            </p>
          </div>

          {/* link para o admin */}
          <a
            href="/admin"
            className="text-sm text-zinc-300 hover:text-zinc-100 underline underline-offset-4"
          >
            Acessar Admin
          </a>
        </div>

        <div className="mt-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
          <div className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-sm text-zinc-300 mb-1">Nome</label>
              <input
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none focus:border-zinc-600"
                placeholder="Ex: Rodrigo"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-300 mb-1">PIN</label>
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none focus:border-zinc-600 tracking-widest"
                placeholder="000000"
              />
            </div>
          </div>

          <button
            onClick={handleSearch}
            disabled={loading}
            className="mt-4 w-full md:w-auto rounded-xl px-4 py-2 bg-zinc-100 text-zinc-950 font-medium disabled:opacity-60"
          >
            {loading ? "Buscando..." : "Buscar"}
          </button>

          {error && (
            <div className="mt-4 text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-xl p-3">
              {error}
            </div>
          )}
        </div>

        {safe && (
          <div className="mt-6 space-y-6">
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
                      <tr key={`${m.year}-${m.month}`} className={`border-b ${rowClasses(m.status)}`}>
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
                      <div className="text-xs text-zinc-500">{p.description ?? "Sem descrição"}</div>
                    </div>
                    <div className="font-semibold">R$ {p.amount.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
