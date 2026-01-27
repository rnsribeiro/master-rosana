"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { usePathname, useRouter } from "next/navigation";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      // libera /admin/login sem sessão
      if (!session && pathname !== "/admin/login") {
        router.replace("/admin/login");
        return;
      }

      if (mounted) {
        setEmail(session?.user?.email ?? null);
        setLoading(false);
      }
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
      if (!session && pathname !== "/admin/login") router.replace("/admin/login");
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [pathname, router]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
        Carregando…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/80 sticky top-0 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="font-semibold">
              Painel Admin
            </Link>
            <nav className="text-sm text-zinc-300 flex gap-3">
              <Link href="/admin/dashboard" className="hover:text-white">Dashboard</Link>
              <Link href="/admin/jogadores" className="hover:text-white">Jogadores</Link>
              <Link href="/admin/mensalidades" className="hover:text-white">Mensalidades</Link>
              <Link href="/admin/entradas/nova" className="hover:text-white">Nova Entrada</Link>
              <Link href="/admin/saidas/nova" className="hover:text-white">Nova Saída</Link>
              <Link href="/admin/financeiro" className="hover:text-white">Financeiro</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-zinc-300 hover:text-zinc-100"
              title="Voltar para a Home (consulta do jogador)"
            >
              Home
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-zinc-400">{email}</span>
            <button
              onClick={logout}
              className="rounded-xl bg-zinc-100 text-zinc-950 px-3 py-1.5 font-medium"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">{children}</main>
    </div>
  );
}
