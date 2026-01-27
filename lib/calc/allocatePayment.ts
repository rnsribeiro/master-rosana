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

function monthStartISO(year: number, month: number) {
  return new Date(year, month - 1, 1).toISOString().slice(0, 10);
}

function isMonthInMembership(year: number, month: number, memberships: { started_at: string; ended_at: string | null }[]) {
  const ms = monthStartISO(year, month);
  return memberships.some((m) => {
    if (!m.ended_at) return ms >= m.started_at;
    return ms >= m.started_at && ms <= m.ended_at;
  });
}

export function allocatePayment(params: {
  memberships: { started_at: string; ended_at: string | null }[];
  amount: number;
  fees: { year: number; monthly_fee: number }[];
  existingAllocations: { year: number; month: number; amount: number }[];
  existingForgiveness: { year: number; month: number; amount: number }[];
}) {
  let remaining = Number(params.amount);

  const feeMap = new Map<number, number>();
  params.fees.forEach((f) => feeMap.set(Number(f.year), Number(f.monthly_fee)));

  const covered = new Map<string, number>();
  params.existingAllocations.forEach((a) => {
    const k = ymKey(a.year, a.month);
    covered.set(k, (covered.get(k) ?? 0) + Number(a.amount));
  });
  params.existingForgiveness.forEach((f) => {
    const k = ymKey(f.year, f.month);
    covered.set(k, (covered.get(k) ?? 0) + Number(f.amount));
  });

  if (!params.memberships || params.memberships.length === 0) {
    return { newAllocations: [], credit: remaining };
  }

  const starts = params.memberships.map((m) => parseISO(m.started_at));
  const minStart = new Date(Math.min(...starts.map((d) => d.getTime())));
  const end = parseISO(new Date().toISOString()); // até mês atual

  const newAllocations: Array<{ year: number; month: number; amount: number }> = [];

  for (let d = new Date(minStart); d <= end && remaining > 0; d = addMonths(d, 1)) {
    const year = d.getFullYear();
    const month = d.getMonth() + 1;

    if (!isMonthInMembership(year, month, params.memberships)) continue;

    const fee = feeMap.get(year) ?? 0;
    if (fee <= 0) continue;

    const k = ymKey(year, month);
    const already = covered.get(k) ?? 0;
    const due = Math.max(0, fee - already);
    if (due <= 0) continue;

    const value = Math.min(due, remaining);
    newAllocations.push({ year, month, amount: value });

    covered.set(k, already + value);
    remaining -= value;
  }

  return { newAllocations, credit: Math.max(0, remaining) };
}
