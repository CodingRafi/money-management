import { Pool, types, type PoolClient, type QueryResultRow } from "pg"
import { AsyncLocalStorage } from "node:async_hooks"

// ── Type parsers ─────────────────────────────────────────────────────────────
// Postgres mengembalikan NUMERIC/BIGINT sebagai string, sementara SQLite
// mengembalikannya sebagai number. Supaya sisa aplikasi tidak berubah,
// parser-nya kita samakan dengan perilaku SQLite.

types.setTypeParser(types.builtins.NUMERIC, (v) => parseFloat(v))
types.setTypeParser(types.builtins.INT8, (v) => parseInt(v, 10))

// ── Pool ─────────────────────────────────────────────────────────────────────

const globalForDb = globalThis as unknown as { __tonasPool?: Pool }

export function getPool(): Pool {
  if (!globalForDb.__tonasPool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL belum diset. Contoh: DATABASE_URL=postgres://user:pass@localhost:5432/tonas",
      )
    }
    globalForDb.__tonasPool = new Pool({
      connectionString,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    })
    globalForDb.__tonasPool.on("error", (err) => {
      console.error("[db] idle client error:", err.message)
    })
  }
  return globalForDb.__tonasPool
}

// ── SQL translation ──────────────────────────────────────────────────────────
// Query di aplikasi masih ditulis gaya SQLite (`?` sebagai placeholder).
// Di Postgres placeholder-nya `$1, $2, ...`, jadi diterjemahkan di layer ini.

export function toPgSql(sql: string): string {
  let out = ""
  let i = 0
  let paramIndex = 0

  while (i < sql.length) {
    const ch = sql[i]

    // String literal '...'
    if (ch === "'") {
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2
            continue
          }
          break
        }
        j++
      }
      out += sql.slice(i, j + 1)
      i = j + 1
      continue
    }

    // Identifier "..."
    if (ch === '"') {
      let j = i + 1
      while (j < sql.length && sql[j] !== '"') j++
      out += sql.slice(i, j + 1)
      i = j + 1
      continue
    }

    // Komentar baris --
    if (ch === "-" && sql[i + 1] === "-") {
      let j = i
      while (j < sql.length && sql[j] !== "\n") j++
      out += sql.slice(i, j)
      i = j
      continue
    }

    if (ch === "?") {
      paramIndex++
      out += `$${paramIndex}`
      i++
      continue
    }

    out += ch
    i++
  }

  return out.replace(/datetime\('now'\)/gi, "NOW()")
}

/** Nilai parameter yang belum cocok tipe kolom INTEGER 0/1 di Postgres. */
function normalizeParam(value: unknown): unknown {
  if (value === undefined) return null
  if (typeof value === "boolean") return value ? 1 : 0
  return value
}

// ── Transaction context ──────────────────────────────────────────────────────
// `db.transaction()` memakai AsyncLocalStorage supaya query di dalam callback
// otomatis memakai koneksi yang sama (konsisten dengan BEGIN/COMMIT).

const txStore = new AsyncLocalStorage<PoolClient>()

async function runQuery(sql: string, params: unknown[]) {
  const text = toPgSql(sql)
  const values = params.map(normalizeParam)
  const client = txStore.getStore()

  if (client) {
    return values.length === 0 ? client.query(text) : client.query(text, values)
  }

  const pool = getPool()
  return values.length === 0 ? pool.query(text) : pool.query(text, values)
}

// ── Public API ───────────────────────────────────────────────────────────────

export type RunResult = { changes: number }

export const db = {
  /**
   * Sama seperti better-sqlite3, hanya bedanya hasilnya sekarang Promise.
   * `BindParams` = tipe parameter, `Row` = tipe baris hasil.
   */
  prepare<BindParams extends unknown[] = unknown[], Row = QueryResultRow>(sql: string) {
    return {
      all: async (...params: BindParams): Promise<Row[]> => {
        const res = await runQuery(sql, params)
        return res.rows as Row[]
      },
      get: async (...params: BindParams): Promise<Row | undefined> => {
        const res = await runQuery(sql, params)
        return res.rows[0] as Row | undefined
      },
      run: async (...params: BindParams): Promise<RunResult> => {
        const res = await runQuery(sql, params)
        return { changes: res.rowCount ?? 0 }
      },
    }
  },

  /** Menjalankan SQL mentah (bisa banyak statement). */
  exec: async (sql: string): Promise<void> => {
    await runQuery(sql, [])
  },

  /**
   * Menjalankan SQL mentah apa adanya — placeholder `?` TIDAK diterjemahkan.
   * Dipakai untuk statement hasil dump/import yang isinya sudah final.
   */
  execRaw: async (sql: string): Promise<void> => {
    const client = txStore.getStore()
    if (client) {
      await client.query(sql)
      return
    }
    await getPool().query(sql)
  },

  /** Menjalankan callback di dalam satu transaksi (BEGIN/COMMIT/ROLLBACK). */
  transaction: async <T>(fn: () => Promise<T> | T): Promise<T> => {
    const existing = txStore.getStore()
    if (existing) {
      // Transaksi bersarang → pakai transaksi yang sama.
      return await fn()
    }

    const client = await getPool().connect()
    try {
      await client.query("BEGIN")
      const result = await txStore.run(client, async () => await fn())
      await client.query("COMMIT")
      return result
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {})
      throw err
    } finally {
      client.release()
    }
  },
}

export type Db = typeof db

// ── Maintenance ──────────────────────────────────────────────────────────────

/** Cek koneksi — dipakai health-check / login page. */
export async function checkConnection(): Promise<boolean> {
  try {
    await getPool().query("SELECT 1")
    return true
  } catch {
    return false
  }
}

/**
 * Jalankan file SQL di folder migrations/ yang belum tercatat di
 * schema_migrations. Dipakai `npm run migrate` dan tidak wajib saat runtime.
 */
export async function runMigrations(): Promise<void> {
  const { readdir, readFile } = await import("node:fs/promises")
  const { join } = await import("node:path")

  const dir = join(process.cwd(), "migrations")
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()

  const client = await getPool().connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const { rows } = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations",
    )
    const applied = new Set(rows.map((r) => r.filename))

    for (const file of files) {
      if (applied.has(file)) continue
      const sql = await readFile(join(dir, file), "utf-8")
      await client.query("BEGIN")
      try {
        await client.query(sql)
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
          [file],
        )
        await client.query("COMMIT")
        console.log(`  ✓ ${file}`)
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {})
        throw err
      }
    }
  } finally {
    client.release()
  }
}
