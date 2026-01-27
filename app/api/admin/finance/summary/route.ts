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

export async function GET() {
  const gate = await requireAdminOrViewer();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const supabase = gate.supabase;

  // totais de entradas e saídas
  const { data: ins, error: inErr } = await supabase
    .from("transactions")
    .select("amount")
    .eq("type", "in");

  if (inErr) return NextResponse.json({ error: inErr.message }, { status: 400 });

  const { data: outs, error: outErr } = await supabase
    .from("transactions")
    .select("amount")
    .eq("type", "out");

  if (outErr) return NextResponse.json({ error: outErr.message }, { status: 400 });

  const totalIn = (ins ?? []).reduce((acc, r: any) => acc + Number(r.amount ?? 0), 0);
  const totalOut = (outs ?? []).reduce((acc, r: any) => acc + Number(r.amount ?? 0), 0);
  const cash = totalIn - totalOut;

  // em aberto global (rpc)
  const { data: openDue, error: rpcErr } = await supabase.rpc("admin_total_open_due");
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 400 });

  return NextResponse.json({
    totalIn,
    totalOut,
    cash,
    totalOpenDue: Number(openDue ?? 0),
  });
}
