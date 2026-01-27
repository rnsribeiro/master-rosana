export function normText(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

type MonthStatus = "paid" | "partial" | "due" | "no_fee_config";

function ymKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseISO(d: string) {
  const [y, m] = d.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1);
}

function addMonths(d: Date, n: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function monthStartDate(year: number, month: number) {
  return new Date(year, month - 1, 1);
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isMonthCoveredByAnyMembership(
  year: number,
  month: number,
  memberships: { started_at: string; ended_at: string | null }[]
) {
  const ms = monthStartDate(year, month);
  const msISO = toISODate(ms);

  return memberships.some((m) => {
    const start = m.started_at;
    const end = m.ended_at;
    if (!end) return msISO >= start;      // período aberto
    return msISO >= start && msISO <= end; // período fechado
  });
}

export function buildPlayerStatement(params: {
  memberships: { started_at: string; ended_at: string | null }[];
  payments: { id: string; date: string; amount: number; description: string | null; target_year: number | null }[];
  allocations: { year: number; month: number; amount: number }[];
  forgiveness: { year: number; month: number; amount: number }[];
  fees: { year: number; monthly_fee: number }[];
}) {
  // Se não tiver nenhum período, não há meses cobraveis
  if (!params.memberships || params.memberships.length === 0) {
    const totalPaid = params.payments.reduce((s, p) => s + Number(p.amount), 0);
    const totalAllocated = params.allocations.reduce((s, a) => s + Number(a.amount), 0);
    return {
      months: [],
      credit: Math.max(0, totalPaid - totalAllocated),
      payments: params.payments,
      summary: {
        totalPaid,
        totalAllocated,
        totalDue: 0,
      },
    };
  }

  // intervalo global (do menor started_at até hoje, ou maior ended_at se for depois)
  const starts = params.memberships.map((m) => parseISO(m.started_at));
  const minStart = new Date(Math.min(...starts.map((d) => d.getTime())));
  const todayMonth = parseISO(new Date().toISOString());

  // fee map
  const feeMap = new Map<number, number>();
  params.fees.forEach((f) => feeMap.set(f.year, Number(f.monthly_fee)));

  // cobertura por mês: allocations + forgiveness
  const coveredMap = new Map<string, { paid: number; forgiven: number }>();

  for (const a of params.allocations) {
    const k = ymKey(a.year, a.month);
    const cur = coveredMap.get(k) ?? { paid: 0, forgiven: 0 };
    cur.paid += Number(a.amount);
    coveredMap.set(k, cur);
  }

  for (const f of params.forgiveness) {
    const k = ymKey(f.year, f.month);
    const cur = coveredMap.get(k) ?? { paid: 0, forgiven: 0 };
    cur.forgiven += Number(f.amount);
    coveredMap.set(k, cur);
  }

  const months: Array<{
    year: number;
    month: number;
    fee: number;
    paid: number;
    forgiven: number;
    due: number;
    status: MonthStatus;
  }> = [];

  for (let d = new Date(minStart); d <= todayMonth; d = addMonths(d, 1)) {
    const year = d.getFullYear();
    const month = d.getMonth() + 1;

    // só inclui mês se estiver em algum período de participação
    if (!isMonthCoveredByAnyMembership(year, month, params.memberships)) continue;

    const fee = feeMap.get(year) ?? 0;
    const cur = coveredMap.get(ymKey(year, month)) ?? { paid: 0, forgiven: 0 };

    if (fee <= 0) {
      months.push({
        year,
        month,
        fee: 0,
        paid: cur.paid,
        forgiven: cur.forgiven,
        due: 0,
        status: "no_fee_config",
      });
      continue;
    }

    const covered = cur.paid + cur.forgiven;
    const due = Math.max(0, fee - covered);

    let status: MonthStatus = "due";
    if (due === 0) status = "paid";
    else if (covered > 0) status = "partial";

    months.push({
      year,
      month,
      fee,
      paid: cur.paid,
      forgiven: cur.forgiven,
      due,
      status,
    });
  }

  const totalPaid = params.payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalAllocated = params.allocations.reduce((s, a) => s + Number(a.amount), 0);

  return {
    months,
    credit: Math.max(0, totalPaid - totalAllocated),
    payments: params.payments,
    summary: {
      totalPaid,
      totalAllocated,
      totalDue: months.reduce((s, m) => s + m.due, 0),
    },
  };
}
