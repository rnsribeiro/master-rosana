import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/requireRole";
import { allocatePayment } from "@/lib/calc/allocatePayment";

type Body = {
  date: string; // YYYY-MM-DD
  amount: number;
  description?: string;
  player_id?: string | null; // ✅ agora opcional
  target_year?: number | null;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request) {
  // 1) autorização: somente admin pode criar entrada
  const auth = await requireRole(req, ["admin"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // 2) body
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const date = String(body.date || "");
  const amount = Number(body.amount || 0);
  const playerIdRaw = body.player_id == null ? null : String(body.player_id);
  const targetYearRaw = body.target_year ?? null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Data inválida (use YYYY-MM-DD)" }, { status: 400 });
  }

  if (!(amount > 0)) {
    return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
  }

  // ✅ player_id pode ser null (entrada sem jogador)
  const playerId =
    playerIdRaw && playerIdRaw.trim() !== "" ? playerIdRaw.trim() : null;

  if (playerId && !isUuid(playerId)) {
    return NextResponse.json({ error: "player_id inválido" }, { status: 400 });
  }

  const finalTargetYear =
    typeof targetYearRaw === "number" && Number.isFinite(targetYearRaw)
      ? targetYearRaw
      : new Date(date + "T00:00:00").getFullYear();

  // 3) cria transação de entrada
  const { data: tx, error: txErr } = await supabaseAdmin
    .from("transactions")
    .insert({
      type: "in",
      date,
      amount,
      description: body.description ?? null,
      player_id: playerId, // ✅ pode ser null
      target_year: playerId ? finalTargetYear : null, // ✅ sem jogador: não faz sentido ano alvo
    })
    .select("id")
    .single();

  if (txErr || !tx) {
    return NextResponse.json({ error: "Erro ao criar entrada" }, { status: 500 });
  }

  // ✅ Se não tem jogador, não aloca: encerra aqui
  if (!playerId) {
    return NextResponse.json({
      ok: true,
      transaction_id: tx.id,
      allocations_created: 0,
      note: "Entrada sem jogador (não há alocação).",
    });
  }

  try {
    // 4) carrega memberships + fees + allocations + forgiveness
    const [{ data: memberships }, { data: fees }, { data: allocs }, { data: forg }] =
      await Promise.all([
        supabaseAdmin
          .from("player_memberships")
          .select("started_at, ended_at, billing_start_month")
          .eq("player_id", playerId)
          .order("started_at", { ascending: true }),

        supabaseAdmin.from("year_fees").select("year, monthly_fee"),

        supabaseAdmin
          .from("allocations")
          .select("year, month, amount")
          .eq("player_id", playerId),

        supabaseAdmin
          .from("forgiveness")
          .select("year, month, amount")
          .eq("player_id", playerId),
      ]);

    const { newAllocations } = allocatePayment({
      memberships: memberships ?? [],
      amount,
      fees: fees ?? [],
      existingAllocations: allocs ?? [],
      existingForgiveness: forg ?? [],
      targetYear: finalTargetYear,
    });

    // 5) grava allocations vinculadas à transaction
    if (newAllocations.length > 0) {
      const { error: allocErr } = await supabaseAdmin.from("allocations").insert(
        newAllocations.map((a) => ({
          transaction_id: tx.id,
          player_id: playerId,
          year: a.year,
          month: a.month,
          amount: a.amount,
        }))
      );

      if (allocErr) throw new Error("Erro ao inserir allocations");
    }

    return NextResponse.json({
      ok: true,
      transaction_id: tx.id,
      allocations_created: newAllocations.length,
    });
  } catch {
    // rollback simples: apaga a transação se algo falhar
    await supabaseAdmin.from("transactions").delete().eq("id", tx.id);
    return NextResponse.json({ error: "Erro ao alocar pagamento" }, { status: 500 });
  }
}
