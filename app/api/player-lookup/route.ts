import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildPlayerStatement, normText } from "@/lib/calc/buildPlayerStatement";

export async function POST(req: Request) {
  const { nameQuery, pin } = await req.json();

  const name = normText(String(nameQuery || ""));
  const p = String(pin || "");

  if (name.length < 2) return NextResponse.json({ error: "Nome muito curto" }, { status: 400 });
  if (!/^\d{6}$/.test(p)) return NextResponse.json({ error: "PIN inválido" }, { status: 400 });

  const { data: players } = await supabaseAdmin
    .from("players")
    .select("id, full_name")
    .eq("pin", p)
    .ilike("full_name_norm", `%${name}%`)
    .limit(2);

  if (!players || players.length === 0) return NextResponse.json({ found: false });
  if (players.length > 1) return NextResponse.json({ error: "Mais de um jogador encontrado. Digite mais do nome." }, { status: 409 });

  const player = players[0];

  const [{ data: memberships }, { data: payments }, { data: allocations }, { data: forgiveness }, { data: fees }] =
    await Promise.all([
      supabaseAdmin
        .from("player_memberships")
        .select("started_at, ended_at")
        .eq("player_id", player.id)
        .order("started_at", { ascending: true }),

      supabaseAdmin
        .from("transactions")
        .select("id, date, amount, description, target_year")
        .eq("type", "in")
        .eq("player_id", player.id)
        .order("date", { ascending: true }),

      supabaseAdmin.from("allocations").select("year, month, amount").eq("player_id", player.id),
      supabaseAdmin.from("forgiveness").select("year, month, amount").eq("player_id", player.id),
      supabaseAdmin.from("year_fees").select("year, monthly_fee"),
    ]);

  const statement = buildPlayerStatement({
    memberships: memberships ?? [],
    payments: (payments ?? []) as any,
    allocations: (allocations ?? []) as any,
    forgiveness: (forgiveness ?? []) as any,
    fees: fees ?? [],
  });

  return NextResponse.json({ found: true, player: { full_name: player.full_name }, statement });
}
