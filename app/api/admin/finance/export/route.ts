import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type TransactionRow = {
  id: string;
  type: "in" | "out";
  date: string;
  amount: number;
  description: string | null;
  player_id: string | null;
  target_year: number | null;
  receipt_path: string | null;
  created_at: string;
  players?: {
    full_name: string | null;
  } | null;
};

type TransactionRelation = {
  full_name: string | null;
};

type RawTransactionRow = Omit<TransactionRow, "amount" | "target_year" | "players"> & {
  amount: number | string | null;
  target_year: number | string | null;
  players?: TransactionRelation[] | TransactionRelation | null;
};

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

function formatDateBr(dateISO: string) {
  return new Date(`${dateISO}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatDateTimeBr(dateISO: string) {
  return new Date(dateISO).toLocaleString("pt-BR");
}

function buildMonthlyRows(transactions: TransactionRow[]) {
  const byMonth = new Map<string, { mes: string; entradas: number; saidas: number }>();

  for (const tx of transactions) {
    const date = new Date(`${tx.date}T00:00:00`);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const row = byMonth.get(key) ?? { mes: key, entradas: 0, saidas: 0 };

    if (tx.type === "in") {
      row.entradas += Number(tx.amount ?? 0);
    } else {
      row.saidas += Number(tx.amount ?? 0);
    }

    byMonth.set(key, row);
  }

  return Array.from(byMonth.values()).sort((a, b) => a.mes.localeCompare(b.mes));
}

function normalizeTransaction(row: RawTransactionRow): TransactionRow {
  const relation = Array.isArray(row.players) ? row.players[0] ?? null : row.players ?? null;

  return {
    id: String(row.id),
    type: row.type === "out" ? "out" : "in",
    date: String(row.date),
    amount: Number(row.amount ?? 0),
    description: row.description ?? null,
    player_id: row.player_id ?? null,
    target_year: row.target_year == null ? null : Number(row.target_year),
    receipt_path: row.receipt_path ?? null,
    created_at: String(row.created_at),
    players: relation ? { full_name: relation.full_name ?? null } : null,
  };
}

async function fetchAllTransactions(type: string | null) {
  const rows: TransactionRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabaseAdmin
      .from("transactions")
      .select(
        "id, type, date, amount, description, player_id, target_year, receipt_path, created_at, players:player_id(full_name)"
      )
      .order("date", { ascending: false })
      .range(from, from + pageSize - 1);

    if (type === "in" || type === "out") {
      query = query.eq("type", type);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const rawRows = Array.isArray(data) ? (data as RawTransactionRow[]) : [];
    const chunk = rawRows.map(normalizeTransaction);
    rows.push(...chunk);

    if (chunk.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

export async function GET(req: Request) {
  const gate = await requireAdminOrViewer();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  try {
    const transactions = await fetchAllTransactions(type);
    const totalIn = transactions
      .filter((tx) => tx.type === "in")
      .reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);
    const totalOut = transactions
      .filter((tx) => tx.type === "out")
      .reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);
    const cash = totalIn - totalOut;

    const { data: openDue, error: openDueError } = await supabaseAdmin.rpc("admin_total_open_due");
    if (openDueError) {
      throw openDueError;
    }

    const workbook = XLSX.utils.book_new();

    const transactionsSheet = XLSX.utils.json_to_sheet(
      transactions.map((tx) => ({
        Data: formatDateBr(tx.date),
        Tipo: tx.type === "in" ? "Entrada" : "Saida",
        Valor: Number(tx.amount ?? 0),
        Descricao: tx.description ?? "",
        Jogador: tx.players?.full_name ?? "",
        "Ano alvo": tx.target_year ?? "",
      }))
    );

    transactionsSheet["!cols"] = [
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 40 },
      { wch: 28 },
      { wch: 12 },
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet([
      ["Relatorio", "Financeiro"],
      ["Gerado em", formatDateTimeBr(new Date().toISOString())],
      ["Filtro", type === "in" ? "Entradas" : type === "out" ? "Saidas" : "Todos"],
      ["Total de entradas", totalIn],
      ["Total de saidas", totalOut],
      ["Caixa atual", cash],
      ["Em aberto", Number(openDue ?? 0)],
      ["Quantidade de transacoes", transactions.length],
    ]);

    summarySheet["!cols"] = [{ wch: 24 }, { wch: 20 }];

    const monthlySheet = XLSX.utils.json_to_sheet(buildMonthlyRows(transactions));
    monthlySheet["!cols"] = [{ wch: 10 }, { wch: 14 }, { wch: 14 }];

    XLSX.utils.book_append_sheet(workbook, transactionsSheet, "Todas_transacoes");
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumo");
    XLSX.utils.book_append_sheet(workbook, monthlySheet, "Por_mes");

    const buffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    });

    const fileName = `transacoes-financeiras-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Falha ao exportar.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
