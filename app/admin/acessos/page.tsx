"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAdminRole } from "@/components/admin/admin-role-provider";
import { AdminOnlyNotice } from "@/components/admin/admin-access-notice";

type AccessRole = "admin" | "admin_viewer";

type ManagedUser = {
  id: string;
  email: string | null;
  role: AccessRole | null;
  created_at: string | null;
  last_sign_in_at: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

function roleLabel(role: AccessRole | null) {
  if (role === "admin") return "Admin";
  if (role === "admin_viewer") return "Viewer";
  return "Sem acesso";
}

export default function AcessosPage() {
  const { loading: roleLoading, isAdmin, userId } = useAdminRole();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AccessRole>("admin_viewer");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function getTokenOrThrow() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      throw new Error("Sessao invalida. Faca login novamente.");
    }

    return token;
  }

  async function loadUsers() {
    setLoading(true);
    setError(null);

    try {
      const token = await getTokenOrThrow();
      const res = await fetch("/api/admin/access/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        users?: ManagedUser[];
      };

      if (!res.ok) {
        throw new Error(json.error ?? "Erro ao carregar acessos.");
      }

      setUsers(json.users ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar acessos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (roleLoading || !isAdmin) return;
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleLoading, isAdmin]);

  async function createUser() {
    setMsg(null);
    setError(null);
    setCreating(true);

    try {
      const token = await getTokenOrThrow();
      const res = await fetch("/api/admin/access/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email,
          password,
          role,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        throw new Error(json.error ?? "Erro ao criar acesso.");
      }

      setEmail("");
      setPassword("");
      setRole("admin_viewer");
      setMsg("Acesso criado com sucesso.");
      await loadUsers();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Falha ao criar acesso.");
    } finally {
      setCreating(false);
    }
  }

  async function updateRole(targetUserId: string, nextRole: AccessRole) {
    setMsg(null);
    setError(null);
    setUpdatingId(targetUserId);

    try {
      const token = await getTokenOrThrow();
      const res = await fetch(`/api/admin/access/users/${targetUserId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: nextRole }),
      });

      const json = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        throw new Error(json.error ?? "Erro ao atualizar perfil.");
      }

      setMsg("Perfil atualizado com sucesso.");
      await loadUsers();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Falha ao atualizar perfil.");
    } finally {
      setUpdatingId(null);
    }
  }

  if (roleLoading) {
    return <div className="text-zinc-400">Carregando...</div>;
  }

  if (!isAdmin) {
    return (
      <AdminOnlyNotice
        title="Acessos do painel"
        description="Somente administradores podem criar usuarios e alterar os papeis de acesso do painel."
        backHref="/admin/dashboard"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Acessos do painel</h1>
          <p className="text-sm text-zinc-400">
            Crie usuarios para o painel e alterne entre perfil de admin e viewer.
          </p>
        </div>

        <button
          onClick={() => void loadUsers()}
          disabled={loading}
          className="w-full rounded-xl border border-zinc-700 px-4 py-2 text-sm hover:border-zinc-500 disabled:opacity-60 sm:w-auto"
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Novo acesso</h2>
          <p className="text-sm text-zinc-400">
            O usuario criado ja entra com e-mail confirmado e recebe o papel escolhido.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-sm text-zinc-300">E-mail</label>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@exemplo.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-300">Senha inicial</label>
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimo de 6 caracteres"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-300">Perfil</label>
            <select
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2"
              value={role}
              onChange={(e) => setRole(e.target.value as AccessRole)}
            >
              <option value="admin_viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => void createUser()}
          disabled={creating}
          className="rounded-xl bg-zinc-100 px-4 py-2 font-medium text-zinc-950 disabled:opacity-60"
        >
          {creating ? "Criando..." : "Criar acesso"}
        </button>

        {msg && (
          <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-3 text-sm text-emerald-200">
            {msg}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Usuarios do painel</h2>
          <div className="text-sm text-zinc-400">{users.length} usuario(s)</div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-zinc-400">
              <tr className="border-b border-zinc-800">
                <th className="py-2 pr-4 text-left">E-mail</th>
                <th className="py-2 pr-4 text-left">Perfil</th>
                <th className="py-2 pr-4 text-left">Criado em</th>
                <th className="py-2 pr-4 text-left">Ultimo acesso</th>
                <th className="py-2 pr-4 text-left">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === userId;
                const busy = updatingId === user.id;

                return (
                  <tr key={user.id} className="border-b border-zinc-900">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-zinc-100">{user.email ?? "-"}</div>
                      {isSelf && <div className="text-xs text-zinc-500">Voce</div>}
                    </td>
                    <td className="py-3 pr-4">{roleLabel(user.role)}</td>
                    <td className="py-3 pr-4">{formatDateTime(user.created_at)}</td>
                    <td className="py-3 pr-4">{formatDateTime(user.last_sign_in_at)}</td>
                    <td className="py-3 pr-4">
                      {isSelf ? (
                        <span className="text-xs text-zinc-500">Seu acesso atual</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => void updateRole(user.id, "admin_viewer")}
                            disabled={busy || user.role === "admin_viewer"}
                            className="rounded-lg border border-zinc-700 px-3 py-1 hover:border-zinc-500 disabled:opacity-50"
                          >
                            Viewer
                          </button>
                          <button
                            onClick={() => void updateRole(user.id, "admin")}
                            disabled={busy || user.role === "admin"}
                            className="rounded-lg border border-zinc-700 px-3 py-1 hover:border-zinc-500 disabled:opacity-50"
                          >
                            Admin
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-zinc-500">
                    Nenhum usuario encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
