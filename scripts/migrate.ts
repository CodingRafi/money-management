import { Pool } from "pg"
import { runMigrations } from "../lib/db"

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL belum diset.")
    console.error("Contoh: DATABASE_URL=postgres://user:pass@localhost:5432/tonas npm run migrate")
    process.exit(1)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    await pool.query("SELECT 1")
  } catch (err) {
    console.error("Tidak bisa terhubung ke Postgres:", err instanceof Error ? err.message : err)
    await pool.end()
    process.exit(1)
  }
  await pool.end()

  console.log("Menjalankan migrasi...")
  await runMigrations()
  console.log("Migrasi selesai.")
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
