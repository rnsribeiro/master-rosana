import { NextResponse } from "next/server";
import { requireRole, type Role } from "@/lib/auth/requireRole";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type UpdateBody = {
  role?: Role;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRole(value: unknown): value is Role {
  return value === "admin" || value === "admin_viewer";
}

async function getIdFromCtx(ctx: { params?: Promise<{ id?: string }> | { id?: string } }) {
  const params = ctx?.params;
  if (!params) return "";

  const resolved =
    typeof (params as Promise<{ id?: string }>).then === "function"
      ? await (params as Promise<{ id?: string }>)
      : (params as { id?: string });

  return String(resolved?.id ?? "");
}

export async function PATCH(
  req: Request,
  ctx: { params?: Promise<{ id?: string }> | { id?: string } }
) {
  const auth = await requireRole(req, ["admin"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = await getIdFromCtx(ctx);
  if (!isUuid(userId)) {
    return NextResponse.json({ error: "ID invalido." }, { status: 400 });
  }

  if (userId === auth.userId) {
    return NextResponse.json(
      { error: "Nao e permitido alterar o proprio perfil por esta tela." },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as UpdateBody;
  if (!isRole(body.role)) {
    return NextResponse.json({ error: "Perfil invalido." }, { status: 400 });
  }

  const { data: userResponse, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userError || !userResponse.user) {
    return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert({ id: userId, role: body.role });

  if (profileError) {
    return NextResponse.json({ error: "Nao foi possivel atualizar o perfil." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: userResponse.user.id,
      email: userResponse.user.email ?? null,
      role: body.role,
      created_at: userResponse.user.created_at ?? null,
      last_sign_in_at: userResponse.user.last_sign_in_at ?? null,
    },
  });
}
