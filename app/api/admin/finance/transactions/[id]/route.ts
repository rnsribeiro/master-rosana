import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/requireRole";
import { allocatePayment } from "@/lib/calc/allocatePayment";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

type PatchBody = {
  date?: string; // YYYY-MM-DD
  amount?: number;
  description?: string | null;
  target_year?: number | null;
};

async function getIdFromCtx(ctx: any): Promise<string> {
  // Next 16: ctx.params pode ser Promise
  const p = ctx?.params;
  if (!p) return "";
  const obj = typeof p.then === "function" ? await p : p;
  return String(obj?.id ?? "");
}

export async function PATCH(req: Request, ctx: any) {
  const auth = await requireRole(req, ["admin"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const id = await getIdFromCtx(ctx);
  if (!isUuid(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as PatchBody;

  const date = body.date != null ? String(body.date) : undefined;
  const amount = body.amount != null ? Number(body.amount) : undefined;
  const description = body.description !== undefined ? body.description : undefined;
  const targetYear =
    body.target_year !== undefined && body.target_year !== null
      ? Number(body.target_year)
      : body.target_year === null
      ? null
      : undefined;

  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Data inválida (YYYY-MM-DD)." }, { status: 400 });
  }
  if (amount !== undefined && !(amount > 0)) {
    return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  }
  if (targetYear !== undefined && targetYear !== null) {
    if (!Number.isInteger(targetYear) || targetYear < 2000 || targetYear > 2100) {
      return NextResponse.json({ error: "Ano alvo inválido." }, { status: 400 });
    }
  }

  // carrega tx atual
  const { data: tx, error: txErr } = await supabaseAdmin
    .from("transactions")
    .select("id, type, date, amount, description, player_id, target_year")
    .eq("id", id)
    .single();

  if (txErr || !tx) {
    return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  }

  const newTx = {
    date: date ?? tx.date,
    amount: amount ?? Number(tx.amount),
    description: description === undefined ? tx.description : description,
    target_year: targetYear === undefined ? tx.target_year : targetYear,
  };

  // atualiza tx
  const { error: upErr } = await supabaseAdmin
    .from("transactions")
    .update({
      date: newTx.date,
      amount: newTx.amount,
      description: newTx.description ?? null,
      target_year: newTx.target_year ?? null,
    })
    .eq("id", id);

  if (upErr) {
    return NextResponse.json({ error: "Erro ao atualizar transação." }, { status: 500 });
  }

  // se não for "entrada", não tem allocations para recalcular
  if (tx.type !== "in") {
    return NextResponse.json({ ok: true, allocations_rebuilt: false });
  }

  // precisa de player_id para alocar
  const playerId = tx.player_id;
  if (!playerId) {
    return NextResponse.json({ ok: true, allocations_rebuilt: false });
  }

  // ✅ REBUILD allocations: apaga allocations desta tx e recria com base no estado atual
  // 1) apaga allocations da transação
  const { error: delAllocErr } = await supabaseAdmin.from("allocations").delete().eq("transaction_id", id);
  if (delAllocErr) {
    return NextResponse.json({ error: "Erro ao remover allocations antigas." }, { status: 500 });
  }

  // 2) carrega dados para alocar novamente
  const [{ data: memberships }, { data: fees }, { data: allocs }, { data: forg }] = await Promise.all([
    supabaseAdmin
      .from("player_memberships")
      .select("started_at, ended_at, billing_start_month")
      .eq("player_id", playerId)
      .order("started_at", { ascending: true }),

    supabaseAdmin.from("year_fees").select("year, monthly_fee"),

    supabaseAdmin.from("allocations").select("year, month, amount").eq("player_id", playerId),

    supabaseAdmin.from("forgiveness").select("year, month, amount").eq("player_id", playerId),
  ]);

  // se target_year ficou null, usa o ano da data
  const effectiveTargetYear =
    newTx.target_year != null && Number.isFinite(Number(newTx.target_year))
      ? Number(newTx.target_year)
      : new Date(newTx.date + "T00:00:00").getFullYear();

  const { newAllocations } = allocatePayment({
    memberships: (memberships ?? []) as any,
    amount: Number(newTx.amount),
    fees: (fees ?? []) as any,
    existingAllocations: (allocs ?? []) as any,
    existingForgiveness: (forg ?? []) as any,
    targetYear: effectiveTargetYear,
  });

  if (newAllocations.length > 0) {
    const { error: insErr } = await supabaseAdmin.from("allocations").insert(
      newAllocations.map((a) => ({
        transaction_id: id,
        player_id: playerId,
        year: a.year,
        month: a.month,
        amount: a.amount,
      }))
    );

    if (insErr) {
      return NextResponse.json({ error: "Erro ao recriar allocations." }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    allocations_rebuilt: true,
    allocations_created: newAllocations.length,
    target_year_used: effectiveTargetYear,
  });
}

export async function DELETE(req: Request, ctx: any) {
  const auth = await requireRole(req, ["admin"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const id = await getIdFromCtx(ctx);
  if (!isUuid(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  // remove allocations (se houver)
  await supabaseAdmin.from("allocations").delete().eq("transaction_id", id);

  // remove transação
  const { error } = await supabaseAdmin.from("transactions").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Erro ao excluir transação." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
