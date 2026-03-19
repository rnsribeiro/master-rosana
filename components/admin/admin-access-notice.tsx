"use client";

import Link from "next/link";

type NoticeProps = {
  title?: string;
  description: string;
};

type AdminOnlyNoticeProps = NoticeProps & {
  backHref?: string;
  backLabel?: string;
};

export function ReadOnlyBanner({
  title = "Modo somente leitura",
  description,
}: NoticeProps) {
  return (
    <div className="rounded-2xl border border-amber-900/70 bg-amber-950/20 p-4">
      <div className="text-sm font-medium text-amber-100">{title}</div>
      <p className="mt-1 text-sm text-amber-200/85">{description}</p>
    </div>
  );
}

export function AdminOnlyNotice({
  title = "Acesso restrito",
  description,
  backHref = "/admin/dashboard",
  backLabel = "Voltar ao painel",
}: AdminOnlyNoticeProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-zinc-400">{description}</p>
      </div>

      <Link
        href={backHref}
        className="inline-flex rounded-xl border border-zinc-700 px-4 py-2 text-sm hover:border-zinc-500"
      >
        {backLabel}
      </Link>
    </div>
  );
}
