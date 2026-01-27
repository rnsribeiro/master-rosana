import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function requireAdminOrViewer() {
  const supabase = await createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return { ok: false as const, supabase, status: 401, error: "Não autenticado." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role || !["admin", "admin_viewer"].includes(profile.role)) {
    return { ok: false as const, supabase, status: 403, error: "Sem permissão." };
  }

  return { ok: true as const, supabase };
}

export async function GET(req: Request) {
  const gate = await requireAdminOrViewer();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const supabase = gate.supabase;

  const url = new URL(req.url);
  const type = url.searchParams.get("type"); // "in" | "out" | null
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 1000);

  // ✅ JOIN: players(full_name) via player_id
  let q = supabase
    .from("transactions")
    .select(
      "id, type, date, amount, description, player_id, target_year, receipt_path, created_at, players:player_id(full_name)"
    )
    .order("date", { ascending: false })
    .limit(limit);

  if (type === "in" || type === "out") q = q.eq("type", type);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ transactions: data ?? [] });
}
