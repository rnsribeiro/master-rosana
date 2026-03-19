"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAdminRole } from "@/components/admin/admin-role-provider";
import { AdminOnlyNotice } from "@/components/admin/admin-access-notice";

export default function NovaSaidaPage() {
  const { loading: roleLoading, isAdmin } = useAdminRole();
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setMsg(null);
    setLoading(true);

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      setMsg("Sessão inválida. Faça login novamente.");
      setLoading(false);
      return;
    }

    const fd = new FormData();
    fd.append("date", date);
    fd.append("amount", String(amount));
    fd.append("description", description);
    if (file) fd.append("file", file);

    const res = await fetch("/api/admin/expenses/create", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setMsg(json?.error ?? "Erro ao salvar.");
      return;
    }

    setMsg("Saída criada com sucesso.");
    setAmount(0);
    setDescription("");
    setFile(null);
  }

  if (roleLoading) {
    return <div className="text-zinc-400">Carregando...</div>;
  }

  if (!isAdmin) {
    return (
      <AdminOnlyNotice
        title="Nova saida"
        description="Somente administradores podem lancar novas saidas."
        backHref="/admin/financeiro"
      />
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nova Saída</h1>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-zinc-300">Data</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-zinc-300">Valor</label>
            <input
              type="number"
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-zinc-300">Descrição</label>
          <input
            className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: arbitragem, uniforme, água..."
          />
        </div>

        <div>
          <label className="text-sm text-zinc-300">Comprovante (imagem/PDF)</label>
          <input
            type="file"
            accept="image/*,application/pdf"
            className="mt-1 w-full"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-zinc-500 mt-1">Bucket privado: receipts</p>
        </div>

        <button
          onClick={submit}
          disabled={loading || amount <= 0}
          className="rounded-xl bg-zinc-100 text-zinc-950 px-4 py-2 font-medium disabled:opacity-60"
        >
          {loading ? "Salvando..." : "Salvar"}
        </button>

        {msg && <div className="text-sm text-zinc-200">{msg}</div>}
      </div>
    </div>
  );
}
