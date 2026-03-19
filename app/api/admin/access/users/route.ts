import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { requireRole, type Role } from "@/lib/auth/requireRole";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type CreateBody = {
  email?: string;
  password?: string;
  role?: Role;
};

type ProfileRow = {
  id: string;
  role: Role;
};

function isRole(value: unknown): value is Role {
  return value === "admin" || value === "admin_viewer";
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value);
}

function serializeUser(user: User, role: Role | null) {
  return {
    id: user.id,
    email: user.email ?? null,
    role,
    created_at: user.created_at ?? null,
    last_sign_in_at: user.last_sign_in_at ?? null,
  };
}

function roleSortValue(role: Role | null) {
  if (role === "admin") return 0;
  if (role === "admin_viewer") return 1;
  return 2;
}

export async function GET(req: Request) {
  const auth = await requireRole(req, ["admin"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const [{ data: authUsers, error: authError }, { data: profiles, error: profilesError }] =
    await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 }),
      supabaseAdmin.from("profiles").select("id, role").in("role", ["admin", "admin_viewer"]),
    ]);

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  const roleById = new Map<string, Role>(
    ((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile.role])
  );

  const users = (authUsers.users ?? [])
    .map((user) => serializeUser(user, roleById.get(user.id) ?? null))
    .sort((a, b) => {
      const aRole = roleSortValue(a.role);
      const bRole = roleSortValue(b.role);

      if (aRole !== bRole) {
        return aRole - bRole;
      }

      return (a.email ?? "").localeCompare(b.email ?? "", "pt-BR");
    });

  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const auth = await requireRole(req, ["admin"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await req.json().catch(() => ({}))) as CreateBody;
  const email = normalizeEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");
  const role = body.role;

  if (!isEmail(email)) {
    return NextResponse.json({ error: "Informe um e-mail valido." }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "A senha precisa ter pelo menos 6 caracteres." },
      { status: 400 }
    );
  }

  if (!isRole(role)) {
    return NextResponse.json({ error: "Perfil invalido." }, { status: 400 });
  }

  const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !createdUser.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Nao foi possivel criar o usuario." },
      { status: 400 }
    );
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert({ id: createdUser.user.id, role });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(createdUser.user.id);

    return NextResponse.json(
      { error: "Usuario criado, mas o perfil nao foi salvo. A operacao foi desfeita." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      user: serializeUser(createdUser.user, role),
    },
    { status: 201 }
  );
}
