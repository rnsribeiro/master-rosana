"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Player = { id: string; full_name: string };

export default function NovaEntradaPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState("");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      // lista via RLS (admin/admin_viewer tem select)
      const { data } = await supabase.from("players").select("id, full_name").order("full_name");
      setPlayers((data ?? []) as Player[]);
    })();
  }, []);

  async function submit() {
    setMsg(null);
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
        description,
        player_id: playerId,
        target_year: new Date(date).getFullYear(),
      }),
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setMsg(json?.error ?? "Erro ao salvar.");
      return;
    }

    setMsg(`Entrada criada. Alocações: ${json.allocations_created}`);
    setAmount(0);
    setDescription("");
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
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="text-sm text-zinc-300">Ano alvo</label>
            <input
              disabled
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-400"
              value={new Date(date).getFullYear()}
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-zinc-300">Descrição</label>
          <input
            className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: pagamento anual / acerto..."
          />
        </div>

        <button
          onClick={submit}
          disabled={loading || !playerId || amount <= 0}
          className="rounded-xl bg-zinc-100 text-zinc-950 px-4 py-2 font-medium disabled:opacity-60"
        >
          {loading ? "Salvando..." : "Salvar"}
        </button>

        {msg && <div className="text-sm text-zinc-200">{msg}</div>}
      </div>
    </div>
  );
}
