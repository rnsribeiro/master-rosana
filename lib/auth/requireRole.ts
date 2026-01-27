import { supabaseAdmin } from "@/lib/supabase/admin";

export type Role = "admin" | "admin_viewer";

export async function requireRole(req: Request, allowed: Role[]) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return { ok: false as const, status: 401, error: "Token ausente" };
  }

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false as const, status: 401, error: "Token inválido" };
  }

  const userId = userData.user.id;

  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profErr || !profile?.role) {
    return { ok: false as const, status: 403, error: "Sem perfil/role" };
  }

  if (!allowed.includes(profile.role as Role)) {
    return { ok: false as const, status: 403, error: "Sem permissão" };
  }

  return { ok: true as const, userId, role: profile.role as Role };
}
