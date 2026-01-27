"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleLogin() {
    setMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    router.replace("/admin/dashboard");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <h1 className="text-2xl font-semibold">Login Admin</h1>
        <p className="text-zinc-400 text-sm">
          Entre com seu e-mail e senha para acessar o painel.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
          className="space-y-3"
        >
          <div>
            <label className="text-sm text-zinc-300">E-mail</label>
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none focus:border-zinc-600"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-300">Senha</label>
            <input
              type="password"
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none focus:border-zinc-600"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-zinc-100 text-zinc-950 px-4 py-2 font-medium disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        {msg && (
          <div className="text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-xl p-3">
            {msg}
          </div>
        )}

        <a
          href="/"
          className="text-sm text-zinc-300 hover:text-zinc-100 underline underline-offset-4"
        >
          Voltar para a Home
        </a>
      </div>
    </div>
  );
}
