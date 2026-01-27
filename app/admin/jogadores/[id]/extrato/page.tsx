"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

type Fee = { year: number; monthly_fee: number };
type Allocation = { year: number; month: number; amount: number };
type Forg = { year: number; month: number; amount: number; reason: string | null };
type Membership = { started_at: string; ended_at: string | null };
type Payment = { id: string; date: string; amount: number; description: string | null; target_year: number | null };

type StatementMonth = {
  year: number;
  month: number;
  fee: number;
  paid: number;
  forgiven: number;
  due: number;
  status: "paid" | "partial" | "due" | "no_fee_config";
};

function statusLabel(s: StatementMonth["status"]) {
  if (s === "paid") return "Pago";
  if (s === "partial") return "Parcial";
  if (s === "due") return "Em aberto";
  return "Mensalidade não configurada";
}

export default function ExtratoJogadorPage({ params }: { params: { id: string } }) {
  const playerId = params.id;

  const [playerName, setPlayerName] = useState<string>("");
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [forgiveness, setForgiveness] = useState<Forg[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [months, setMonths] = useState<StatementMonth[]>([]);
  const [credit, setCredit] = useState<number>(0);
  const [msg, setMsg] = useState<string | null>(null);

  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setMsg(null);
    setLoading(true);

    const [{ data: p }, { data: m }, { data: f }, { data: a }, { data: g }, { data: t }] =
      await Promise.all([
        supabase.from("players").select("full_name").eq("id", playerId).single(),
        supabase.from("player_memberships").select("started_at, ended_at").eq("player_id", playerId).order("started_at"),
        supabase.from("year_fees").select("year, monthly_fee"),
        supabase.from("allocations").select("year, month, amount").eq("player_id", playerId),
        supabase.from("forgiveness").select("year, month, amount, reason").eq("player_id", playerId),
        supabase
          .from("transactions")
          .select("id, date, amount, description, target_year")
          .eq("type", "in")
          .eq("player_id", playerId)
          .order("date", { ascending: true }),
      ]);

    setPlayerName(p?.full_name ?? "");
    setMemberships((m ?? []) as Membership[]);
    setFees((f ?? []) as Fee[]);
    setAllocations((a ?? []) as Allocation[]);
    setForgiveness((g ?? []) as Forg[]);
    setPayments((t ?? []) as Payment[]);

    // monta o “statement” no client para admin (rápido, sem API extra)
    const result = computeStatement({
      memberships: (m ?? []) as Membership[],
      fees: (f ?? []) as Fee[],
      allocations: (a ?? []) as Allocation[],
      forgiveness: (g ?? []) as Forg[],
      payments: (t ?? []) as Payment[],
    });

    setMonths(result.months);
    setCredit(result.credit);

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  const openMonths = useMemo(() => months.filter((x) => x.status === "due" || x.status === "partial"), [months]);

  async function forgiveMonth(year: number, month: number, due: number) {
    setMsg(null);

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      setMsg("Sessão inválida.");
      return;
    }

    const res = await fetch("/api/admin/forgiveness/apply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        player_id: playerId,
        year,
        month,
        amount: due,
        reason: reason || null,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setMsg(json?.error ?? "Erro ao perdoar.");
      return;
    }

    setMsg(`Perdão aplicado em ${String(month).padStart(2, "0")}/${year}.`);
    setReason("");
    await load();
  }

  if (loading) return <div className="text-zinc-400">Carregando…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Extrato do Jogador</h1>
          <p className="text-zinc-400 text-sm">{playerName || "—"}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/admin/jogadores/${playerId}`}
            className="rounded-xl bg-zinc-950 border border-zinc-800 px-4 py-2 hover:border-zinc-600"
          >
            Voltar
          </Link>
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
          <div>
            <div className="text-sm text-zinc-400">Crédito atual</div>
            <div className="text-2xl font-semibold">R$ {credit.toFixed(2)}</div>
          </div>
          <div className="text-sm text-zinc-400">
            Meses em aberto: <span className="text-zinc-200">{openMonths.length}</span>
          </div>
        </div>
      </div>

      {msg && (
        <div className="text-sm text-zinc-200 bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">{msg}</div>
      )}

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <h2 className="text-lg font-semibold">Perdoar dívida (granular)</h2>
        <p className="text-sm text-zinc-400">
          Clique em “Perdoar” ao lado do mês. O valor perdoado será exatamente o “Em aberto” daquele mês.
        </p>

        <div>
          <label className="text-sm text-zinc-300">Motivo (opcional)</label>
          <input
            className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: acordo, isenção, retorno ao clube..."
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-zinc-400">
              <tr className="border-b border-zinc-800">
                <th className="text-left py-2 pr-4">Mês</th>
                <th className="text-left py-2 pr-4">Mensalidade</th>
                <th className="text-left py-2 pr-4">Pago</th>
                <th className="text-left py-2 pr-4">Perdoado</th>
                <th className="text-left py-2 pr-4">Em aberto</th>
                <th className="text-left py-2 pr-4">Status</th>
                <th className="text-left py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={`${m.year}-${m.month}`} className="border-b border-zinc-900">
                  <td className="py-2 pr-4">{String(m.month).padStart(2, "0")}/{m.year}</td>
                  <td className="py-2 pr-4">R$ {m.fee.toFixed(2)}</td>
                  <td className="py-2 pr-4">R$ {m.paid.toFixed(2)}</td>
                  <td className="py-2 pr-4">R$ {m.forgiven.toFixed(2)}</td>
                  <td className="py-2 pr-4">R$ {m.due.toFixed(2)}</td>
                  <td className="py-2 pr-4">{statusLabel(m.status)}</td>
                  <td className="py-2 pr-4">
                    {(m.status === "due" || m.status === "partial") && m.due > 0 ? (
                      <button
                        onClick={() => forgiveMonth(m.year, m.month, m.due)}
                        className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-1.5 hover:border-zinc-600"
                      >
                        Perdoar
                      </button>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {months.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-3 text-zinc-400">
                    Nenhum mês cobrável. Verifique se existe pelo menos um período de participação.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
        <h2 className="text-lg font-semibold">Pagamentos</h2>
        <div className="mt-3 space-y-2">
          {payments
            .slice()
            .sort((a, b) => (a.date > b.date ? -1 : 1))
            .map((p) => (
              <div
                key={p.id}
                className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3 flex items-start justify-between gap-3"
              >
                <div>
                  <div className="text-sm text-zinc-300">
                    {new Date(p.date + "T00:00:00").toLocaleDateString("pt-BR")}
                  </div>
                  <div className="text-xs text-zinc-500">{p.description ?? "Sem descrição"}</div>
                </div>
                <div className="font-semibold">R$ {Number(p.amount).toFixed(2)}</div>
              </div>
            ))}
          {payments.length === 0 && <div className="text-zinc-400 text-sm">Nenhum pagamento.</div>}
        </div>
      </div>
    </div>
  );
}

function computeStatement(args: {
  memberships: Membership[];
  fees: Fee[];
  allocations: Allocation[];
  forgiveness: Forg[];
  payments: Payment[];
}) {
  // Reaproveita as mesmas regras do server, mas sem importar arquivo para evitar duplicação complexa aqui.
  // (Se preferir, podemos criar um util compartilhado.)
  const feeMap = new Map<number, number>();
  args.fees.forEach((f) => feeMap.set(f.year, Number(f.monthly_fee)));

  const coveredMap = new Map<string, { paid: number; forgiven: number }>();
  for (const a of args.allocations) {
    const k = `${a.year}-${String(a.month).padStart(2, "0")}`;
    const cur = coveredMap.get(k) ?? { paid: 0, forgiven: 0 };
    cur.paid += Number(a.amount);
    coveredMap.set(k, cur);
  }
  for (const g of args.forgiveness) {
    const k = `${g.year}-${String(g.month).padStart(2, "0")}`;
    const cur = coveredMap.get(k) ?? { paid: 0, forgiven: 0 };
    cur.forgiven += Number(g.amount);
    coveredMap.set(k, cur);
  }

  function monthStartISO(year: number, month: number) {
    return new Date(year, month - 1, 1).toISOString().slice(0, 10);
  }
  function inMembership(year: number, month: number) {
    const ms = monthStartISO(year, month);
    return args.memberships.some((m) => {
      if (!m.ended_at) return ms >= m.started_at;
      return ms >= m.started_at && ms <= m.ended_at;
    });
  }

  if (args.memberships.length === 0) {
    const totalPaid = args.payments.reduce((s, p) => s + Number(p.amount), 0);
    const totalAllocated = args.allocations.reduce((s, a) => s + Number(a.amount), 0);
    return { months: [], credit: Math.max(0, totalPaid - totalAllocated) };
  }

  const minStart = new Date(Math.min(...args.memberships.map((m) => new Date(m.started_at).getTime())));
  const end = new Date(new Date().toISOString().slice(0, 7) + "-01T00:00:00");

  const months: StatementMonth[] = [];
  for (let d = new Date(minStart); d <= end; d.setMonth(d.getMonth() + 1)) {
    const year = d.getFullYear();
    const month = d.getMonth() + 1;

    if (!inMembership(year, month)) continue;

    const fee = feeMap.get(year) ?? 0;
    const k = `${year}-${String(month).padStart(2, "0")}`;
    const cur = coveredMap.get(k) ?? { paid: 0, forgiven: 0 };

    if (fee <= 0) {
      months.push({ year, month, fee: 0, paid: cur.paid, forgiven: cur.forgiven, due: 0, status: "no_fee_config" });
      continue;
    }

    const covered = cur.paid + cur.forgiven;
    const due = Math.max(0, fee - covered);

    let status: StatementMonth["status"] = "due";
    if (due === 0) status = "paid";
    else if (covered > 0) status = "partial";

    months.push({ year, month, fee, paid: cur.paid, forgiven: cur.forgiven, due, status });
  }

  const totalPaid = args.payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalAllocated = args.allocations.reduce((s, a) => s + Number(a.amount), 0);
  return { months, credit: Math.max(0, totalPaid - totalAllocated) };
}
