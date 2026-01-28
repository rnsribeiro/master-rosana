"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { generatePin6, sanitizePin, isValidPin } from "@/lib/utils/pin";
import { useRouter } from "next/navigation";

function isISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isMonthValue(s: string) {
  return /^\d{4}-\d{2}$/.test(s); // YYYY-MM
}
function monthToISOFirstDay(yyyyMm: string) {
  return `${yyyyMm}-01`;
}

export default function NovoJogadorPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [pin, setPin] = useState(generatePin6());

  // ✅ participação (data real de entrada)
  const [startedAt, setStartedAt] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // ✅ início de cobrança (mês/ano)
  // default: mês atual
  const [billingStartYm, setBillingStartYm] = useState<string>(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${mm}`;
  });

  const billingStartMonthISO = useMemo(() => {
    if (!isMonthValue(billingStartYm)) return null;
    return monthToISOFirstDay(billingStartYm);
  }, [billingStartYm]);

  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setMsg(null);

    const name = fullName.trim();
    if (name.length < 3) return setMsg("Digite o nome completo (mín. 3 caracteres).");
    if (!isValidPin(pin)) return setMsg("PIN inválido. Precisa ter exatamente 6 números.");
    if (!isISODate(startedAt)) return setMsg("Informe uma data válida de entrada (YYYY-MM-DD).");
    if (!billingStartMonthISO) return setMsg("Informe o mês de início de cobrança (YYYY-MM).");

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

    // cria período ativo + início de cobrança
    const { error: mErr } = await supabase.from("player_memberships").insert({
      player_id: playerId,
      started_at: startedAt,
      ended_at: null,
      billing_start_month: billingStartMonthISO, // ✅ aqui!
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

          <div>
            <label className="text-sm text-zinc-300">Data de entrada (participação)</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
            />
            <div className="text-xs text-zinc-500 mt-2">
              Define quando ele entrou no clube (histórico/participação).
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-zinc-300">Começa a pagar a partir de</label>
            <input
              type="month"
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none"
              value={billingStartYm}
              onChange={(e) => setBillingStartYm(e.target.value)}
            />
            <div className="text-xs text-zinc-500 mt-2">
              A cobrança só conta a partir desse mês (ex.: 2025-02). Janeiro anterior não vira dívida.
            </div>
          </div>

          <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-3">
            <div className="text-sm text-zinc-400">Será salvo como</div>
            <div className="text-zinc-200 font-mono">
              {billingStartMonthISO ?? "—"}
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
