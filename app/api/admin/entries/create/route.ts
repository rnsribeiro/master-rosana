import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/requireRole";
import { allocatePayment } from "@/lib/calc/allocatePayment";

type Body = {
  date: string; // YYYY-MM-DD
  amount: number;
  description?: string;
  player_id: string;
  target_year?: number | null;
};

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
  const playerId = String(body.player_id || "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Data inválida (use YYYY-MM-DD)" }, { status: 400 });
  }

  if (!(amount > 0)) {
    return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
  }

  if (!playerId) {
    return NextResponse.json({ error: "player_id obrigatório" }, { status: 400 });
  }

  // 3) cria transação de entrada
  const { data: tx, error: txErr } = await supabaseAdmin
    .from("transactions")
    .insert({
      type: "in",
      date,
      amount,
      description: body.description ?? null,
      player_id: playerId,
      target_year: body.target_year ?? null,
    })
    .select("id")
    .single();

  if (txErr || !tx) {
    return NextResponse.json({ error: "Erro ao criar entrada" }, { status: 500 });
  }

  try {
    // 4) carrega memberships + fees + allocations + forgiveness
    const [{ data: memberships }, { data: fees }, { data: allocs }, { data: forg }] =
      await Promise.all([
        supabaseAdmin
          .from("player_memberships")
          .select("started_at, ended_at")
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

    // se não tem período de participação, não aloca (vira "crédito" implícito)
    // (o crédito é calculado como totalPaid - totalAllocated)
    const { newAllocations } = allocatePayment({
      memberships: memberships ?? [],
      amount,
      fees: fees ?? [],
      existingAllocations: allocs ?? [],
      existingForgiveness: forg ?? [],
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

      if (allocErr) {
        throw new Error("Erro ao inserir allocations");
      }
    }

    return NextResponse.json({
      ok: true,
      transaction_id: tx.id,
      allocations_created: newAllocations.length,
    });
  } catch (e) {
    // rollback simples: apaga a transação se algo falhar
    await supabaseAdmin.from("transactions").delete().eq("id", tx.id);
    return NextResponse.json({ error: "Erro ao alocar pagamento" }, { status: 500 });
  }
}
