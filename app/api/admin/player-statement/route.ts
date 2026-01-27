import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MonthRow = {
  year: number;
  month: number;
  fee: number;
  paid: number;
  forgiven: number;
  due: number;
  status: "paid" | "partial" | "due" | "no_fee_config";
};

type TransactionIn = {
  id: string;
  date: string; // yyyy-mm-dd
  amount: number;
  description: string | null;
  target_year: number | null;
};

function ymKey(y: number, m: number) {
  return `${y}-${String(m).padStart(2, "0")}`;
}
function monthDate(y: number, m: number) {
  return new Date(y, m - 1, 1);
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, count: number) {
  const nd = new Date(d);
  nd.setMonth(nd.getMonth() + count);
  return nd;
}
function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function maxDate(a: Date, b: Date) {
  return a.getTime() >= b.getTime() ? a : b;
}
function minDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

/**
 * ✅ Igual visão do jogador:
 * - Se entrou no dia 1: começa no próprio mês
 * - Se entrou no dia > 1: começa no mês seguinte (não cobra mês parcial)
 */
function computeBillingStart(startedAtISO: string) {
  const d = new Date(`${startedAtISO}T00:00:00`);
  const base = startOfMonth(d);
  if (d.getDate() > 1) return addMonths(base, 1);
  return base;
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();

  const url = new URL(req.url);
  const playerId = url.searchParams.get("playerId");
  if (!playerId) {
    return NextResponse.json({ error: "playerId é obrigatório." }, { status: 400 });
  }

  // auth
  const {
    data: { user },
    error: uErr,
  } = await supabase.auth.getUser();

  if (uErr || !user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  // role check
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profErr || !profile?.role || !["admin", "admin_viewer"].includes(profile.role)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  // player basic
  const { data: player, error: pErr } = await supabase
    .from("players")
    .select("id, full_name")
    .eq("id", playerId)
    .single();

  if (pErr || !player) {
    return NextResponse.json({ error: "Jogador não encontrado." }, { status: 404 });
  }

  // membership: pega o período mais recente (aberto ou último)
  const { data: memberships, error: mErr } = await supabase
    .from("player_memberships")
    .select("started_at, ended_at")
    .eq("player_id", playerId)
    .order("started_at", { ascending: false })
    .limit(1);

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 400 });
  }

  const last = memberships?.[0];
  if (!last?.started_at) {
    return NextResponse.json({
      player,
      statement: {
        months: [],
        credit: 0,
        payments: [],
        summary: { totalPaid: 0, totalAllocated: 0, totalForgiven: 0, totalDue: 0 },
      },
    });
  }

  // ✅ início como no jogador
  const start = computeBillingStart(last.started_at);

  // year fees
  const { data: fees, error: fErr } = await supabase
    .from("year_fees")
    .select("year, monthly_fee");

  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 400 });

  const feeByYear = new Map<number, number>();
  for (const r of fees ?? []) feeByYear.set(Number(r.year), n((r as any).monthly_fee));

  // allocations
  const { data: allocs, error: aErr } = await supabase
    .from("allocations")
    .select("year, month, amount")
    .eq("player_id", playerId);

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 400 });

  const paidMap = new Map<string, number>();
  let totalAllocated = 0;

  // Para permitir “pagou adiantado”: descobrir o mês MAIS FUTURO com pagamento
  let maxPaidMonth: Date | null = null;

  for (const a of allocs ?? []) {
    const y = Number((a as any).year);
    const m = Number((a as any).month);
    const amount = n((a as any).amount);

    const k = ymKey(y, m);
    const v = (paidMap.get(k) ?? 0) + amount;
    paidMap.set(k, v);
    totalAllocated += amount;

    if (amount > 0) {
      const d = monthDate(y, m);
      maxPaidMonth = maxPaidMonth ? maxDate(maxPaidMonth, d) : d;
    }
  }

  // forgiveness
  const { data: forg, error: gErr } = await supabase
    .from("forgiveness")
    .select("year, month, amount")
    .eq("player_id", playerId);

  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 400 });

  const forgMap = new Map<string, number>();
  let totalForgiven = 0;

  // Mesma ideia: se perdoou no futuro, também deve aparecer
  let maxForgMonth: Date | null = null;

  for (const g of forg ?? []) {
    const y = Number((g as any).year);
    const m = Number((g as any).month);
    const amount = n((g as any).amount);

    const k = ymKey(y, m);
    const v = (forgMap.get(k) ?? 0) + amount;
    forgMap.set(k, v);
    totalForgiven += amount;

    if (amount > 0) {
      const d = monthDate(y, m);
      maxForgMonth = maxForgMonth ? maxDate(maxForgMonth, d) : d;
    }
  }

  // transactions type=in (lista e totalPaid)
  const { data: txsRaw, error: tErr } = await supabase
    .from("transactions")
    .select("id, date, amount, description, target_year")
    .eq("type", "in")
    .eq("player_id", playerId)
    .order("date", { ascending: false });

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 });

  const txs = (txsRaw ?? []) as TransactionIn[];

  let totalPaid = 0;
  const payments = txs.map((t) => {
    totalPaid += n(t.amount);
    return {
      id: t.id,
      date: t.date,
      amount: n(t.amount),
      description: t.description ?? null,
      target_year: t.target_year ?? null,
    };
  });

  // ✅ FIM: até o mês atual
  const currentMonth = startOfMonth(new Date());

  // ✅ Se tem pagamento/perdão no futuro, estende até o maior mês futuro
  let endLimit = currentMonth;
  if (maxPaidMonth) endLimit = maxDate(endLimit, maxPaidMonth);
  if (maxForgMonth) endLimit = maxDate(endLimit, maxForgMonth);

  // Se ended_at existir, corta no mês do fim (se for menor)
  if (last.ended_at) {
    const ended = startOfMonth(new Date(`${last.ended_at}T00:00:00`));
    endLimit = minDate(endLimit, ended);
  }

  // garante pelo menos start
  if (endLimit < start) endLimit = new Date(start);

  // months
  const months: MonthRow[] = [];
  let totalDue = 0;

  let cursor = new Date(start);
  let guard = 0;

  while (cursor <= endLimit && guard < 240) {
    guard++;
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;

    const fee = feeByYear.get(y);

    if (!fee || fee <= 0) {
      const k = ymKey(y, m);
      const paid = n(paidMap.get(k) ?? 0);
      const forgiven = n(forgMap.get(k) ?? 0);
      const due = 0;

      // Se tiver valor pago/perdoado mesmo sem config, mostra como “no_fee_config”
      months.push({
        year: y,
        month: m,
        fee: 0,
        paid,
        forgiven,
        due,
        status: "no_fee_config",
      });
    } else {
      const k = ymKey(y, m);
      const paid = n(paidMap.get(k) ?? 0);
      const forgiven = n(forgMap.get(k) ?? 0);
      const due = Math.max(n(fee) - paid - forgiven, 0);

      totalDue += due;

      const status: MonthRow["status"] =
        due <= 0 ? "paid" : paid + forgiven > 0 ? "partial" : "due";

      months.push({
        year: y,
        month: m,
        fee: n(fee),
        paid,
        forgiven,
        due,
        status,
      });
    }

    cursor = addMonths(cursor, 1);
  }

  const credit = Math.max(totalPaid - totalAllocated, 0);

  return NextResponse.json({
    player,
    statement: {
      months,
      credit,
      payments,
      summary: {
        totalPaid,
        totalAllocated,
        totalForgiven,
        totalDue,
      },
    },
  });
}
