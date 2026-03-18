export type AnnualStatusPlayer = {
  id: string;
  full_name: string;
};

export type AnnualStatusMembership = {
  player_id: string;
  started_at: string;
  ended_at: string | null;
  billing_start_month?: string | null;
};

export type AnnualStatusAllocation = {
  player_id: string;
  year: number | string;
  month: number | string;
  amount: number | string | null;
};

export type AnnualStatusForgiveness = {
  player_id: string;
  year: number | string;
  month: number | string;
  amount: number | string | null;
};

export type AnnualStatusFee = {
  year: number | string;
  monthly_fee: number | string | null;
};

export type AnnualStatusCellStatus =
  | "paid"
  | "partial"
  | "due"
  | "no_fee_config"
  | "not_applicable";

export type AnnualStatusCell = {
  month: number;
  applicable: boolean;
  fee: number;
  paid: number;
  forgiven: number;
  due: number;
  status: AnnualStatusCellStatus;
};

export type AnnualStatusRow = {
  playerId: string;
  playerName: string;
  months: AnnualStatusCell[];
};

export type AnnualStatusGrid = {
  year: number;
  monthlyFee: number;
  rows: AnnualStatusRow[];
};

function n(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoToTime(iso: string) {
  return new Date(`${iso}T00:00:00Z`).getTime();
}

function monthStartISO(year: number, month: number) {
  const mm = String(month).padStart(2, "0");
  return `${year}-${mm}-01`;
}

function monthEndISO(year: number, month: number) {
  const d = new Date(Date.UTC(year, month, 0));
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

function applicableMonthsForYear(year: number, memberships: AnnualStatusMembership[]) {
  const applicable = new Set<number>();

  for (let month = 1; month <= 12; month++) {
    const monthStart = monthStartISO(year, month);
    const monthEnd = monthEndISO(year, month);

    const isApplicable = memberships.some((membership) => {
      const started = String(membership.started_at);
      const billing = membership.billing_start_month
        ? String(membership.billing_start_month)
        : null;
      const effectiveStart =
        billing && isoToTime(billing) > isoToTime(started) ? billing : started;
      const ended = membership.ended_at ? String(membership.ended_at) : "9999-12-31";

      return overlaps(effectiveStart, ended, monthStart, monthEnd);
    });

    if (isApplicable) {
      applicable.add(month);
    }
  }

  return applicable;
}

function buildAmountMap<T extends AnnualStatusAllocation | AnnualStatusForgiveness>(
  rows: T[],
  targetYear: number
) {
  const amountMap = new Map<string, number>();

  for (const row of rows) {
    if (Number(row.year) !== targetYear) continue;

    const month = Number(row.month);
    const key = `${row.player_id}:${month}`;
    amountMap.set(key, (amountMap.get(key) ?? 0) + n(row.amount));
  }

  return amountMap;
}

export function buildAnnualStatusGrid(params: {
  year: number;
  players: AnnualStatusPlayer[];
  memberships: AnnualStatusMembership[];
  allocations: AnnualStatusAllocation[];
  forgiveness: AnnualStatusForgiveness[];
  fees: AnnualStatusFee[];
}) {
  const feeRow = params.fees.find((fee) => Number(fee.year) === params.year);
  const monthlyFee = n(feeRow?.monthly_fee);

  const membershipsByPlayer = new Map<string, AnnualStatusMembership[]>();
  for (const membership of params.memberships) {
    const list = membershipsByPlayer.get(membership.player_id) ?? [];
    list.push(membership);
    membershipsByPlayer.set(membership.player_id, list);
  }

  const paidMap = buildAmountMap(params.allocations, params.year);
  const forgivenMap = buildAmountMap(params.forgiveness, params.year);

  const rows = params.players
    .map((player) => {
      const playerMemberships = membershipsByPlayer.get(player.id) ?? [];
      const applicableMonths = applicableMonthsForYear(params.year, playerMemberships);

      const months: AnnualStatusCell[] = [];

      for (let month = 1; month <= 12; month++) {
        const key = `${player.id}:${month}`;
        const paid = n(paidMap.get(key));
        const forgiven = n(forgivenMap.get(key));
        const applicable = applicableMonths.has(month);
        const hasCoverage = paid > 0 || forgiven > 0;

        if (!applicable && !hasCoverage) {
          months.push({
            month,
            applicable: false,
            fee: 0,
            paid: 0,
            forgiven: 0,
            due: 0,
            status: "not_applicable",
          });
          continue;
        }

        if (monthlyFee <= 0) {
          months.push({
            month,
            applicable: applicable || hasCoverage,
            fee: 0,
            paid,
            forgiven,
            due: 0,
            status: "no_fee_config",
          });
          continue;
        }

        const covered = paid + forgiven;
        const due = Math.max(monthlyFee - covered, 0);

        months.push({
          month,
          applicable: applicable || hasCoverage,
          fee: monthlyFee,
          paid,
          forgiven,
          due,
          status: due === 0 ? "paid" : covered > 0 ? "partial" : "due",
        });
      }

      return {
        playerId: player.id,
        playerName: player.full_name,
        months,
      } satisfies AnnualStatusRow;
    })
    .filter((row) =>
      row.months.some(
        (month) => month.applicable || month.paid > 0 || month.forgiven > 0
      )
    )
    .sort((a, b) => a.playerName.localeCompare(b.playerName, "pt-BR"));

  return {
    year: params.year,
    monthlyFee,
    rows,
  } satisfies AnnualStatusGrid;
}
