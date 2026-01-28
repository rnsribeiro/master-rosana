type Membership = {
  started_at: string; // YYYY-MM-DD
  ended_at: string | null; // YYYY-MM-DD | null
  billing_start_month?: string | null; // ✅ novo (YYYY-MM-01)
};

type FeeRow = {
  year: number;
  monthly_fee: any;
};

type ExistingAllocation = {
  year: number;
  month: number;
  amount: any;
};

type ExistingForgiveness = {
  year: number;
  month: number;
  amount: any;
};

type NewAllocation = {
  year: number;
  month: number;
  amount: number;
};

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function isoToTime(iso: string) {
  // usa UTC pra evitar “pular um dia” por timezone
  return new Date(iso + "T00:00:00Z").getTime();
}

function monthStartISO(year: number, month: number) {
  const mm = String(month).padStart(2, "0");
  return `${year}-${mm}-01`;
}

function monthEndISO(year: number, month: number) {
  // último dia do mês
  const d = new Date(Date.UTC(year, month, 0)); // month=1..12 => day 0 do próximo mês
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  const a1 = isoToTime(startA);
  const a2 = isoToTime(endA);
  const b1 = isoToTime(startB);
  const b2 = isoToTime(endB);
  return a1 <= b2 && b1 <= a2;
}

/**
 * Meses elegíveis no ano (1..12) respeitando memberships + billing_start_month:
 * mês é elegível se existir algum membership que sobreponha o mês, considerando:
 *   effective_start = max(started_at, billing_start_month)
 */
function eligibleMonthsForYear(year: number, memberships: Membership[]) {
  const eligible = new Set<number>();

  for (let month = 1; month <= 12; month++) {
    const mStart = monthStartISO(year, month);
    const mEnd = monthEndISO(year, month);

    const ok = memberships.some((m) => {
      const started = String(m.started_at);
      const billing = m.billing_start_month ? String(m.billing_start_month) : null;

      // ✅ início efetivo da cobrança
      const effectiveStart =
        billing && isoToTime(billing) > isoToTime(started) ? billing : started;

      const end = m.ended_at ? String(m.ended_at) : "9999-12-31";

      return overlaps(effectiveStart, end, mStart, mEnd);
    });

    if (ok) eligible.add(month);
  }

  return eligible;
}

/**
 * Aloca um pagamento no ANO alvo, mês a mês, respeitando:
 * - mensalidade do ano (year_fees)
 * - o que já foi alocado + perdoado em cada mês
 * - memberships: NÃO aloca em meses fora do período de cobrança (billing_start_month)
 */
export function allocatePayment(params: {
  memberships: Membership[];
  amount: number;
  fees: FeeRow[];
  existingAllocations: ExistingAllocation[];
  existingForgiveness: ExistingForgiveness[];
  targetYear: number;
}): { newAllocations: NewAllocation[] } {
  const { memberships, amount, fees, existingAllocations, existingForgiveness, targetYear } = params;

  const feeRow = (fees ?? []).find((f) => Number(f.year) === Number(targetYear));
  const monthlyFee = n(feeRow?.monthly_fee);

  if (!(monthlyFee > 0)) {
    return { newAllocations: [] };
  }

  // ✅ meses elegíveis (por cobrança)
  const eligible = eligibleMonthsForYear(targetYear, memberships ?? []);
  if (eligible.size === 0) {
    // sem período de cobrança nesse ano => vira crédito implícito
    return { newAllocations: [] };
  }

  // soma do que já foi alocado/perdoado por mês no ano alvo
  const alreadyByMonth = new Map<number, number>();

  for (const a of existingAllocations ?? []) {
    if (Number(a.year) !== Number(targetYear)) continue;
    const m = Number(a.month);
    alreadyByMonth.set(m, (alreadyByMonth.get(m) ?? 0) + n(a.amount));
  }

  for (const f of existingForgiveness ?? []) {
    if (Number(f.year) !== Number(targetYear)) continue;
    const m = Number(f.month);
    alreadyByMonth.set(m, (alreadyByMonth.get(m) ?? 0) + n(f.amount));
  }

  let remaining = n(amount);
  const newAllocations: NewAllocation[] = [];

  for (let month = 1; month <= 12 && remaining > 0.00001; month++) {
    if (!eligible.has(month)) continue; // ✅ regra principal

    const already = n(alreadyByMonth.get(month) ?? 0);
    const due = Math.max(monthlyFee - already, 0);
    if (due <= 0) continue;

    const alloc = Math.min(due, remaining);
    if (alloc > 0) {
      newAllocations.push({
        year: targetYear,
        month,
        amount: Number(alloc.toFixed(2)),
      });
      remaining -= alloc;
    }
  }

  return { newAllocations };
}
