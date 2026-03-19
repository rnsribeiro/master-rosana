"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAdminRole } from "@/components/admin/admin-role-provider";
import { ReadOnlyBanner } from "@/components/admin/admin-access-notice";

type Fee = {
  year: number;
  monthly_fee: number;
};

export default function MensalidadesPage() {
  const { canEdit } = useAdminRole();
  const [fees, setFees] = useState<Fee[]>([]);
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [monthlyFee, setMonthlyFee] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setMsg(null);
    setLoading(true);
    const { data, error } = await supabase
      .from("year_fees")
      .select("year, monthly_fee")
      .order("year", { ascending: true });

    if (error) setMsg("Sem permissão ou erro ao carregar mensalidades.");
    setFees((data ?? []) as Fee[]);
    setLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  async function upsertFee() {
    setMsg(null);

    if (!canEdit) {
      setMsg("Seu perfil esta em modo somente leitura.");
      return;
    }

    if (!year || year < 2000 || year > 2100) {
      setMsg("Ano inválido.");
      return;
    }
    if (monthlyFee < 0) {
      setMsg("Valor inválido.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("year_fees")
      .upsert({ year, monthly_fee: monthlyFee });

    setSaving(false);

    if (error) {
      setMsg("Erro ao salvar. (Admin Viewer não pode editar.)");
      return;
    }

    setMonthlyFee(0);
    await load();
    setMsg("Mensalidade salva.");
  }

  async function removeFee(y: number) {
    setMsg(null);

    if (!canEdit) {
      setMsg("Seu perfil esta em modo somente leitura.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("year_fees").delete().eq("year", y);

    setSaving(false);
    if (error) {
      setMsg("Erro ao remover. (Admin Viewer não pode editar.)");
      return;
    }
    await load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Mensalidades por ano</h1>

      {!canEdit && (
        <ReadOnlyBanner description="O perfil viewer pode consultar as mensalidades configuradas, mas nao pode criar, alterar ou remover valores." />
      )}

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 space-y-3">
        {canEdit ? (
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-zinc-300">Ano</label>
              <input
                type="number"
                className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="text-sm text-zinc-300">Valor mensal (R$)</label>
              <input
                type="number"
                className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none"
                value={monthlyFee}
                onChange={(e) => setMonthlyFee(Number(e.target.value))}
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={upsertFee}
                disabled={saving}
                className="w-full rounded-xl bg-zinc-100 text-zinc-950 px-4 py-2 font-medium disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">
            Abaixo voce consegue consultar todas as mensalidades configuradas por ano.
          </p>
        )}

        {msg && (
          <div className="text-sm text-zinc-200 bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
            {msg}
          </div>
        )}

        {loading ? (
          <div className="text-zinc-400">Carregando…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-zinc-400">
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-2 pr-4">Ano</th>
                  <th className="text-left py-2 pr-4">Mensalidade</th>
                  {canEdit && <th className="text-left py-2 pr-4"></th>}
                </tr>
              </thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.year} className="border-b border-zinc-900">
                    <td className="py-2 pr-4">{f.year}</td>
                    <td className="py-2 pr-4">R$ {Number(f.monthly_fee).toFixed(2)}</td>
                    {canEdit && (
                      <td className="py-2 pr-4">
                        <button
                          onClick={() => removeFee(f.year)}
                          className="text-zinc-200 hover:text-white underline underline-offset-4"
                        >
                          Remover
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {fees.length === 0 && (
                  <tr>
                    <td className="py-3 text-zinc-400" colSpan={canEdit ? 3 : 2}>
                      Nenhuma mensalidade cadastrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
