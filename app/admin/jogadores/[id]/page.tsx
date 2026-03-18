"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";
import { sanitizePin, isValidPin } from "@/lib/utils/pin";
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

// YYYY-MM-01 -> YYYY-MM (para <input type="month">)
function monthIsoToInput(v: string | null | undefined) {
  if (!v) return "";
  return String(v).slice(0, 7);
}

// YYYY-MM -> YYYY-MM-01 (para banco)
function monthInputToIso(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return null;
  return `${s}-01`;
}

function fmtMonthPt(v: string | null | undefined) {
  const ym = monthIsoToInput(v);
  if (!ym) return "-";
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/* ===================== Page ===================== */

export default function EditarJogadorPage() {
  /* -------- id seguro -------- */
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const rawId = String(params?.id ?? "");
  const playerId = useMemo(() => (isUuid(rawId) ? rawId : null), [rawId]);

  /* -------- estado -------- */
  const [player, setPlayer] = useState<Player | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);

  const [fullName, setFullName] = useState("");
  const [pin, setPin] = useState("");
  const [notes, setNotes] = useState("");

  // Abrir novo período
  const [newStart, setNewStart] = useState<Date | undefined>(new Date());
  const [newBillingMonth, setNewBillingMonth] = useState<string>(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${mm}`;
  });

  // edição “local” dos períodos (para não ficar salvando toda hora)
  const [editMap, setEditMap] = useState<Record<string, { started: string; ended: string; billingMonth: string }>>(
    {}
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

    const mems = (m ?? []) as Membership[];
    setMemberships(mems);

    // cria mapa de edição local
    const nextMap: Record<string, { started: string; ended: string; billingMonth: string }> = {};
    for (const mem of mems) {
      nextMap[mem.id] = {
        started: mem.started_at,
        ended: mem.ended_at ?? "",
        billingMonth: monthIsoToInput(mem.billing_start_month) || monthIsoToInput(mem.started_at) || "",
      };
    }
    setEditMap(nextMap);

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
      .update({
        full_name: name,
        pin,
        notes: notes || null,
      })
      .eq("id", playerId);
    setSaving(false);

    if (error) return setMsg("Erro ao salvar jogador.");

    setMsg("Jogador salvo com sucesso.");
    await load();
  }

  async function openNewMembership() {
    if (!playerId) return;
    setMsg(null);

    if (!newStart) return setMsg("Selecione a data de início do período.");
    if (activeMembership) return setMsg("Já existe um período ativo.");

    const billingIso = monthInputToIso(newBillingMonth);
    if (!billingIso) return setMsg("Selecione o mês de início da cobrança (YYYY-MM).");

    setSaving(true);
    const { error } = await supabase.from("player_memberships").insert({
      player_id: playerId,
      started_at: toISODate(newStart),
      ended_at: null,
      billing_start_month: billingIso,
    });
    setSaving(false);

    if (error) return setMsg("Erro ao abrir novo período.");

    setMsg("Novo período aberto.");
    await load();
  }

  async function closeActiveMembership() {
    if (!activeMembership) return;
    setMsg(null);

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

  async function saveMembership(memId: string) {
    const row = editMap[memId];
    if (!row) return;

    const started = row.started;
    const ended = row.ended || null;
    const billingIso = monthInputToIso(row.billingMonth);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(started)) return setMsg("Data de início inválida.");
    if (ended && !/^\d{4}-\d{2}-\d{2}$/.test(ended)) return setMsg("Data de fim inválida.");
    if (ended && ended < started) return setMsg("A data final não pode ser anterior à inicial.");
    if (!billingIso) return setMsg("Mês de início da cobrança inválido.");

    setSaving(true);
    const { error } = await supabase
      .from("player_memberships")
      .update({
        started_at: started,
        ended_at: ended,
        billing_start_month: billingIso,
      })
      .eq("id", memId);
    setSaving(false);

    if (error) return setMsg("Erro ao atualizar período.");

    setMsg("Período atualizado.");
    await load();
  }

  async function deleteMembership(memId: string) {
    setMsg(null);
    setSaving(true);
    const { error } = await supabase.from("player_memberships").delete().eq("id", memId);
    setSaving(false);

    if (error) return setMsg("Erro ao remover período.");

    setMsg("Período removido.");
    await load();
  }

  async function deletePlayer() {
    if (!playerId || !player) return;

    const confirmed = confirm(
      `Excluir o jogador "${player.full_name}"?\n\n` +
        "Isso tambem removera periodos, transacoes, allocations e perdoes vinculados a ele."
    );

    if (!confirmed) return;

    setMsg(null);
    setDeleting(true);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setMsg("Sessao invalida. Faça login novamente.");
        return;
      }

      const res = await fetch(`/api/admin/players/${playerId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        deleted?: {
          allocations: number;
          forgiveness: number;
          memberships: number;
          transactions: number;
        };
      };

      if (!res.ok) {
        setMsg(json.error ?? "Erro ao excluir jogador.");
        return;
      }

      const deleted = json.deleted;
      const summary = deleted
        ? `Transacoes: ${deleted.transactions}, periodos: ${deleted.memberships}, allocations: ${deleted.allocations}, perdoes: ${deleted.forgiveness}.`
        : "";

      alert(`Jogador excluido com sucesso. ${summary}`.trim());
      router.push("/admin/jogadores");
      router.refresh();
    } finally {
      setDeleting(false);
    }
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Editar Jogador</h1>
          <p className="text-sm text-zinc-400">Nome, PIN e participação.</p>
        </div>

        <Link href="/admin/jogadores" className="rounded-xl border border-zinc-800 px-4 py-2">
          Voltar
        </Link>
      </div>

      {/* Player */}
      <div className="space-y-3 rounded-2xl border border-zinc-800 p-4">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-zinc-300">Nome</label>
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-zinc-300">PIN</label>
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono tracking-widest"
              value={pin}
              onChange={(e) => setPin(sanitizePin(e.target.value))}
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-zinc-300">Observações</label>
          <textarea
            className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 min-h-24"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observações"
          />
        </div>

        <Button onClick={savePlayer} disabled={saving}>
          Salvar jogador
        </Button>

        {msg && (
          <div className="text-sm text-zinc-200 bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">{msg}</div>
        )}
      </div>

      <div className="space-y-3 rounded-2xl border border-red-900/50 bg-red-950/15 p-4">
        <div>
          <h2 className="text-lg font-semibold text-red-100">Zona de exclusao</h2>
          <p className="text-sm text-red-200/80">
            A exclusao remove definitivamente o jogador e tambem os periodos, transacoes,
            allocations e perdoes vinculados a ele.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-red-200/70">
            Use apenas quando tiver certeza. Essa acao nao pode ser desfeita pelo sistema.
          </div>

          <Button variant="destructive" onClick={deletePlayer} disabled={deleting || saving}>
            {deleting ? "Excluindo..." : "Excluir jogador"}
          </Button>
        </div>
      </div>

      {/* Memberships */}
      <div className="space-y-4 rounded-2xl border border-zinc-800 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Participação</h2>
          {activeMembership ? (
            <span className="text-xs rounded-full px-2 py-1 bg-emerald-900/40 border border-emerald-800 text-emerald-200">
              Período ativo em aberto
            </span>
          ) : (
            <span className="text-xs rounded-full px-2 py-1 bg-zinc-900/60 border border-zinc-800 text-zinc-300">
              Sem período ativo
            </span>
          )}
        </div>

        {/* Abrir novo período */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <div>
            <div className="font-medium">Abrir novo período</div>
            <div className="text-sm text-zinc-400">
              Você pode cadastrar o jogador hoje, mas fazer ele começar a pagar a partir de um mês específico.
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="text-sm text-zinc-300">Início do período (participação)</label>
              <div className="mt-1">
                <DatePicker date={newStart} onChange={setNewStart} />
              </div>
            </div>

            <div>
              <label className="text-sm text-zinc-300">Começa a pagar a partir de</label>
              <input
                type="month"
                className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
                value={newBillingMonth}
                onChange={(e) => setNewBillingMonth(e.target.value)}
              />
              <div className="text-xs text-zinc-500 mt-1">Cobrança conta só a partir deste mês.</div>
            </div>

            <div className="flex gap-2 md:justify-end">
              <Button onClick={openNewMembership} disabled={saving}>
                Abrir período
              </Button>
              {activeMembership && (
                <Button variant="outline" onClick={closeActiveMembership} disabled={saving}>
                  Encerrar hoje
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Períodos cadastrados */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4 space-y-3">
          <div className="font-medium">Períodos cadastrados</div>

          <div className="space-y-3">
            {memberships.map((m) => {
              const row = editMap[m.id] ?? {
                started: m.started_at,
                ended: m.ended_at ?? "",
                billingMonth: monthIsoToInput(m.billing_start_month) || monthIsoToInput(m.started_at) || "",
              };

              return (
                <div key={m.id} className="rounded-2xl border border-zinc-800 p-4">
                  <div className="grid md:grid-cols-4 gap-3 items-end">
                    <div>
                      <label className="text-sm text-zinc-300">Início</label>
                      <input
                        type="date"
                        className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
                        value={row.started}
                        onChange={(e) =>
                          setEditMap((prev) => ({ ...prev, [m.id]: { ...row, started: e.target.value } }))
                        }
                      />
                    </div>

                    <div>
                      <label className="text-sm text-zinc-300">Fim</label>
                      <input
                        type="date"
                        className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
                        value={row.ended}
                        onChange={(e) =>
                          setEditMap((prev) => ({ ...prev, [m.id]: { ...row, ended: e.target.value } }))
                        }
                        placeholder="Em aberto"
                      />
                    </div>

                    <div>
                      <label className="text-sm text-zinc-300">Começa a pagar</label>
                      <input
                        type="month"
                        className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
                        value={row.billingMonth}
                        onChange={(e) =>
                          setEditMap((prev) => ({ ...prev, [m.id]: { ...row, billingMonth: e.target.value } }))
                        }
                      />
                      <div className="text-xs text-zinc-500 mt-1">Atual: {fmtMonthPt(m.billing_start_month)}</div>
                    </div>

                    <div className="flex gap-2 md:justify-end">
                      <Button variant="outline" onClick={() => saveMembership(m.id)} disabled={saving}>
                        Salvar período
                      </Button>
                      <Button variant="outline" onClick={() => deleteMembership(m.id)} disabled={saving}>
                        Remover
                      </Button>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-500 mt-3">ID: {m.id}</div>
                </div>
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
    </div>
  );
}
