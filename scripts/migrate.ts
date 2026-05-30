import { Pool } from "pg"
import { readFileSync } from "fs"
import { join } from "path"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const migrations = [
  "001_better_auth.sql",
  "002_roles_permissions.sql",
]

async function run() {
  const client = await pool.connect()
  try {
    for (const file of migrations) {
      const sql = readFileSync(join(import.meta.dir, "../migrations", file), "utf-8")
      console.log(`Running ${file}...`)
      await client.query(sql)
      console.log(`  ✓ ${file}`)
    }
    console.log("\nMigration complete.")
  } catch (err) {
    console.error("Migration failed:", err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
