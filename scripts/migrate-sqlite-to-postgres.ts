/**
 * Migrasi data dari SQLite (better-sqlite3) lama ke PostgreSQL.
 *
 * Jalankan:
 *   bun scripts/migrate-sqlite-to-postgres.ts [path/file.db]
 *
 * Default path (Windows): %APPDATA%/TOnas/money-management.db
 */
import { DatabaseSync } from "node:sqlite"
import { Pool } from "pg"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

// Urutan import — parent (sumber FK) lebih dulu.
const TABLE_ORDER = [
  "user",
  "credentials",
  "wallet_categories",
  "investment_categories",
  "income_categories",
  "expense_types",
  "expense_categories",
  "type_allocations",
  "budgets",
  "category_nominal_budgets",
  "year_budget_settings",
  "wallets",
  "investment_goals",
  "investments",
  "incomes",
  "expenses",
  "transfers",
  "loans",
  "loans_given",
  "loans_taken",
  "investment_transactions",
  "loan_payments",
  "fundamental_analyses",
]

function defaultSqlitePath(): string {
  const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming")
  return join(appData, "TOnas", "money-management.db")
}

/** SQLite menyimpan waktu sebagai 'YYYY-MM-DD HH:MM:SS' (UTC) → jadi timestamptz eksplisit. */
function normalizeValue(value: unknown): unknown {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return `${value.replace(" ", "T")}+00:00`
  }
  return value
}

async function main() {
  const sqlitePath = process.argv[2] ?? defaultSqlitePath()
  if (!existsSync(sqlitePath)) {
    console.error(`File SQLite tidak ditemukan: ${sqlitePath}`)
    process.exit(1)
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL belum diset.")
    process.exit(1)
  }

  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true })
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    for (const table of TABLE_ORDER) {
      const exists = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
        .get(table)
      if (!exists) {
        console.log(`  — ${table} (tidak ada di SQLite)`)
        continue
      }

      const info = sqlite.prepare(`PRAGMA table_info("${table}")`).all() as { name: string; pk: number }[]
      const columns = info.map((c) => c.name)
      const pk = info.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name)
      const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[]

      if (rows.length === 0) {
        console.log(`  — ${table} (0 baris)`)
        continue
      }

      const cols = columns.map((c) => `"${c}"`).join(", ")
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ")
      // Idempoten: kalau baris sudah ada (mis. hasil seed), datanya ditimpa dengan data lama.
      const conflict = pk.length
        ? `ON CONFLICT (${pk.map((c) => `"${c}"`).join(", ")}) DO UPDATE SET ${columns
            .filter((c) => !pk.includes(c))
            .map((c) => `"${c}" = EXCLUDED."${c}"`)
            .join(", ")}`
        : "ON CONFLICT DO NOTHING"
      const insert = `INSERT INTO "${table}" (${cols}) VALUES (${placeholders}) ${conflict}`

      let done = 0
      for (const row of rows) {
        const values = columns.map((c) => normalizeValue(row[c]))
        await client.query(insert, values)
        done++
      }
      console.log(`  ✓ ${table}: ${done} baris`)
    }

    await client.query("COMMIT")
    console.log("\nMigrasi data SQLite → PostgreSQL selesai.")
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {})
    console.error("Migrasi gagal:", err)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
    sqlite.close()
  }
}

main()
