"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function login() {
    setMsg(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setMsg("Falha no login. Verifique email e senha.");
      return;
    }

    router.replace("/admin");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex items-center justify-center">
      <div className="w-full max-w-md bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5">
        <h1 className="text-xl font-semibold">Login do Admin</h1>
        <p className="text-zinc-400 text-sm mt-1">Acesso restrito.</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm text-zinc-300 mb-1">Email</label>
            <input
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@email.com"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-300 mb-1">Senha</label>
            <input
              type="password"
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
            />
          </div>

          <button
            onClick={login}
            disabled={loading}
            className="w-full rounded-xl px-4 py-2 bg-zinc-100 text-zinc-950 font-medium disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>

          {msg && (
            <div className="text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-xl p-3">
              {msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
