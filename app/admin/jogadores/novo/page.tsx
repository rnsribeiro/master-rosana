"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { generatePin6, sanitizePin, isValidPin } from "@/lib/utils/pin";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { DatePicker } from "@/components/date-picker";

function toISODate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export default function NovoJogadorPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [pin, setPin] = useState(generatePin6());
  const [startedDate, setStartedDate] = useState<Date>(() => new Date());
  const [notes, setNotes] = useState("");

  const startedAt = useMemo(() => toISODate(startedDate), [startedDate]);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setMsg(null);

    const name = fullName.trim();
    if (name.length < 3) return setMsg("Digite o nome completo (mín. 3 caracteres).");
    if (!isValidPin(pin)) return setMsg("PIN inválido. Precisa ter exatamente 6 números.");
    if (!startedAt) return setMsg("Informe a data de início do período.");

    setLoading(true);

    const { data: inserted, error: pErr } = await supabase
      .from("players")
      .insert({
        full_name: name,
        pin,
        notes: notes || null,
      })
      .select("id")
      .single();

    if (pErr) console.error("Erro ao inserir player:", pErr);

    let playerId = inserted?.id as string | undefined;

    // fallback: se não retornou id, busca pelo PIN (único)
    if (!playerId) {
      const { data: found, error: fErr } = await supabase
        .from("players")
        .select("id")
        .eq("pin", pin)
        .limit(1)
        .single();

      if (fErr) console.error("Falha ao buscar player pelo PIN:", fErr);
      playerId = found?.id as string | undefined;
    }

    if (!playerId) {
      setLoading(false);
      setMsg(
        "Jogador pode ter sido criado, mas não consegui obter o ID (verifique policies de SELECT na tabela players)."
      );
      return;
    }

    // cria período ativo
    const { error: mErr } = await supabase.from("player_memberships").insert({
      player_id: playerId,
      started_at: startedAt,
      ended_at: null,
    });

    if (mErr) {
      console.error("Erro ao criar membership:", mErr);

      // rollback: remove o player criado
      await supabase.from("players").delete().eq("id", playerId);

      setLoading(false);
      setMsg("Erro ao criar período de participação. Operação desfeita (rollback).");
      return;
    }

    setLoading(false);
    router.replace(`/admin/jogadores/${playerId}`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Novo Jogador</h1>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <div>
          <label className="text-sm text-zinc-300">Nome completo</label>
          <input
            className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ex: José Pereira Neto"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-zinc-300">PIN (6 dígitos) — editável</label>
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none font-mono tracking-widest"
              value={pin}
              onChange={(e) => setPin(sanitizePin(e.target.value))}
              placeholder="000000"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setPin(generatePin6())}
                className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 hover:border-zinc-600 text-sm"
              >
                Gerar PIN
              </button>
            </div>
          </div>

          {/* ✅ DATE EDITÁVEL (manual + calendário opcional) */}
          <div>
            <label className="text-sm text-zinc-300">Início do período (ativo)</label>

            <div className="mt-1 rounded-2xl bg-zinc-950 border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 mb-2">
                Salvo como: <span className="text-zinc-200">{startedAt}</span>
              </div>

              <DatePicker
                date={startedDate}
                onChange={(d) => {
                  if (d) setStartedDate(d);
                }}
                allowManualInput
                allowToday
                allowClear={false}
                placeholder="dd/MM/aaaa"
                className="items-start"
              />

              <div className="text-xs text-zinc-500 mt-2">
                O jogador será criado já com período ativo aberto nesta data.
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm text-zinc-300">Observações (opcional)</label>
          <textarea
            className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none min-h-24"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: entrou por indicação, mensalidade paga em dia..."
          />
        </div>

        <button
          onClick={save}
          disabled={loading}
          className="rounded-xl bg-zinc-100 text-zinc-950 px-4 py-2 font-medium disabled:opacity-60"
        >
          {loading ? "Salvando..." : "Criar jogador"}
        </button>

        {msg && (
          <div className="text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-xl p-3">
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
