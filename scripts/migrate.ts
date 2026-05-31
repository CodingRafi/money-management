import { Pool } from "pg"
import { readFileSync } from "fs"
import { join } from "path"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const migrations = [
  "001_better_auth.sql",
  "002_roles_permissions.sql",
  "003_licence_system.sql",
  "004_licence_price.sql",
  "005_remove_devices.sql",
  "006_categories.sql",
  "007_type_allocations.sql",
  "008_wallets.sql",
  "009_wallets_remove_balance.sql",
  "010_transactions.sql",
  "011_yearly_recap.sql",
  "012_yearly_recap_jsonb.sql",
  "013_yearly_categories.sql",
  "014_investments.sql",
  "015_transfers.sql",
]

// Postgres error codes that mean "this object already exists" — safe to skip
const IDEMPOTENT_CODES = new Set(["42P07", "42701", "42710", "42P16", "23505", "42P13"])

async function run() {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    const appliedRes = await client.query<{ filename: string }>(
      `SELECT filename FROM schema_migrations`,
    )
    const applied = new Set(appliedRes.rows.map((r) => r.filename))

    for (const file of migrations) {
      if (applied.has(file)) {
        console.log(`  — ${file} (skipping)`)
        continue
      }

      const sql = readFileSync(join(import.meta.dir, "../migrations", file), "utf-8")
      console.log(`Running ${file}...`)

      await client.query("SAVEPOINT migration_sp")
      try {
        await client.query(sql)
        await client.query(
          `INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
          [file],
        )
        await client.query("RELEASE SAVEPOINT migration_sp")
        console.log(`  ✓ ${file}`)
      } catch (err: any) {
        await client.query("ROLLBACK TO SAVEPOINT migration_sp")
        if (IDEMPOTENT_CODES.has(err.code)) {
          // Migration was already applied outside of this tracker — mark it and move on
          await client.query(
            `INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
            [file],
          )
          console.log(`  ~ ${file} (already applied, marked)`)
        } else {
          throw err
        }
      }
    }

    await client.query("COMMIT")
    console.log("\nMigration complete.")
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {})
    console.error("Migration failed:", err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
