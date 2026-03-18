import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ENV_PATH = path.resolve(".env.local");
const OUTPUT_ROOT = path.resolve("backups");
const TABLES = [
  "profiles",
  "players",
  "player_memberships",
  "year_fees",
  "transactions",
  "allocations",
  "forgiveness",
  "entries",
];
const STORAGE_BUCKETS = ["receipts"];
const PAGE_SIZE = 1000;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variavel de ambiente ausente: ${name}`);
  }

  return value;
}

function nowStamp(date = new Date()) {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ];

  return parts.join("");
}

function csvEscape(value) {
  if (value == null) return "";

  const normalized =
    typeof value === "object" ? JSON.stringify(value) : String(value);

  if (/[",\n\r]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

function rowsToCsv(rows) {
  if (!rows.length) {
    return "";
  }

  const keys = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set())
  );

  const header = keys.join(",");
  const lines = rows.map((row) => keys.map((key) => csvEscape(row[key])).join(","));
  return [header, ...lines].join("\n");
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return "Erro desconhecido";
}

async function fetchTableRows(supabase, table) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const chunk = data ?? [];
    rows.push(...chunk);

    if (chunk.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return rows;
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeCsv(filePath, rows) {
  await writeFile(filePath, rowsToCsv(rows), "utf8");
}

async function listBucketFiles(storage, bucket, currentPath = "") {
  const entries = [];
  let offset = 0;

  while (true) {
    const { data, error } = await storage.from(bucket).list(currentPath, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw error;
    }

    const page = data ?? [];
    if (!page.length) {
      break;
    }

    for (const item of page) {
      const itemPath = currentPath ? `${currentPath}/${item.name}` : item.name;

      if (item.id) {
        entries.push({
          path: itemPath,
          name: item.name,
          bucket,
          metadata: item.metadata ?? null,
          created_at: item.created_at ?? null,
          updated_at: item.updated_at ?? null,
          last_accessed_at: item.last_accessed_at ?? null,
        });
      } else {
        const nested = await listBucketFiles(storage, bucket, itemPath);
        entries.push(...nested);
      }
    }

    if (page.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return entries;
}

async function downloadBucketFiles(storage, bucket, outputDir, files) {
  for (const file of files) {
    const { data, error } = await storage.from(bucket).download(file.path);
    if (error) {
      throw error;
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const filePath = path.join(outputDir, bucket, ...file.path.split("/"));
    await ensureDir(path.dirname(filePath));
    await writeFile(filePath, buffer);
  }
}

async function main() {
  process.loadEnvFile(ENV_PATH);

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const stamp = nowStamp();
  const outputDir = path.join(OUTPUT_ROOT, `supabase-${stamp}`);
  const dataDir = path.join(outputDir, "data");
  const storageDir = path.join(outputDir, "storage");

  await ensureDir(dataDir);
  await ensureDir(storageDir);

  const manifest = {
    generated_at: new Date().toISOString(),
    source: new URL(url).host,
    output_dir: outputDir,
    tables: [],
    storage: [],
  };

  for (const table of TABLES) {
    try {
      const rows = await fetchTableRows(supabase, table);
      await writeJson(path.join(dataDir, `${table}.json`), rows);
      await writeCsv(path.join(dataDir, `${table}.csv`), rows);

      manifest.tables.push({
        table,
        status: "ok",
        row_count: rows.length,
        json_file: path.join("data", `${table}.json`),
        csv_file: path.join("data", `${table}.csv`),
      });

      console.log(`[table] ${table}: ${rows.length} registro(s)`);
    } catch (error) {
      const message = getErrorMessage(error);

      manifest.tables.push({
        table,
        status: "error",
        error: message,
      });

      console.warn(`[table] ${table}: ${message}`);
    }
  }

  for (const bucket of STORAGE_BUCKETS) {
    try {
      const files = await listBucketFiles(supabase.storage, bucket);
      await writeJson(path.join(storageDir, `${bucket}.json`), files);
      await downloadBucketFiles(supabase.storage, bucket, storageDir, files);

      manifest.storage.push({
        bucket,
        status: "ok",
        file_count: files.length,
        manifest_file: path.join("storage", `${bucket}.json`),
      });

      console.log(`[bucket] ${bucket}: ${files.length} arquivo(s)`);
    } catch (error) {
      const message = getErrorMessage(error);

      manifest.storage.push({
        bucket,
        status: "error",
        error: message,
      });

      console.warn(`[bucket] ${bucket}: ${message}`);
    }
  }

  await writeJson(path.join(outputDir, "manifest.json"), manifest);

  console.log(`Backup concluido em: ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
