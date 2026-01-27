import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/requireRole";

export async function POST(req: Request) {
  const auth = await requireRole(req, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const form = await req.formData();
  const date = String(form.get("date") || "");
  const amount = Number(form.get("amount") || 0);
  const description = String(form.get("description") || "");
  const file = form.get("file") as File | null;

  if (!date || !amount || amount <= 0) {
    return NextResponse.json({ error: "Data/valor inválidos" }, { status: 400 });
  }

  // 1) cria transaction out
  const { data: tx, error: txErr } = await supabaseAdmin
    .from("transactions")
    .insert({
      type: "out",
      date,
      amount,
      description: description || null,
    })
    .select("id")
    .single();

  if (txErr || !tx) return NextResponse.json({ error: "Erro ao criar saída" }, { status: 500 });

  // 2) upload opcional
  if (file) {
    const name = file.name || "arquivo";
    const ext = name.includes(".") ? name.split(".").pop() : "bin";

    const now = new Date(date + "T00:00:00");
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");

    const path = `${year}/${month}/${tx.id}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("receipts")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (upErr) {
      // mantém a tx criada, mas avisa falha
      return NextResponse.json({ error: "Saída criada, mas falhou upload do comprovante" }, { status: 500 });
    }

    await supabaseAdmin.from("transactions").update({ receipt_path: path }).eq("id", tx.id);
  }

  return NextResponse.json({ ok: true, transaction_id: tx.id });
}
