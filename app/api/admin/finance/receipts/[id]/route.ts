import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function getIdFromCtx(ctx: { params?: Promise<{ id?: string }> | { id?: string } }) {
  const params = ctx?.params;
  if (!params) return "";

  const resolved = typeof (params as Promise<{ id?: string }>).then === "function"
    ? await (params as Promise<{ id?: string }>)
    : (params as { id?: string });

  return String(resolved?.id ?? "");
}

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

export async function GET(
  req: Request,
  ctx: { params?: Promise<{ id?: string }> | { id?: string } }
) {
  const gate = await requireAdminOrViewer();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const transactionId = await getIdFromCtx(ctx);
  if (!isUuid(transactionId)) {
    return NextResponse.json({ error: "ID invalido." }, { status: 400 });
  }

  const { data: tx, error: txError } = await supabaseAdmin
    .from("transactions")
    .select("receipt_path")
    .eq("id", transactionId)
    .single();

  if (txError || !tx) {
    return NextResponse.json({ error: "Lancamento nao encontrado." }, { status: 404 });
  }

  if (!tx.receipt_path) {
    return NextResponse.json({ error: "Este lancamento nao possui comprovante." }, { status: 404 });
  }

  const url = new URL(req.url);
  const shouldDownload = url.searchParams.get("download") === "1";

  const { data, error } = await supabaseAdmin.storage
    .from("receipts")
    .createSignedUrl(tx.receipt_path, 60, shouldDownload ? { download: true } : undefined);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Nao foi possivel acessar o comprovante." }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
