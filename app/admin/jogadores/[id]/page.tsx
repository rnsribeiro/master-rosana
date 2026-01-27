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
  started_at: string;
  ended_at: string | null;
};

/* ===================== Utils ===================== */

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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

  const [newStart, setNewStart] = useState<Date | undefined>(new Date());

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

    const [{ data: p, error: pErr }, { data: m, error: mErr }] =
      await Promise.all([
        supabase
          .from("players")
          .select("id, full_name, pin, notes")
          .eq("id", playerId)
          .single(),

        supabase
          .from("player_memberships")
          .select("id, player_id, started_at, ended_at")
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
    setMemberships(m ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (playerId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  const activeMembership =
    memberships.find((m) => m.ended_at === null) ?? null;

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
      .update({
        full_name: name,
        pin,
        notes: notes || null,
      })
      .eq("id", playerId);
    setSaving(false);

    if (error) {
      setMsg("Erro ao salvar jogador.");
      return;
    }

    setMsg("Jogador salvo com sucesso.");
    await load();
  }

  async function openNewMembership() {
    if (!playerId) return;
    if (!newStart) return setMsg("Selecione a data de início.");

    if (activeMembership) {
      return setMsg("Já existe um período ativo.");
    }

    setSaving(true);
    const { error } = await supabase.from("player_memberships").insert({
      player_id: playerId,
      started_at: toISODate(newStart),
      ended_at: null,
    });
    setSaving(false);

    if (error) {
      setMsg("Erro ao abrir novo período.");
      return;
    }

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

    if (error) {
      setMsg("Erro ao encerrar período.");
      return;
    }

    setMsg("Período encerrado.");
    await load();
  }

  async function updateMembership(
    memId: string,
    started: Date | undefined,
    ended: Date | undefined
  ) {
    if (!started) return;

    if (ended && ended < started) {
      setMsg("A data final não pode ser anterior à inicial.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("player_memberships")
      .update({
        started_at: toISODate(started),
        ended_at: ended ? toISODate(ended) : null,
      })
      .eq("id", memId);
    setSaving(false);

    if (error) {
      setMsg("Erro ao atualizar período.");
      return;
    }

    await load();
  }

  async function deleteMembership(memId: string) {
    setSaving(true);
    const { error } = await supabase
      .from("player_memberships")
      .delete()
      .eq("id", memId);
    setSaving(false);

    if (error) {
      setMsg("Erro ao remover período.");
      return;
    }

    await load();
  }

  /* ===================== Render ===================== */

  if (loading) {
    return <div className="text-zinc-400">Carregando…</div>;
  }

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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Editar Jogador</h1>
          <p className="text-sm text-zinc-400">
            Nome e PIN editáveis. Períodos podem ser pausados e retomados.
          </p>
        </div>

        <Link
          href="/admin/jogadores"
          className="rounded-xl border border-zinc-800 px-4 py-2"
        >
          Voltar
        </Link>
      </div>

      {/* Player */}
      <div className="space-y-3 rounded-2xl border border-zinc-800 p-4">
        <input
          className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />

        <input
          className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono"
          value={pin}
          onChange={(e) => setPin(sanitizePin(e.target.value))}
        />

        <textarea
          className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observações"
        />

        <Button onClick={savePlayer} disabled={saving}>
          Salvar jogador
        </Button>

        {msg && (
          <div className="text-sm text-zinc-200 bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
            {msg}
          </div>
        )}
      </div>

      {/* Memberships */}
      <div className="space-y-4 rounded-2xl border border-zinc-800 p-4">
        <h2 className="text-lg font-semibold">Participação</h2>

        <div className="flex items-center gap-3">
          <DatePicker date={newStart} onChange={setNewStart} />
          <Button onClick={openNewMembership} disabled={saving}>
            Abrir período
          </Button>

          {activeMembership && (
            <Button
              variant="outline"
              onClick={closeActiveMembership}
              disabled={saving}
            >
              Encerrar período hoje
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {memberships.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center gap-3"
            >
              <DatePicker
                date={new Date(m.started_at)}
                onChange={(d) =>
                  updateMembership(
                    m.id,
                    d,
                    m.ended_at ? new Date(m.ended_at) : undefined
                  )
                }
              />

              <DatePicker
                date={m.ended_at ? new Date(m.ended_at) : undefined}
                onChange={(d) =>
                  updateMembership(m.id, new Date(m.started_at), d)
                }
                placeholder="Em aberto"
              />

              <Button
                variant="outline"
                onClick={() => deleteMembership(m.id)}
                disabled={saving}
              >
                Remover
              </Button>
            </div>
          ))}

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
