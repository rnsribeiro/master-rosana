import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/requireRole";

type Body = {
  player_id: string;
  year: number;
  month: number; // 1..12
  amount: number;
  reason?: string;
};

export async function POST(req: Request) {
  const auth = await requireRole(req, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as Body;

  if (!body.player_id) return NextResponse.json({ error: "player_id obrigatório" }, { status: 400 });
  if (!Number.isInteger(body.year) || body.year < 2000) return NextResponse.json({ error: "year inválido" }, { status: 400 });
  if (!Number.isInteger(body.month) || body.month < 1 || body.month > 12) return NextResponse.json({ error: "month inválido" }, { status: 400 });
  if (!(body.amount > 0)) return NextResponse.json({ error: "amount inválido" }, { status: 400 });

  const { error } = await supabaseAdmin.from("forgiveness").insert({
    player_id: body.player_id,
    year: body.year,
    month: body.month,
    amount: body.amount,
    reason: body.reason ?? null,
  });

  if (error) return NextResponse.json({ error: "Erro ao aplicar perdão" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
