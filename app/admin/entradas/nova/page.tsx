"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAdminRole } from "@/components/admin/admin-role-provider";
import { AdminOnlyNotice } from "@/components/admin/admin-access-notice";

type Player = { id: string; full_name: string };

function safeYearFromDate(dateISO: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return "";
  const y = new Date(dateISO + "T00:00:00").getFullYear();
  return Number.isFinite(y) ? String(y) : "";
}

export default function NovaEntradaPage() {
  const { loading: roleLoading, isAdmin } = useAdminRole();
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState<string>(""); // "" => sem jogador
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState("");

  // ano alvo (só faz sentido quando tem jogador)
  const computedYear = useMemo(() => safeYearFromDate(date), [date]);
  const [targetYear, setTargetYear] = useState<string>("");

  useEffect(() => {
    setTargetYear(computedYear);
  }, [computedYear]);

  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("players").select("id, full_name").order("full_name");
      setPlayers((data ?? []) as Player[]);
    })();
  }, []);

  const hasPlayer = !!playerId;

  async function submit() {
    setMsg(null);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setMsg("Data inválida.");
      return;
    }
    if (!(amount > 0)) {
      setMsg("Informe um valor maior que zero.");
      return;
    }
    if (hasPlayer && !/^\d{4}$/.test(targetYear || "")) {
      setMsg("Ano alvo inválido.");
      return;
    }

    setLoading(true);

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      setMsg("Sessão inválida. Faça login novamente.");
      setLoading(false);
      return;
    }

    const payload = {
      date,
      amount,
      description: description || undefined,
      player_id: hasPlayer ? playerId : null, // ✅ null para patrocínio
      target_year: hasPlayer ? Number(targetYear) : null,
    };

    const res = await fetch("/api/admin/entries/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setMsg(json?.error ?? "Erro ao salvar.");
      return;
    }

    setMsg(
      hasPlayer
        ? `Entrada criada. Alocações: ${json.allocations_created}`
        : "Entrada criada (sem jogador)."
    );

    setAmount(0);
    setDescription("");
    // mantém seleção do jogador como está
  }

  if (roleLoading) {
    return <div className="text-zinc-400">Carregando...</div>;
  }

  if (!isAdmin) {
    return (
      <AdminOnlyNotice
        title="Nova entrada"
        description="Somente administradores podem lancar novas entradas."
        backHref="/admin/financeiro"
      />
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nova Entrada</h1>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <div>
          <label className="text-sm text-zinc-300">Jogador (opcional)</label>
          <select
            className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
          >
            <option value="">Sem jogador (patrocínio / doação)</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          <div className="text-xs text-zinc-500 mt-1">
            Se não selecionar jogador, a entrada não será alocada em mensalidades.
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm text-zinc-300">Data</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-zinc-300">Valor</label>
            <input
              type="number"
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
              value={Number.isFinite(amount) ? amount : 0}
              onChange={(e) => setAmount(Number(e.target.value))}
              min={0}
              step="0.01"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-300">Ano alvo</label>
            <input
              disabled={!hasPlayer}
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-400 disabled:opacity-60"
              value={hasPlayer ? targetYear : "-"}
              onChange={(e) => setTargetYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="2025"
            />
            <div className="text-xs text-zinc-500 mt-1">
              {hasPlayer ? "Para entradas com jogador, o ano define onde abater as mensalidades." : "Não aplicável."}
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm text-zinc-300">Descrição</label>
          <input
            className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={hasPlayer ? "Ex: mensalidade / acerto..." : "Ex: patrocínio / doação..."}
          />
        </div>

        <button
          onClick={submit}
          disabled={loading || amount <= 0 || (hasPlayer && !playerId)}
          className="rounded-xl bg-zinc-100 text-zinc-950 px-4 py-2 font-medium disabled:opacity-60"
        >
          {loading ? "Salvando..." : "Salvar"}
        </button>

        {msg && <div className="text-sm text-zinc-200">{msg}</div>}
      </div>
    </div>
  );
}
