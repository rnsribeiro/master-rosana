import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function isISODate(s: unknown) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function requireRole(roles: Array<"admin" | "admin_viewer">) {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return { ok: false as const, supabase, status: 401, error: "Não autenticado." };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profile?.role as "admin" | "admin_viewer" | undefined;

  if (!role || !roles.includes(role)) {
    return { ok: false as const, supabase, status: 403, error: "Sem permissão." };
  }

  return { ok: true as const, supabase, role };
}

/**
 * Recria allocations para uma transação "in" com base no valor e mensalidade do ano alvo.
 * - Remove allocations antigas (transaction_id)
 * - Aplica o valor mês a mês (considerando já pago + perdoado)
 */
async function rebuildAllocationsForPayment(params: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  transactionId: string;
  playerId: string;
  targetYear: number;
  amount: number;
}) {
  const { supabase, transactionId, playerId, targetYear, amount } = params;

  // remove allocations antigas desse pagamento
  const { error: delErr } = await supabase
    .from("allocations")
    .delete()
    .eq("transaction_id", transactionId);

  if (delErr) throw new Error(delErr.message);

  // mensalidade do ano
  const { data: feeRow, error: feeErr } = await supabase
    .from("year_fees")
    .select("monthly_fee")
    .eq("year", targetYear)
    .single();

  if (feeErr) throw new Error(feeErr.message);

  const monthlyFee = n((feeRow as any)?.monthly_fee);
  if (!(monthlyFee > 0)) return; // sem fee, não aloca

  // já alocado (pagamentos) no ano
  const { data: paidRows, error: paidErr } = await supabase
    .from("allocations")
    .select("month, amount")
    .eq("player_id", playerId)
    .eq("year", targetYear);

  if (paidErr) throw new Error(paidErr.message);

  const paidByMonth = new Map<number, number>();
  for (const r of paidRows ?? []) {
    const m = Number((r as any).month);
    const a = n((r as any).amount);
    paidByMonth.set(m, (paidByMonth.get(m) ?? 0) + a);
  }

  // perdões no ano
  const { data: forgRows, error: forgErr } = await supabase
    .from("forgiveness")
    .select("month, amount")
    .eq("player_id", playerId)
    .eq("year", targetYear);

  if (forgErr) throw new Error(forgErr.message);

  const forgByMonth = new Map<number, number>();
  for (const r of forgRows ?? []) {
    const m = Number((r as any).month);
    const a = n((r as any).amount);
    forgByMonth.set(m, (forgByMonth.get(m) ?? 0) + a);
  }

  // aloca mês a mês
  let remaining = amount;
  const inserts: Array<{
    transaction_id: string;
    player_id: string;
    year: number;
    month: number;
    amount: number;
  }> = [];

  for (let month = 1; month <= 12 && remaining > 0.00001; month++) {
    const already = n(paidByMonth.get(month) ?? 0) + n(forgByMonth.get(month) ?? 0);
    const due = Math.max(monthlyFee - already, 0);
    if (due <= 0) continue;

    const alloc = Math.min(due, remaining);
    inserts.push({
      transaction_id: transactionId,
      player_id: playerId,
      year: targetYear,
      month,
      amount: Number(alloc.toFixed(2)),
    });
    remaining -= alloc;
  }

  if (inserts.length > 0) {
    const { error: insErr } = await supabase.from("allocations").insert(inserts);
    if (insErr) throw new Error(insErr.message);
  }
}

// ✅ Next 16.1 / turbopack: params pode vir como Promise
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireRole(["admin"]);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const supabase = gate.supabase;

  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));

  const date = body?.date;
  const amount = n(body?.amount);
  const description = typeof body?.description === "string" ? body.description : null;
  const target_year = body?.target_year == null ? null : Number(body.target_year);

  if (date != null && !isISODate(date)) {
    return NextResponse.json({ error: "Data inválida (use yyyy-mm-dd)." }, { status: 400 });
  }
  if (!(amount > 0)) {
    return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  }
  if (target_year != null && !Number.isFinite(target_year)) {
    return NextResponse.json({ error: "Ano inválido." }, { status: 400 });
  }

  // pega transação atual
  const { data: current, error: curErr } = await supabase
    .from("transactions")
    .select("id, type, player_id, target_year")
    .eq("id", id)
    .single();

  if (curErr || !current) {
    return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  }

  // atualiza
  const { data: updated, error: upErr } = await supabase
    .from("transactions")
    .update({
      date: date ?? undefined,
      amount,
      description,
      target_year,
    })
    .eq("id", id)
    .select("id, type, date, amount, description, player_id, target_year, receipt_path, created_at")
    .single();

  if (upErr || !updated) {
    return NextResponse.json({ error: upErr?.message ?? "Falha ao atualizar." }, { status: 400 });
  }

  // se for entrada, recria allocations
  if (updated.type === "in" && updated.player_id && updated.target_year) {
    await rebuildAllocationsForPayment({
      supabase,
      transactionId: updated.id,
      playerId: updated.player_id,
      targetYear: Number(updated.target_year),
      amount: n(updated.amount),
    });
  }

  return NextResponse.json({ transaction: updated });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const gate = await requireRole(["admin"]);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const supabase = gate.supabase;

  const { id } = await ctx.params;

  // allocations são removidas por cascade
  const { error } = await supabase.from("transactions").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
