"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Player = { id: string; full_name: string };

function safeYearFromDate(dateISO: string) {
  const d = new Date(dateISO + "T00:00:00");
  const y = d.getFullYear();
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

export default function NovaEntradaPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState("");

  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState("");

  // ✅ Ano alvo editável
  const defaultYear = useMemo(() => safeYearFromDate(date), [date]);
  const [targetYear, setTargetYear] = useState<number>(() =>
    safeYearFromDate(new Date().toISOString().slice(0, 10))
  );

  // quando a data mudar, só atualiza o targetYear automaticamente se o usuário ainda não mexeu nele
  const [yearTouched, setYearTouched] = useState(false);
  useEffect(() => {
    if (!yearTouched) setTargetYear(defaultYear);
  }, [defaultYear, yearTouched]);

  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("players").select("id, full_name").order("full_name");
      setPlayers((data ?? []) as Player[]);
    })();
  }, []);

  async function submit() {
    setMsg(null);

    if (!playerId) return setMsg("Selecione um jogador.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setMsg("Data inválida.");
    if (!(amount > 0)) return setMsg("Valor deve ser maior que zero.");

    const y = Number(targetYear);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      return setMsg("Ano alvo inválido (use algo entre 2000 e 2100).");
    }

    setLoading(true);

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      setMsg("Sessão inválida. Faça login novamente.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/admin/entries/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        date,
        amount,
        description: description || null,
        player_id: playerId,
        target_year: y, // ✅ usa o ano escolhido
      }),
    });

    const json = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setMsg(json?.error ?? "Erro ao salvar.");
      return;
    }

    setMsg(`Entrada criada. Alocações: ${json.allocations_created}`);
    setAmount(0);
    setDescription("");
    setYearTouched(false);
    setTargetYear(defaultYear);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nova Entrada</h1>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <div>
          <label className="text-sm text-zinc-300">Jogador</label>
          <select
            className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
          >
            <option value="">Selecione...</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
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
              inputMode="decimal"
              step="0.01"
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
              value={Number.isFinite(amount) ? amount : 0}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-sm text-zinc-300">Ano alvo</label>
            <input
              type="number"
              inputMode="numeric"
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
              value={targetYear}
              onChange={(e) => {
                setYearTouched(true);
                setTargetYear(Number(e.target.value));
              }}
            />
            <div className="mt-1 text-xs text-zinc-500">
              Ex: pagar em 2026 mas abater 2025.
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm text-zinc-300">Descrição</label>
          <input
            className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: acerto de mensalidades 2025"
          />
        </div>

        <button
          onClick={submit}
          disabled={loading || !playerId || amount <= 0}
          className="rounded-xl bg-zinc-100 text-zinc-950 px-4 py-2 font-medium disabled:opacity-60"
        >
          {loading ? "Salvando..." : "Salvar"}
        </button>

        {msg && (
          <div className="text-sm text-zinc-200 bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
