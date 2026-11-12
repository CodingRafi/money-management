import { db } from "@/lib/db"
import type { SessionData } from "@/lib/auth-simple"

/**
 * Status anggaran kategori — cermin dari tabel "Data" di Rekap per tahun
 * (app/(protected)/rekap/[year]/page.tsx): MAX / PENGELUARAN / SISA / STATUS.
 *
 * Dipakai supaya balasan Telegram (kartu transaksi) langsung menunjukkan
 * sisa atau kelebihan anggaran, tanpa user harus buka aplikasi.
 */

export type BudgetStatusLevel = "NORMAL" | "WARNING" | "DANGER"

export interface CategoryBudgetStatus {
  /** Ada anggaran yang berlaku (nominal, atau persentase dari amplop alokasi tipe). */
  hasBudget: boolean
  /** Batas maksimum pengeluaran kategori untuk bulan tersebut. */
  max: number
  /** Total pengeluaran kategori di bulan tersebut (sudah termasuk transaksi baru). */
  spent: number
  /** max − spent. Negatif berarti kelebihan. */
  sisa: number
  /** null = tidak ada anggaran, jadi status tidak ditampilkan. */
  status: BudgetStatusLevel | null
}

/**
 * Satu query untuk semua angka yang dibutuhkan: persentase anggaran per bulan,
 * anggaran nominal, pendapatan bulan itu, dan pengeluaran kategori.
 * Tidak ada join berat — hanya agregasi per kategori & bulan.
 */
const SQL = `
WITH m AS ($MEMBERS$),
b AS (
  SELECT month, SUM(percentage) AS pct
    FROM budgets
   WHERE user_id IN (SELECT user_id FROM m)
     AND category_id = ? AND year = ?
   GROUP BY month
),
n AS (
  SELECT COALESCE(SUM(nominal), 0) AS nominal
    FROM category_nominal_budgets
   WHERE user_id IN (SELECT user_id FROM m)
     AND category_id = ? AND year = ?
),
i AS (
  SELECT COALESCE(SUM(amount), 0) AS total
    FROM incomes
   WHERE user_id IN (SELECT user_id FROM m)
     AND year = ? AND month = ?
),
e AS (
  SELECT COALESCE(SUM(amount), 0) AS total
    FROM expenses
   WHERE user_id IN (SELECT user_id FROM m)
     AND year = ? AND month = ? AND category_id = ?$FAM$
),
c AS (
  SELECT type_id FROM expense_categories WHERE id = ?
),
t AS (
  SELECT COALESCE(SUM(ta.percentage), 0) AS alloc
    FROM type_allocations ta, c
   WHERE ta.type_id = c.type_id
     AND ta.user_id IN (SELECT user_id FROM m)
     AND ta.year = (SELECT MAX(t2.year) FROM type_allocations t2
                     WHERE t2.user_id IN (SELECT user_id FROM m)
                       AND t2.type_id = c.type_id AND t2.year <= ?)
),
ys AS (
  SELECT MAX(max_expense_pct) AS max_pct
    FROM year_budget_settings
   WHERE user_id IN (SELECT user_id FROM m) AND year = ?
)
SELECT
  (SELECT COALESCE(MAX(pct), 0) FROM b)                 AS pct_rep,
  (SELECT COALESCE(SUM(pct), 0) FROM b WHERE month = ?)  AS pct_month,
  (SELECT COUNT(*) FROM b WHERE month = ?)               AS has_month,
  n.nominal                                              AS nominal,
  i.total                                                AS income,
  e.total                                                AS spent,
  t.alloc                                                AS type_alloc,
  COALESCE(ys.max_pct, 100)                              AS max_pct
  FROM n, i, e, t, ys`

/**
 * Scope pembacaan data: selalu pribadi (datanya sendiri), untuk semua peran
 * termasuk admin. Beban keluarga (is_family_expense) tidak ikut dihitung —
 * konsisten dengan mode pribadi di halaman Rekap.
 */
function scopeOf(session: SessionData): { members: string; fam: string; param: string } {
  return {
    members: "SELECT ?::text AS user_id",
    fam: " AND is_family_expense = 0",
    param: session.userId,
  }
}

/**
 * Status anggaran satu kategori untuk satu bulan/tahun.
 * Mengembalikan null bila kategori tidak ada (mis. transaksi tanpa kategori).
 */
export async function getCategoryBudgetStatus(
  session: SessionData,
  categoryId: string | null,
  year: number,
  month: number,
): Promise<CategoryBudgetStatus | null> {
  if (!categoryId) return null

  const scope = scopeOf(session)
  const sql = SQL.replace("$MEMBERS$", scope.members).replace("$FAM$", scope.fam)

  // Urutan placeholder `?` = urutan kemunculan di SQL (lib/db.ts mengurutkan
  // menjadi $1, $2, ... otomatis).
  const rows = await db.prepare<unknown[], {
    pct_rep: number
    pct_month: number
    has_month: number
    nominal: number
    income: number
    spent: number
    type_alloc: number
    max_pct: number
  }>(sql).all(
    scope.param,   // m (household_id / user_id)
    categoryId,    // b.category_id
    year,          // b.year
    categoryId,    // n.category_id
    year,          // n.year
    year,          // i.year
    month,         // i.month
    year,          // e.year
    month,         // e.month
    categoryId,    // e.category_id
    categoryId,    // c.id (tipe kategori)
    year,          // t: alokasi tipe tahun terbaru <= year
    year,          // ys.year
    month,         // pct_month
    month,         // has_month
  )

  const row = rows[0]
  if (!row) return null

  return computeStatus(row)
}

interface StatusRow {
  pct_rep: number
  pct_month: number
  has_month: number
  nominal: number
  income: number
  spent: number
  type_alloc: number
  max_pct: number
}

/** Rumus MAX / SISA / STATUS — identik dengan baris kategori di tabel Rekap. */
function computeStatus(row: StatusRow): CategoryBudgetStatus {
  const pctRep = Number(row.pct_rep) || 0
  const pctMonth = Number(row.pct_month) || 0
  const hasMonth = Number(row.has_month) > 0
  const nominal = Number(row.nominal) || 0
  const income = Number(row.income) || 0
  const spent = Number(row.spent) || 0
  const typeAlloc = Number(row.type_alloc) || 0
  const maxExpensePct = row.max_pct == null ? 100 : Number(row.max_pct)

  // Persentase bulan ini; kalau bulan ini tidak punya baris anggaran, pakai
  // persentase tertinggi dari bulan lain pada tahun yang sama (fallback yang
  // sama dengan halaman Rekap).
  const pct = hasMonth ? pctMonth : pctRep
  const hasNominal = nominal > 0

  // Amplop = alokasi TIPE × batas pengeluaran, terhadap pendapatan. Persentase
  // kategori dihitung DARI amplop tipe, supaya kategori tidak melebihi
  // induknya. Tipe tanpa alokasi → amplop = seluruh batas pengeluaran.
  const envelope = (typeAlloc > 0 ? typeAlloc / 100 : 1) * (maxExpensePct / 100)
  const hasBudget = hasNominal || (envelope > 0 && pct > 0)

  const max = hasNominal ? nominal : income * envelope * (pct / 100)
  const sisa = max - spent

  let status: BudgetStatusLevel | null = null
  if (hasBudget) {
    if (max <= 0) status = "NORMAL"
    else if (sisa < 0) status = "DANGER"
    else if (sisa < max * 0.2) status = "WARNING"
    else status = "NORMAL"
  }

  return { hasBudget, max, spent, sisa, status }
}

/**
 * Versi massal dari `getCategoryBudgetStatus`: hitung status anggaran banyak
 * kategori sekaligus dalam satu query.
 *
 * dipakai laporan yang menyorot banyak kategori sekaligus (/rekap_kategori,
 * /anggaran) supaya tidak perlu N+1 query. Semantiknya identik dengan versi
 * per kategori di atas: persentase dijumlahkan antar anggota keluarga,
 * nominal dijumlahkan antar anggota, dan income/spent mengikuti scope yang
 * sama (mode personal mengabaikan beban rumah tangga).
 */
const BULK_SQL = `
WITH m AS ($MEMBERS$),
b AS (
  SELECT category_id, month, SUM(percentage) AS pct
    FROM budgets
   WHERE user_id IN (SELECT user_id FROM m)
     AND year = ?
   GROUP BY category_id, month
),
n AS (
  SELECT category_id, SUM(nominal) AS nominal
    FROM category_nominal_budgets
   WHERE user_id IN (SELECT user_id FROM m)
     AND year = ?
   GROUP BY category_id
),
i AS (
  SELECT COALESCE(SUM(amount), 0) AS total
    FROM incomes
   WHERE user_id IN (SELECT user_id FROM m)
     AND year = ? AND month = ?
),
e AS (
  SELECT category_id, COALESCE(SUM(amount), 0) AS total
    FROM expenses
   WHERE user_id IN (SELECT user_id FROM m)
     AND year = ? AND month = ?$FAM$
   GROUP BY category_id
),
t AS (
  SELECT ta.type_id, SUM(ta.percentage) AS alloc
    FROM type_allocations ta
   WHERE ta.user_id IN (SELECT user_id FROM m)
     AND ta.year = (SELECT MAX(t2.year) FROM type_allocations t2
                     WHERE t2.user_id IN (SELECT user_id FROM m)
                       AND t2.type_id = ta.type_id AND t2.year <= ?)
   GROUP BY ta.type_id
),
ys AS (
  SELECT MAX(max_expense_pct) AS max_pct
    FROM year_budget_settings
   WHERE user_id IN (SELECT user_id FROM m) AND year = ?
)
SELECT
  c.id AS category_id,
  COALESCE((SELECT MAX(pct) FROM b WHERE b.category_id = c.id), 0) AS pct_rep,
  COALESCE((SELECT SUM(pct) FROM b WHERE b.category_id = c.id AND month = ?), 0) AS pct_month,
  (SELECT COUNT(*) FROM b WHERE b.category_id = c.id AND month = ?) AS has_month,
  COALESCE(n.nominal, 0) AS nominal,
  (SELECT total FROM i) AS income,
  COALESCE(e.total, 0) AS spent,
  COALESCE(t.alloc, 0) AS type_alloc,
  COALESCE((SELECT max_pct FROM ys), 100) AS max_pct
FROM (SELECT unnest(?::text[]) AS id) c
LEFT JOIN n ON n.category_id = c.id
LEFT JOIN e ON e.category_id = c.id
LEFT JOIN expense_categories ec ON ec.id = c.id
LEFT JOIN t ON t.type_id = ec.type_id`

/**
 * Status anggaran untuk banyak kategori sekaligus.
 * Kategori yang tidak punya anggaran tetap dikembalikan dengan
 * `hasBudget: false` supaya pemanggil tetap bisa menampilkan barisnya.
 */
export async function getCategoryBudgetStatuses(
  session: SessionData,
  categoryIds: string[],
  year: number,
  month: number,
): Promise<Map<string, CategoryBudgetStatus>> {
  const result = new Map<string, CategoryBudgetStatus>()
  if (categoryIds.length === 0) return result

  const scope = scopeOf(session)
  const sql = BULK_SQL.replace("$MEMBERS$", scope.members).replace("$FAM$", scope.fam)

  const rows = await db.prepare<unknown[], {
    category_id: string
    pct_rep: number
    pct_month: number
    has_month: number
    nominal: number
    income: number
    spent: number
    type_alloc: number
    max_pct: number
  }>(sql).all(
    scope.param,   // m
    year,          // b.year
    year,          // n.year
    year,          // i.year
    month,         // i.month
    year,          // e.year
    month,         // e.month
    year,          // t: alokasi tipe tahun terbaru <= year
    year,          // ys.year
    month,         // pct_month
    month,         // has_month
    categoryIds,   // daftar kategori
  )

  for (const row of rows) {
    result.set(row.category_id, computeStatus(row))
  }

  return result
}
