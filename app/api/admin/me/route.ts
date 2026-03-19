import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.role || !["admin", "admin_viewer"].includes(profile.role)) {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  return NextResponse.json({
    id: user.id,
    email: user.email ?? null,
    role: profile.role as "admin" | "admin_viewer",
  });
}
