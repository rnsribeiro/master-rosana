"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { AdminRole, AdminRoleProvider } from "@/components/admin/admin-role-provider";

type MeResponse = {
  id: string;
  email: string | null;
  role: AdminRole;
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<AdminRole>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      const res = await fetch("/api/admin/me", { cache: "no-store" });
      if (!res.ok) {
        await supabase.auth.signOut();
        router.replace("/admin/login");
        return;
      }

      const me = (await res.json()) as MeResponse;

      if (!mounted) return;

      setUserId(me.id);
      setEmail(me.email);
      setRole(me.role);
      setLoading(false);
    }

    async function load() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session && pathname !== "/admin/login") {
        router.replace("/admin/login");
        return;
      }

      if (session && pathname === "/admin/login") {
        router.replace("/admin/dashboard");
        return;
      }

      if (!session) {
        if (mounted) {
          setEmail(null);
          setUserId(null);
          setRole(null);
          setLoading(false);
        }
        return;
      }

      await loadProfile();
    }

    void load();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setEmail(null);
        setUserId(null);
        setRole(null);
        if (pathname !== "/admin/login") router.replace("/admin/login");
        return;
      }

      void loadProfile();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [pathname, router]);

  async function logout() {
    setMobileMenuOpen(false);
    await supabase.auth.signOut();
    router.replace("/");
  }

  const navItems = [
    { href: "/admin/dashboard", label: "Dashboard" },
    { href: "/admin/jogadores", label: "Jogadores" },
    { href: "/admin/mensalidades", label: "Mensalidades" },
    { href: "/admin/financeiro", label: "Financeiro" },
    ...(role === "admin"
      ? [
          { href: "/admin/entradas/nova", label: "Nova Entrada" },
          { href: "/admin/saidas/nova", label: "Nova Saida" },
          { href: "/admin/acessos", label: "Acessos" },
        ]
      : []),
  ];

  function navLinkClass(href: string) {
    const isActive = pathname === href || pathname.startsWith(`${href}/`);

    return [
      "rounded-xl px-3 py-2 text-sm transition-colors",
      isActive
        ? "bg-zinc-900 text-white"
        : "text-zinc-300 hover:bg-zinc-900/70 hover:text-white",
    ].join(" ");
  }

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
        Carregando...
      </div>
    );
  }

  return (
    <AdminRoleProvider
      value={{
        loading,
        userId,
        email,
        role,
        isAdmin: role === "admin",
        isViewer: role === "admin_viewer",
        canEdit: role === "admin",
      }}
    >
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <header className="sticky top-0 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 py-4 md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Link href="/admin" className="truncate font-semibold">
                  Painel Admin
                </Link>
                <span className="hidden rounded-full border border-zinc-700 px-2 py-1 text-xs text-zinc-300 sm:inline-flex">
                  {role === "admin_viewer" ? "Viewer" : "Admin"}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setMobileMenuOpen((open) => !open)}
                className="inline-flex rounded-xl border border-zinc-800 p-2 text-zinc-200 hover:border-zinc-600 hover:text-white md:hidden"
                aria-expanded={mobileMenuOpen}
                aria-controls="admin-mobile-menu"
                aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 md:hidden">
              <span className="inline-flex rounded-full border border-zinc-700 px-2 py-1 text-xs text-zinc-300 sm:hidden">
                {role === "admin_viewer" ? "Viewer" : "Admin"}
              </span>
              <span className="min-w-0 flex-1 truncate text-right text-sm text-zinc-400">{email}</span>
            </div>

            <div className="mt-4 hidden items-center justify-between gap-4 md:flex">
              <nav className="flex flex-wrap gap-2 text-sm text-zinc-300">
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href} className={navLinkClass(item.href)}>
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="flex min-w-0 items-center gap-3 text-sm">
                <Link
                  href="/"
                  className="rounded-xl px-3 py-2 text-zinc-300 transition-colors hover:bg-zinc-900/70 hover:text-zinc-100"
                  title="Voltar para a Home (consulta do jogador)"
                >
                  Home
                </Link>
                <span className="rounded-full border border-zinc-700 px-2 py-1 text-xs text-zinc-300">
                  {role === "admin_viewer" ? "Viewer" : "Admin"}
                </span>
                <span className="max-w-56 truncate text-zinc-400">{email}</span>
                <button
                  onClick={logout}
                  className="rounded-xl bg-zinc-100 px-3 py-1.5 font-medium text-zinc-950"
                >
                  Sair
                </button>
              </div>
            </div>

            {mobileMenuOpen && (
              <div
                id="admin-mobile-menu"
                className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-3 md:hidden"
              >
                <nav className="flex flex-col gap-1">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={navLinkClass(item.href)}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>

                <div className="mt-3 border-t border-zinc-800 pt-3">
                  <Link
                    href="/"
                    className="block rounded-xl px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-950 hover:text-zinc-100"
                    title="Voltar para a Home (consulta do jogador)"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Home
                  </Link>

                  <button
                    onClick={logout}
                    className="mt-2 w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950"
                  >
                    Sair
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-4 md:px-6 md:py-6">{children}</main>
      </div>
    </AdminRoleProvider>
  );
}
