import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file") as File;
  const transactionId = form.get("transaction_id") as string;

  if (!file || !transactionId) {
    return NextResponse.json({ error: "Arquivo ou ID ausente" }, { status: 400 });
  }

  const ext = file.name.split(".").pop();
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  const path = `${year}/${month}/${transactionId}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from("receipts")
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    return NextResponse.json({ error: "Falha no upload" }, { status: 500 });
  }

  // salvar o path na tabela transactions
  await supabaseAdmin
    .from("transactions")
    .update({ receipt_path: path })
    .eq("id", transactionId);

  return NextResponse.json({ ok: true, path });
}
