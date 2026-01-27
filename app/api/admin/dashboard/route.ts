import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceRole, {
    auth: { persistSession: false },
  });
}

type DashboardRow = {
  id: string;
  full_name: string;
  pin: string;
  active_started_at: string | null;
  is_active: boolean;
  total_paid: number;
  last_payment_date: string | null;
};

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // 1) players
    const { data: players, error: pErr } = await supabaseAdmin
      .from("players")
      .select("id, full_name, pin")
      .order("full_name", { ascending: true });

    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 400 });
    }

    const ids = (players ?? []).map((p) => p.id);
    if (ids.length === 0) {
      return NextResponse.json({ rows: [] satisfies DashboardRow[] });
    }

    // 2) memberships ativos (ended_at null)
    const { data: memberships, error: mErr } = await supabaseAdmin
      .from("player_memberships")
      .select("player_id, started_at, ended_at")
      .in("player_id", ids)
      .is("ended_at", null);

    if (mErr) {
      return NextResponse.json({ error: mErr.message }, { status: 400 });
    }

    const activeMap = new Map<string, { started_at: string }>();
    for (const m of memberships ?? []) {
      activeMap.set(m.player_id, { started_at: m.started_at });
    }

    // 3) Pagamentos (ENTRADAS)
    // ⚠️ Ajuste o nome da tabela se a sua for diferente.
    // Aqui assume "entries" com colunas: player_id, date, amount
    const { data: entries, error: eErr } = await supabaseAdmin
      .from("entries")
      .select("player_id, date, amount")
      .in("player_id", ids);

    // Se você não tiver a tabela "entries" ainda, pode comentar esse bloco.
    if (eErr) {
      return NextResponse.json(
        {
          error:
            `Falha ao buscar pagamentos (tabela "entries"). ` +
            `Se sua tabela tiver outro nome, me diga qual é para eu ajustar. ` +
            `Detalhe: ${eErr.message}`,
        },
        { status: 400 }
      );
    }

    const sumPaid = new Map<string, number>();
    const lastPay = new Map<string, string>();

    for (const e of entries ?? []) {
      const prev = sumPaid.get(e.player_id) ?? 0;
      sumPaid.set(e.player_id, prev + Number(e.amount || 0));

      const prevDate = lastPay.get(e.player_id);
      if (!prevDate || String(e.date) > prevDate) {
        lastPay.set(e.player_id, String(e.date));
      }
    }

    const rows: DashboardRow[] = (players ?? []).map((p) => {
      const active = activeMap.get(p.id);
      return {
        id: p.id,
        full_name: p.full_name,
        pin: p.pin,
        is_active: !!active,
        active_started_at: active?.started_at ?? null,
        total_paid: sumPaid.get(p.id) ?? 0,
        last_payment_date: lastPay.get(p.id) ?? null,
      };
    });

    return NextResponse.json({ rows });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Erro inesperado" },
      { status: 500 }
    );
  }
}
