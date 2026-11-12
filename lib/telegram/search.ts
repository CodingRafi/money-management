import { db } from "@/lib/db"
import { escapeHtml, shortCode } from "./format"
import type { SessionData } from "@/lib/auth-simple"
import { resolveTgScope } from "./scope"

/**
 * Pencarian & filter transaksi untuk perintah bot Telegram.
 *
 * Semua hasil dicetak lengkap dengan kode transaksi (6 karakter terakhir ID)
 * supaya user bisa langsung memakai /revisi atau /hapus tanpa membuka aplikasi.
 */

export interface TxnRow {
  id: string
  date: string
  name: string
  amount: number
  kind: "expense" | "income"
  category_name: string | null
  wallet_name: string | null
}

/** Cetak daftar transaksi — dipakai /riwayat. */
export function txList(rows: TxnRow[], emptyText = "Belum ada transaksi."): string {
  if (rows.length === 0) return emptyText
  return rows
    .map(
      (r) =>
        `${r.kind === "expense" ? "🔻" : "🔺"} ${r.date} · ${escapeHtml(r.name)} — ${formatRp(Number(r.amount))}` +
        (r.category_name ? ` · ${escapeHtml(r.category_name)}` : "") +
        ` · <code>${shortCode(r.id)}</code>`,
    )
    .join("\n")
}

function formatRp(n: number): string {
  return `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n)}`
}

// ── /cari ────────────────────────────────────────────────────────────────────

export interface SearchOptions {
  /** Kata kunci pada nama transaksi. */
  keyword?: string
  /** Filter tanggal "YYYY-MM-DD". */
  from?: string
  to?: string
  /** Nama kategori (case-insensitive, partial match). */
  category?: string
  /** Nama dompet (case-insensitive, partial match). */
  wallet?: string
  /** Hanya pengeluaran atau pemasukan. */
  kind?: "expense" | "income"
  /** Batasi jumlah hasil (default 20). */
  limit?: number
}

/**
 * Cari transaksi by kata kunci dan/atau rentang tanggal.
 * Kata kunci dicocokkan ke nama transaksi (case-insensitive, partial match).
 */
export async function searchTransactions(
  session: SessionData,
  opts: SearchOptions,
): Promise<{ rows: TxnRow[]; total: number }> {
  const scope = await resolveTgScope(session)
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20))
  const famClause = scope.excludeFamilyExpense ? " AND e.is_family_expense = 0" : ""

  const where: string[] = ["t.user_id = ANY(?)"]
  const params: unknown[] = [scope.userIds]

  if (opts.keyword) {
    where.push("(t.name ILIKE ? OR t.category_name ILIKE ?)")
    const pattern = `%${opts.keyword}%`
    params.push(pattern, pattern)
  }
  if (opts.from) {
    where.push("t.date >= ?")
    params.push(opts.from)
  }
  if (opts.to) {
    where.push("t.date <= ?")
    params.push(opts.to)
  }
  if (opts.category) {
    where.push("t.category_name ILIKE ?")
    params.push(`%${opts.category}%`)
  }
  if (opts.wallet) {
    where.push("t.wallet_name ILIKE ?")
    params.push(`%${opts.wallet}%`)
  }
  if (opts.kind) {
    where.push("t.kind = ?")
    params.push(opts.kind)
  }

  const base = `
    SELECT t.id, t.date, t.name, t.amount, t.kind, t.category_name, t.wallet_name
      FROM (
        SELECT e.user_id, e.id, e.date, e.name, e.amount, 'expense' AS kind,
               ec.name AS category_name, w.name AS wallet_name
          FROM expenses e
          LEFT JOIN expense_categories ec ON ec.id = e.category_id
          LEFT JOIN wallets w ON w.id = e.wallet_id
         WHERE e.user_id = ANY(?)${famClause}
        UNION ALL
        SELECT i.user_id, i.id, i.date, i.name, i.amount, 'income' AS kind,
               ic.name AS category_name, w.name AS wallet_name
          FROM incomes i
          LEFT JOIN income_categories ic ON ic.id = i.category_id
          LEFT JOIN wallets w ON w.id = i.wallet_id
         WHERE i.user_id = ANY(?)
      ) t
     WHERE ${where.join(" AND ")}
     ORDER BY t.date DESC, t.name ASC`

  const rows = await db
    .prepare<unknown[], TxnRow>(`${base} LIMIT ?`)
    .all(scope.userIds, scope.userIds, ...params, limit) as TxnRow[]

  // Hitung total hasil (agar user tahu kalau ada yang terpotong).
  const countRow = await db
    .prepare<unknown[], { total: number }>(`SELECT COUNT(*) AS total FROM (${base}) c`)
    .all(scope.userIds, scope.userIds, ...params) as { total: number }[]

  return {
    rows: rows.map((r) => ({ ...r, amount: Number(r.amount) })),
    total: Number(countRow?.[0]?.total ?? rows.length),
  }
}

// ── /top ─────────────────────────────────────────────────────────────────────

export interface TopOptions {
  /** Jumlah kategori teratas (default 5). */
  limit?: number
  /** "YYYY-MM" → bulan tertentu; default bulan berjalan. */
  period?: string
}

/**
 * Top pengeluaran per kategori — versi ringkas dari /rekap_kategori.
 */
export async function topCategories(
  session: SessionData,
  today: string,
  opts: TopOptions = {},
): Promise<{ name: string; total: number; pct: number }[]> {
  const scope = await resolveTgScope(session)
  const limit = Math.min(20, Math.max(1, opts.limit ?? 5))
  const famClause = scope.excludeFamilyExpense ? " AND e.is_family_expense = 0" : ""

  const [ty, tm] = today.split("-").map(Number)
  let year = ty
  let month = tm
  const m = opts.period ? /^(\d{4})-(\d{2})$/.exec(opts.period) : null
  if (m) {
    year = Number(m[1])
    month = Number(m[2])
  }

  const rows = await db
    .prepare<[string[], number, number, number], { name: string; total: number }>(
      `SELECT COALESCE(ec.name, '(tanpa kategori)') AS name,
              COALESCE(SUM(e.amount), 0) AS total
         FROM expenses e
         LEFT JOIN expense_categories ec ON ec.id = e.category_id
        WHERE e.user_id = ANY(?) AND e.year = ? AND e.month = ?${famClause}
        GROUP BY ec.name
        ORDER BY total DESC
        LIMIT ?`,
    )
    .all(scope.userIds, year, month, limit) as { name: string; total: number }[]

  // Total seluruh kategori (bukan cuma top-N) — supaya persentase di samping
  // nominal selalu berarti "bagian dari total pengeluaran bulan ini".
  const totalRow = await db
    .prepare<[string[], number, number], { total: number }>(
      `SELECT COALESCE(SUM(e.amount), 0) AS total
         FROM expenses e
        WHERE e.user_id = ANY(?) AND e.year = ? AND e.month = ?${famClause}`,
    )
    .get(scope.userIds, year, month) as { total: number } | undefined

  const grandTotal = Number(totalRow?.total ?? 0)
  return rows.map((r) => ({
    name: r.name,
    total: Number(r.total),
    pct: grandTotal > 0 ? (Number(r.total) / grandTotal) * 100 : 0,
  }))
}
