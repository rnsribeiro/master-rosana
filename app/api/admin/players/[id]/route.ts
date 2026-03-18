import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/requireRole";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function getIdFromCtx(ctx: { params?: Promise<{ id?: string }> | { id?: string } }) {
  const params = ctx?.params;
  if (!params) return "";

  const resolved = typeof (params as Promise<{ id?: string }>).then === "function"
    ? await (params as Promise<{ id?: string }>)
    : (params as { id?: string });

  return String(resolved?.id ?? "");
}

export async function DELETE(req: Request, ctx: { params?: Promise<{ id?: string }> | { id?: string } }) {
  const auth = await requireRole(req, ["admin"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const playerId = await getIdFromCtx(ctx);
  if (!isUuid(playerId)) {
    return NextResponse.json({ error: "ID invalido." }, { status: 400 });
  }

  const { data: player, error: playerError } = await supabaseAdmin
    .from("players")
    .select("id, full_name")
    .eq("id", playerId)
    .single();

  if (playerError || !player) {
    return NextResponse.json({ error: "Jogador nao encontrado." }, { status: 404 });
  }

  const [{ count: allocationsCount }, { count: forgivenessCount }, { count: membershipsCount }, { count: transactionsCount }] =
    await Promise.all([
      supabaseAdmin.from("allocations").select("*", { count: "exact", head: true }).eq("player_id", playerId),
      supabaseAdmin.from("forgiveness").select("*", { count: "exact", head: true }).eq("player_id", playerId),
      supabaseAdmin.from("player_memberships").select("*", { count: "exact", head: true }).eq("player_id", playerId),
      supabaseAdmin.from("transactions").select("*", { count: "exact", head: true }).eq("player_id", playerId),
    ]);

  const { error: allocationsDeleteError } = await supabaseAdmin.from("allocations").delete().eq("player_id", playerId);
  if (allocationsDeleteError) {
    return NextResponse.json({ error: "Erro ao remover allocations do jogador." }, { status: 500 });
  }

  const { error: forgivenessDeleteError } = await supabaseAdmin.from("forgiveness").delete().eq("player_id", playerId);
  if (forgivenessDeleteError) {
    return NextResponse.json({ error: "Erro ao remover perdoes do jogador." }, { status: 500 });
  }

  const { error: membershipsDeleteError } = await supabaseAdmin
    .from("player_memberships")
    .delete()
    .eq("player_id", playerId);
  if (membershipsDeleteError) {
    return NextResponse.json({ error: "Erro ao remover periodos do jogador." }, { status: 500 });
  }

  const { error: transactionsDeleteError } = await supabaseAdmin
    .from("transactions")
    .delete()
    .eq("player_id", playerId);
  if (transactionsDeleteError) {
    return NextResponse.json({ error: "Erro ao remover transacoes do jogador." }, { status: 500 });
  }

  const { error: playerDeleteError } = await supabaseAdmin.from("players").delete().eq("id", playerId);
  if (playerDeleteError) {
    return NextResponse.json({ error: "Erro ao remover jogador." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    player: {
      id: player.id,
      full_name: player.full_name,
    },
    deleted: {
      allocations: allocationsCount ?? 0,
      forgiveness: forgivenessCount ?? 0,
      memberships: membershipsCount ?? 0,
      transactions: transactionsCount ?? 0,
    },
  });
}
