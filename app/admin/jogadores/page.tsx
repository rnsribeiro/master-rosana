"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAdminRole } from "@/components/admin/admin-role-provider";
import { ReadOnlyBanner } from "@/components/admin/admin-access-notice";

type Player = {
  id: string;
  full_name: string;
  pin: string;
  created_at: string;
};

type Membership = {
  player_id: string;
  started_at: string;
  ended_at: string | null;
};

type PlayerRow = {
  id: string;
  full_name: string;
  pin: string;
  first_joined_at: string | null;
  last_left_at: string | null;
  is_active: boolean;
};

function fmtBR(dateISO: string | null) {
  if (!dateISO) return "-";
  return new Date(dateISO + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function JogadoresPage() {
  const { canEdit } = useAdminRole();
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setMsg(null);
    setLoading(true);

    const [{ data: players, error: pErr }, { data: mems, error: mErr }] =
      await Promise.all([
        supabase
          .from("players")
          .select("id, full_name, pin, created_at")
          .order("full_name", { ascending: true }),

        supabase
          .from("player_memberships")
          .select("player_id, started_at, ended_at")
          .order("started_at", { ascending: true }),
      ]);

    if (pErr) {
      setMsg("Erro ao carregar jogadores (sem permissão ou tabela/colunas incorretas).");
      setRows([]);
      setLoading(false);
      return;
    }

    if (mErr) {
      // memberships podem falhar por RLS se role errado
      setMsg("Erro ao carregar períodos de participação (verifique RLS/role).");
      setRows([]);
      setLoading(false);
      return;
    }

    const memberships = (mems ?? []) as Membership[];
    const memByPlayer = new Map<string, Membership[]>();

    for (const m of memberships) {
      const list = memByPlayer.get(m.player_id) ?? [];
      list.push(m);
      memByPlayer.set(m.player_id, list);
    }

    const out: PlayerRow[] = ((players ?? []) as Player[]).map((p) => {
      const list = memByPlayer.get(p.id) ?? [];

      let first_joined_at: string | null = null;
      let last_left_at: string | null = null;
      let is_active = false;

      for (const m of list) {
        if (!first_joined_at || m.started_at < first_joined_at) first_joined_at = m.started_at;
        if (m.ended_at === null) is_active = true;
        if (m.ended_at) {
          if (!last_left_at || m.ended_at > last_left_at) last_left_at = m.ended_at;
        }
      }

      return {
        id: p.id,
        full_name: p.full_name,
        pin: p.pin,
        first_joined_at,
        last_left_at,
        is_active,
      };
    });

    setRows(out);
    setLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((p) => p.full_name.toLowerCase().includes(s));
  }, [rows, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Jogadores</h1>
          <p className="text-zinc-400 text-sm">
            Lista de jogadores + status (ativo quando existe período aberto).
          </p>
        </div>

        {canEdit && (
          <Link
            href="/admin/jogadores/novo"
            className="w-full rounded-xl bg-zinc-100 px-4 py-2 text-center font-medium text-zinc-950 sm:w-auto"
          >
            Novo jogador
          </Link>
        )}
      </div>

      {!canEdit && (
        <ReadOnlyBanner description="Seu perfil pode consultar a lista e abrir os detalhes dos jogadores, mas nao pode criar ou editar cadastros." />
      )}

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none"
            placeholder="Buscar por nome..."
          />
          <button
            onClick={load}
            className="rounded-xl bg-zinc-950 border border-zinc-800 px-4 py-2 hover:border-zinc-600"
          >
            Recarregar
          </button>
        </div>

        {msg && (
          <div className="text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-xl p-3">
            {msg}
          </div>
        )}

        {loading ? (
          <div className="text-zinc-400">Carregando…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-zinc-400">
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-2 pr-4">Nome</th>
                  <th className="text-left py-2 pr-4">PIN</th>
                  <th className="text-left py-2 pr-4">Primeira entrada</th>
                  <th className="text-left py-2 pr-4">Última saída</th>
                  <th className="text-left py-2 pr-4">Status</th>
                  <th className="text-left py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-900">
                    <td className="py-2 pr-4">{p.full_name}</td>
                    <td className="py-2 pr-4 font-mono tracking-widest">{p.pin}</td>
                    <td className="py-2 pr-4">{fmtBR(p.first_joined_at)}</td>
                    <td className="py-2 pr-4">{fmtBR(p.last_left_at)}</td>
                    <td className="py-2 pr-4">{p.is_active ? "Ativo" : "Inativo"}</td>
                    <td className="py-2 pr-4">
                      <Link
                        href={`/admin/jogadores/${p.id}`}
                        className="text-zinc-200 hover:text-white underline underline-offset-4"
                      >
                        {canEdit ? "Editar" : "Ver detalhes"}
                      </Link>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td className="py-3 text-zinc-400" colSpan={6}>
                      Nenhum jogador encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
