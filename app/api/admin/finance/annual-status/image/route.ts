import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildAnnualStatusGrid } from "@/lib/finance/annualStatus";
import { renderAnnualStatusSvg } from "@/lib/finance/annualStatusSvg";

export const runtime = "nodejs";

async function requireAdminOrViewer() {
  const supabase = await createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) {
    return { ok: false as const, status: 401, error: "Nao autenticado." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role || !["admin", "admin_viewer"].includes(profile.role)) {
    return { ok: false as const, status: 403, error: "Sem permissao." };
  }

  return { ok: true as const };
}

export async function GET(req: Request) {
  const gate = await requireAdminOrViewer();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Ano invalido." }, { status: 400 });
  }

  try {
    const [playersRes, membershipsRes, allocationsRes, forgivenessRes, feesRes] =
      await Promise.all([
        supabaseAdmin.from("players").select("id, full_name").order("full_name", { ascending: true }),
        supabaseAdmin
          .from("player_memberships")
          .select("player_id, started_at, ended_at, billing_start_month"),
        supabaseAdmin
          .from("allocations")
          .select("player_id, year, month, amount")
          .eq("year", year),
        supabaseAdmin
          .from("forgiveness")
          .select("player_id, year, month, amount")
          .eq("year", year),
        supabaseAdmin.from("year_fees").select("year, monthly_fee").eq("year", year),
      ]);

    const firstError =
      playersRes.error ??
      membershipsRes.error ??
      allocationsRes.error ??
      forgivenessRes.error ??
      feesRes.error;

    if (firstError) {
      throw firstError;
    }

    const grid = buildAnnualStatusGrid({
      year,
      players: playersRes.data ?? [],
      memberships: membershipsRes.data ?? [],
      allocations: allocationsRes.data ?? [],
      forgiveness: forgivenessRes.data ?? [],
      fees: feesRes.data ?? [],
    });

    const svg = renderAnnualStatusSvg(grid);

    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="mensalidades-${year}.svg"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Falha ao gerar imagem.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
