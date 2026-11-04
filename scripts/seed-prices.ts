/**
 * Isi harga historis DUMMY (3 tahun) untuk pengembangan & demo simulasi.
 * Random walk berkorelasi lewat satu faktor pasar bersama, deterministik (seed tetap).
 *
 *   DATABASE_URL=... bun scripts/seed-prices.ts [--seed 1] [--force]
 *
 * - Hanya mengisi aset ber-unit yang BELUM punya harga (tidak menimpa data asli).
 * - Benchmark IHSG & GOLD diisi hanya bila kosong. source = 'seed'.
 * - Menolak berjalan saat NODE_ENV=production kecuali --force.
 */
import { getPool } from "../lib/db"
import { mulberry32, normalSampler } from "../lib/risk/montecarlo"

const args = process.argv.slice(2)
const seedArg = args.indexOf("--seed")
const SEED = seedArg >= 0 ? Number(args[seedArg + 1]) || 1 : 1
const FORCE = args.includes("--force")
const YEARS = 3

function businessDays(years: number): string[] {
  const out: string[] = []
  const end = new Date()
  const d = new Date(end)
  d.setUTCFullYear(d.getUTCFullYear() - years)
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/** Satu jalur harga: r = beta·market + idio, drift & vol tahunan. */
function walk(days: string[], market: number[], randn: () => number, p: { start: number; beta: number; drift: number; vol: number }) {
  const dt = 1 / 252
  let price = p.start
  const idioVol = p.vol * Math.sqrt(Math.max(0.05, 1 - p.beta ** 2 * 0.5))
  return days.map((date, i) => {
    const r = (p.drift - 0.5 * p.vol ** 2) * dt + p.beta * p.vol * Math.sqrt(dt) * market[i] + idioVol * Math.sqrt(dt) * randn() * 0.7
    price *= Math.exp(r)
    return { date, close: Math.max(1, Math.round(price * 100) / 100) }
  })
}

async function insert(table: "asset" | "bench", key: string, rows: { date: string; close: number }[]) {
  const pool = getPool()
  const sql =
    table === "asset"
      ? `INSERT INTO asset_prices (investment_id, date, close, source)
         SELECT $1::text, t.d, t.c, 'seed' FROM unnest($2::text[], $3::float8[]) AS t(d, c)
         ON CONFLICT (investment_id, date) DO NOTHING`
      : `INSERT INTO benchmark_prices (code, date, close, source)
         SELECT $1::text, t.d, t.c, 'seed' FROM unnest($2::text[], $3::float8[]) AS t(d, c)
         ON CONFLICT (code, date) DO NOTHING`
  await pool.query(sql, [key, rows.map((r) => r.date), rows.map((r) => r.close)])
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL belum diset.")
  if (process.env.NODE_ENV === "production" && !FORCE) throw new Error("Menolak seed di production (pakai --force bila yakin).")

  const pool = getPool()
  const days = businessDays(YEARS)
  const randn = normalSampler(mulberry32(SEED))
  const market = days.map(() => randn())

  // Benchmark (IHSG beta 1, emas beta rendah)
  for (const [code, params] of [
    ["IHSG", { start: 6800, beta: 1, drift: 0.07, vol: 0.16 }],
    ["GOLD", { start: 1900, beta: 0.1, drift: 0.06, vol: 0.14 }],
  ] as const) {
    const { rows } = await pool.query("SELECT 1 FROM benchmark_prices WHERE code = $1 LIMIT 1", [code])
    if (rows.length) { console.log(`benchmark ${code}: sudah ada, dilewati`); continue }
    await insert("bench", code, walk(days, market, randn, params))
    console.log(`benchmark ${code}: ${days.length} titik`)
  }

  const { rows: invs } = await pool.query<{ id: string; name: string; category: string }>(
    `SELECT i.id, i.name, ic.name AS category FROM investments i
     JOIN investment_categories ic ON ic.id = i.category_id
     WHERE i.is_active = 1 AND i.unit IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM asset_prices ap WHERE ap.investment_id = i.id)`,
  )
  for (const inv of invs) {
    const cat = inv.category.toUpperCase()
    const profile = cat.includes("EMAS")
      ? { start: 1_000_000, beta: 0.1, drift: 0.07, vol: 0.14 }
      : cat.includes("KRIPTO")
        ? { start: 500_000_000, beta: 0.8, drift: 0.2, vol: 0.7 }
        : cat.includes("OBLIGASI")
          ? { start: 1_000_000, beta: 0.05, drift: 0.06, vol: 0.04 }
          : cat.includes("REKSA")
            ? { start: 1_500, beta: 0.7, drift: 0.07, vol: 0.12 }
            : { start: 4_000, beta: 1.1, drift: 0.09, vol: 0.28 }
    await insert("asset", inv.id, walk(days, market, randn, profile))
    console.log(`aset ${inv.name}: ${days.length} titik (${inv.category})`)
  }
  if (!invs.length) console.log("Tidak ada aset ber-unit tanpa harga.")
  await pool.end()
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
