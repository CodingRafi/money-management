import { db } from "@/lib/db"

/**
 * Export & import BASE DATA (data referensi global) oleh Super Admin.
 *
 * Base data = tabel referensi yang dipakai semua keluarga:
 *   - wallet_categories, investment_categories
 *   - template kategori (household_id IS NULL, is_default = 1):
 *     income_categories, expense_types, expense_categories
 *
 * Import bersifat UPSERT per id (tidak ada yang dihapus), karena keluarga
 * sudah mereferensikan baris-baris ini. Baris milik keluarga tidak tersentuh.
 */

export const BASE_FORMAT = "money-management-base-data"
export const BASE_VERSION = 1
export const MAX_BASE_BYTES = 5 * 1024 * 1024

type Row = Record<string, unknown>

// Urutan = dependensi FK (expense_types sebelum expense_categories).
const BASE_TABLES: { table: string; where?: string }[] = [
  { table: "wallet_categories" },
  { table: "investment_categories" },
  { table: "income_categories", where: "household_id IS NULL" },
  { table: "expense_types", where: "household_id IS NULL" },
  { table: "expense_categories", where: "household_id IS NULL" },
]

export type BaseDataFile = {
  format: typeof BASE_FORMAT
  version: number
  exportedAt: string
  tables: Record<string, Row[]>
}

export class BaseDataError extends Error {}

async function loadColumns(): Promise<Map<string, Set<string>>> {
  const rows = (await db
    .prepare(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = ANY(?)`,
    )
    .all(BASE_TABLES.map((t) => t.table))) as { table_name: string; column_name: string }[]
  const map = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!map.has(r.table_name)) map.set(r.table_name, new Set())
    map.get(r.table_name)!.add(r.column_name)
  }
  return map
}

export async function buildBaseData(): Promise<BaseDataFile> {
  const columns = await loadColumns()
  const tables: BaseDataFile["tables"] = {}
  for (const { table, where } of BASE_TABLES) {
    if (!columns.has(table)) continue
    tables[table] = (await db
      .prepare(`SELECT * FROM ${table}${where ? ` WHERE ${where}` : ""} ORDER BY sort_order, id`)
      .all()) as Row[]
  }
  return { format: BASE_FORMAT, version: BASE_VERSION, exportedAt: new Date().toISOString(), tables }
}

export function parseBaseData(text: string): BaseDataFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BaseDataError("File bukan JSON yang valid.")
  }
  const f = data as Partial<BaseDataFile> | null
  if (!f || f.format !== BASE_FORMAT || typeof f.tables !== "object" || f.tables === null) {
    throw new BaseDataError("Format file tidak dikenali. Gunakan file hasil Export Base Data.")
  }
  if (typeof f.version !== "number" || f.version > BASE_VERSION) {
    throw new BaseDataError("Versi file tidak didukung.")
  }
  return f as BaseDataFile
}

export async function importBaseData(file: BaseDataFile): Promise<{ upserted: number; skipped: number }> {
  const columns = await loadColumns()
  let upserted = 0
  let skipped = 0

  await db.transaction(async () => {
    for (const { table } of BASE_TABLES) {
      const cols = columns.get(table)
      const rows = file.tables[table]
      if (!cols || !Array.isArray(rows)) continue

      for (const raw of rows) {
        if (!raw || typeof raw !== "object" || typeof (raw as Row).id !== "string") {
          skipped++
          continue
        }
        const row: Row = {}
        for (const [k, v] of Object.entries(raw)) if (cols.has(k)) row[k] = v
        // Base data = template global: tidak pernah milik keluarga.
        if (cols.has("household_id")) row.household_id = null
        if (cols.has("household_id") && cols.has("is_default")) row.is_default = 1

        const keys = Object.keys(row)
        const updates = keys.filter((k) => k !== "id" && k !== "created_at")
        const insert = `INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`
        const conflict = updates.length
          ? ` ON CONFLICT (id) DO UPDATE SET ${updates.map((k) => `"${k}" = EXCLUDED."${k}"`).join(", ")}` +
            // Jangan menimpa baris milik keluarga yang kebetulan satu id.
            (cols.has("household_id") ? ` WHERE ${table}.household_id IS NULL` : "")
          : " ON CONFLICT (id) DO NOTHING"
        await db.prepare(insert + conflict).run(...keys.map((k) => row[k]))
        upserted++
      }
    }
  })
  return { upserted, skipped }
}
