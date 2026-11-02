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
  /** Ada anggaran yang berlaku (nominal atau persentase pendapatan). */
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
)
SELECT
  (SELECT COALESCE(MAX(pct), 0) FROM b)                 AS pct_rep,
  (SELECT COALESCE(SUM(pct), 0) FROM b WHERE month = ?)  AS pct_month,
  (SELECT COUNT(*) FROM b WHERE month = ?)               AS has_month,
  n.nominal                                              AS nominal,
  i.total                                                AS income,
  e.total                                                AS spent
  FROM n, i, e`

/**
 * Scope pembacaan data.
 *
 * - Admin → mode keluarga (semua anggota), sama seperti default aplikasi.
 * - Anggota lain → mode personal (datanya sendiri saja), dan beban keluarga
 *   (is_family_expense) tidak ikut dihitung — konsisten dengan halaman Rekap.
 */
function scopeOf(session: SessionData): { members: string; fam: string; param: string } {
  if (session.householdId && session.householdRole === "admin") {
    return {
      members: "SELECT user_id FROM household_members WHERE household_id = ?",
      fam: "",
      param: session.householdId,
    }
  }
  return {
    members: "SELECT ?::text AS user_id",
    fam: " AND is_family_expense = 0",
    param: session.userId,
  }
}

/**
 * Hitung status anggaran satu kategori untuk satu bulan/tahun.
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
    month,         // pct_month
    month,         // has_month
  )

  const row = rows[0]
  if (!row) return null

  const pctRep = Number(row.pct_rep) || 0
  const pctMonth = Number(row.pct_month) || 0
  const hasMonth = Number(row.has_month) > 0
  const nominal = Number(row.nominal) || 0
  const income = Number(row.income) || 0
  const spent = Number(row.spent) || 0

  // Persentase bulan ini; kalau bulan ini tidak punya baris anggaran, pakai
  // persentase tertinggi dari bulan lain pada tahun yang sama (fallback yang
  // sama dengan halaman Rekap).
  const pct = hasMonth ? pctMonth : pctRep
  const hasNominal = nominal > 0
  const hasBudget = hasNominal || pct > 0

  const max = hasNominal ? nominal : income * (pct / 100)
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
