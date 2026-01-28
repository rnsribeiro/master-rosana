"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { supabase } from "@/lib/supabase/client";
import { generatePin6, sanitizePin, isValidPin } from "@/lib/utils/pin";
import { toISODate } from "@/lib/utils/date";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/date-picker";

/* ===================== Types ===================== */

type Player = {
  id: string;
  full_name: string;
  pin: string;
  notes: string | null;
};

type Membership = {
  id: string;
  player_id: string;
  started_at: string; // YYYY-MM-DD
  ended_at: string | null; // YYYY-MM-DD | null
  billing_start_month: string | null; // YYYY-MM-01 | null
};

/* ===================== Utils ===================== */

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isISODate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isMonthValue(v: string) {
  return /^\d{4}-\d{2}$/.test(v); // YYYY-MM
}

function isoToMonthValue(isoDate: string) {
  // YYYY-MM-DD -> YYYY-MM
  return isoDate.slice(0, 7);
}

function monthValueToISOFirstDay(yyyyMm: string) {
  return `${yyyyMm}-01`;
}

function clampBillingMonthToStarted(startedAtISO: string, billingYm: string) {
  // garante que billingYm >= month(startedAt)
  const sYm = startedAtISO.slice(0, 7);
  return billingYm < sYm ? sYm : billingYm;
}

/* ===================== Page ===================== */

export default function EditarJogadorPage() {
  /* -------- id seguro -------- */
  const params = useParams();
  const rawId = String(params?.id ?? "");
  const playerId = useMemo(() => (isUuid(rawId) ? rawId : null), [rawId]);

  /* -------- estado -------- */
  const [player, setPlayer] = useState<Player | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);

  const [fullName, setFullName] = useState("");
  const [pin, setPin] = useState("");
  const [notes, setNotes] = useState("");

  // abrir novo período
  const [newStart, setNewStart] = useState<Date | undefined>(new Date());
  const [newBillingYm, setNewBillingYm] = useState<string>(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${mm}`;
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  /* ===================== Load ===================== */

  async function load() {
    if (!playerId) {
      setLoading(false);
      setPlayer(null);
      return;
    }

    setLoading(true);
    setMsg(null);

    const [{ data: p, error: pErr }, { data: m }] = await Promise.all([
      supabase.from("players").select("id, full_name, pin, notes").eq("id", playerId).single(),
      supabase
        .from("player_memberships")
        .select("id, player_id, started_at, ended_at, billing_start_month")
        .eq("player_id", playerId)
        .order("started_at", { ascending: true }),
    ]);

    if (pErr || !p) {
      setPlayer(null);
      setMemberships([]);
      setLoading(false);
      setMsg("Jogador não encontrado ou sem permissão.");
      return;
    }

    setPlayer(p);
    setFullName(p.full_name);
    setPin(p.pin);
    setNotes(p.notes ?? "");
    setMemberships((m ?? []) as Membership[]);
    setLoading(false);
  }

  useEffect(() => {
    if (playerId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  const activeMembership = memberships.find((m) => m.ended_at === null) ?? null;

  /* ===================== Actions ===================== */

  async function savePlayer() {
    if (!playerId) return;
    setMsg(null);

    const name = fullName.trim();
    if (name.length < 3) return setMsg("Nome inválido.");
    if (!isValidPin(pin)) return setMsg("PIN inválido (6 números).");

    setSaving(true);
    const { error } = await supabase
      .from("players")
      .update({ full_name: name, pin, notes: notes || null })
      .eq("id", playerId);
    setSaving(false);

    if (error) return setMsg("Erro ao salvar jogador.");

    setMsg("Jogador salvo com sucesso.");
    await load();
  }

  async function openNewMembership() {
    if (!playerId) return;
    if (!newStart) return setMsg("Selecione a data de início.");
    if (activeMembership) return setMsg("Já existe um período ativo.");

    const startedAtISO = toISODate(newStart);
    if (!isISODate(startedAtISO)) return setMsg("Data de início inválida.");
    if (!isMonthValue(newBillingYm)) return setMsg("Mês de início de cobrança inválido.");

    const billingYm = clampBillingMonthToStarted(startedAtISO, newBillingYm);
    const billingStartISO = monthValueToISOFirstDay(billingYm);

    setSaving(true);
    const { error } = await supabase.from("player_memberships").insert({
      player_id: playerId,
      started_at: startedAtISO,
      ended_at: null,
      billing_start_month: billingStartISO,
    });
    setSaving(false);

    if (error) return setMsg("Erro ao abrir novo período.");

    setMsg("Novo período aberto.");
    await load();
  }

  async function closeActiveMembership() {
    if (!activeMembership) return;

    setSaving(true);
    const { error } = await supabase
      .from("player_memberships")
      .update({ ended_at: toISODate(new Date()) })
      .eq("id", activeMembership.id);
    setSaving(false);

    if (error) return setMsg("Erro ao encerrar período.");

    setMsg("Período encerrado.");
    await load();
  }

  async function updateMembership(params: {
    memId: string;
    started: Date;
    ended?: Date;
    billingYm: string; // YYYY-MM
  }) {
    const { memId, started, ended, billingYm } = params;

    if (ended && ended < started) return setMsg("A data final não pode ser anterior à inicial.");

    const startedISO = toISODate(started);
    if (!isISODate(startedISO)) return setMsg("Data inicial inválida.");
    if (!isMonthValue(billingYm)) return setMsg("Mês de início de cobrança inválido.");

    const safeBillingYm = clampBillingMonthToStarted(startedISO, billingYm);
    const billingISO = monthValueToISOFirstDay(safeBillingYm);

    setSaving(true);
    const { error } = await supabase
      .from("player_memberships")
      .update({
        started_at: startedISO,
        ended_at: ended ? toISODate(ended) : null,
        billing_start_month: billingISO,
      })
      .eq("id", memId);
    setSaving(false);

    if (error) return setMsg("Erro ao atualizar período.");

    await load();
  }

  async function deleteMembership(memId: string) {
    setSaving(true);
    const { error } = await supabase.from("player_memberships").delete().eq("id", memId);
    setSaving(false);

    if (error) return setMsg("Erro ao remover período.");

    await load();
  }

  /* ===================== Render ===================== */

  if (loading) return <div className="text-zinc-400">Carregando…</div>;

  if (!playerId) {
    return (
      <div className="space-y-3">
        <div className="text-red-400">ID inválido na URL.</div>
        <Link href="/admin/jogadores" className="underline">
          Voltar
        </Link>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="space-y-3">
        <div className="text-red-400">Jogador não encontrado.</div>
        <Link href="/admin/jogadores" className="underline">
          Voltar
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Editar Jogador</h1>
          <p className="text-sm text-zinc-400">
            Nome e PIN editáveis. Períodos podem ser pausados e retomados.
          </p>
        </div>

        <Link href="/admin/jogadores" className="rounded-xl border border-zinc-800 px-4 py-2">
          Voltar
        </Link>
      </div>

      {/* Player */}
      <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-400">Nome</label>
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-zinc-400">PIN</label>
            <div className="mt-1 flex gap-2">
              <input
                className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none font-mono"
                value={pin}
                onChange={(e) => setPin(sanitizePin(e.target.value))}
              />
              <Button type="button" variant="outline" onClick={() => setPin(generatePin6())} disabled={saving}>
                Gerar
              </Button>
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs text-zinc-400">Observações</label>
          <textarea
            className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none min-h-24"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observações"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={savePlayer} disabled={saving}>
            Salvar jogador
          </Button>
          {msg && <div className="text-sm text-zinc-300">{msg}</div>}
        </div>
      </div>

      {/* Memberships */}
      <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <h2 className="text-lg font-semibold">Participação</h2>
          {activeMembership ? (
            <div className="text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-900/40 rounded-xl px-3 py-2">
              Período ativo em aberto
            </div>
          ) : (
            <div className="text-xs text-zinc-400">Sem período ativo</div>
          )}
        </div>

        {/* Abrir novo período */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
          <div className="text-sm font-medium">Abrir novo período</div>
          <div className="text-xs text-zinc-500 mt-1">
            Você pode cadastrar o jogador hoje, mas fazer ele começar a pagar só a partir de um mês específico.
          </div>

          <div className="mt-4 grid md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-zinc-400">Início do período (participação)</label>
              <div className="mt-1">
                <DatePicker date={newStart} onChange={setNewStart} />
              </div>
            </div>

            <div className="px-2">
              <label className="text-xs text-zinc-400">Começa a pagar a partir de</label>
              <input
                type="month"
                className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none"
                value={newBillingYm}
                onChange={(e) => setNewBillingYm(e.target.value)}
              />
              <div className="text-xs text-zinc-500 mt-1">Cobrança conta só a partir deste mês.</div>
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={openNewMembership} disabled={saving}>
                Abrir período
              </Button>
              <Button
                variant="outline"
                onClick={closeActiveMembership}
                disabled={saving || !activeMembership}
                title={!activeMembership ? "Não há período ativo para encerrar" : ""}
              >
                Encerrar hoje
              </Button>
            </div>
          </div>
        </div>

        {/* Períodos existentes */}
        <div className="space-y-3">
          <div className="text-sm font-medium">Períodos cadastrados</div>

          {memberships.map((m) => {
            const startedDate = new Date(m.started_at + "T00:00:00");
            const endedDate = m.ended_at ? new Date(m.ended_at + "T00:00:00") : undefined;

            const billingYmInitial =
              m.billing_start_month && isISODate(m.billing_start_month)
                ? isoToMonthValue(m.billing_start_month)
                : isoToMonthValue(m.started_at);

            return (
              <MembershipRow
                key={m.id}
                membership={m}
                startedDate={startedDate}
                endedDate={endedDate}
                billingYmInitial={billingYmInitial}
                saving={saving}
                onSave={(started, ended, billingYm) => updateMembership({ memId: m.id, started, ended, billingYm })}
                onDelete={() => deleteMembership(m.id)}
              />
            );
          })}

          {memberships.length === 0 && (
            <div className="text-sm text-zinc-400">
              Nenhum período. Abra um período para o jogador começar a contribuir.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== Subcomponent ===================== */

function MembershipRow(props: {
  membership: Membership;
  startedDate: Date;
  endedDate?: Date;
  billingYmInitial: string;
  saving: boolean;
  onSave: (started: Date, ended: Date | undefined, billingYm: string) => void;
  onDelete: () => void;
}) {
  const { membership, startedDate, endedDate, billingYmInitial, saving, onSave, onDelete } = props;

  const [started, setStarted] = useState<Date | undefined>(startedDate);
  const [ended, setEnded] = useState<Date | undefined>(endedDate);
  const [billingYm, setBillingYm] = useState<string>(billingYmInitial);

  function doSave() {
    if (!started) return;
    onSave(started, ended, billingYm);
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="grid md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-4">
          <label className="text-xs text-zinc-400">Início</label>
          <div className="mt-1">
            <DatePicker
              date={started}
              onChange={(d) => {
                if (!d) return;
                setStarted(d);
              }}
            />
          </div>
        </div>

        <div className="md:col-span-4">
          <label className="text-xs text-zinc-400">Fim</label>
          <div className="mt-1">
            <DatePicker
              date={ended}
              onChange={(d) => setEnded(d)}
              placeholder="Em aberto"
            />
          </div>
        </div>

        <div className="md:col-span-4">
          <label className="text-xs text-zinc-400">Começa a pagar</label>
          <input
            type="month"
            className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none"
            value={billingYm}
            onChange={(e) => setBillingYm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                doSave();
              }
            }}
          />
        </div>

        <div className="md:col-span-12 flex flex-wrap items-center justify-between gap-2 mt-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={doSave} disabled={saving || !started}>
              Salvar período
            </Button>
            <Button variant="outline" onClick={onDelete} disabled={saving}>
              Remover
            </Button>

            {membership.ended_at === null && (
              <span className="text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-900/40 rounded-xl px-2 py-1">
                Ativo
              </span>
            )}
          </div>

          <div className="text-[11px] text-zinc-500">
            ID: <span className="font-mono">{membership.id}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
