import { db } from "@/lib/db"
import type { NeedsType, TxnKind, TxnLike } from "@/lib/recurring/detect"

export interface PatternRow {
  id: string
  user_id: string
  household_id: string | null
  kind: TxnKind
  name: string
  category_id: string | null
  wallet_id: string | null
  needs_type: NeedsType
  is_family_expense: number
  amount_avg: number
  amount_min: number
  amount_max: number
  occurrences: number
  day_of_month: number
  confidence: number
  is_active: number
  auto_post: number
  last_posted_month: string | null
  last_seen_date: string | null
  category_name: string | null
}

export interface PatternInput {
  id: string
  userId: string
  householdId: string | null
  kind: TxnKind
  name: string
  categoryId: string | null
  walletId: string | null
  needsType: NeedsType
  isFamilyExpense: boolean
  amountAvg: number
  amountMin: number
  amountMax: number
  occurrences: number
  dayOfMonth: number
  confidence: number
  autoPost: boolean
  lastSeenDate: string | null
}

const SELECT_PATTERN = `
  SELECT p.*, COALESCE(ec.name, ic.name) AS category_name
  FROM recurring_patterns p
  LEFT JOIN expense_categories ec ON p.kind = 'EXPENSE' AND ec.id = p.category_id
  LEFT JOIN income_categories  ic ON p.kind = 'INCOME'  AND ic.id = p.category_id`

export const recurringRepository = {
  /** Tanggal hari ini (WIB) menurut jam database — konsisten dengan tanggal pencatatan lain. */
  async today(): Promise<string> {
    const row = (await db
      .prepare("SELECT to_char(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS today")
      .get()) as { today: string } | undefined
    return row?.today ?? new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
  },

  /** Pengeluaran + pemasukan (non-saldo-awal) sejak `sinceDate`, untuk bahan deteksi. */
  async loadTransactions(userIds: string[], sinceDate: string): Promise<TxnLike[]> {
    if (!userIds.length) return []
    const rows = (await db
      .prepare<[string[], string, string[], string]>(
        `SELECT 'EXPENSE' AS kind, id, user_id, name, amount, date, category_id, wallet_id, needs_type, is_family_expense
           FROM expenses WHERE user_id = ANY(?) AND is_initial = 0 AND date >= ?
         UNION ALL
         SELECT 'INCOME', id, user_id, name, amount, date, category_id, wallet_id, NULL, 0
           FROM incomes WHERE user_id = ANY(?) AND is_initial = 0 AND date >= ?`,
      )
      .all(userIds, sinceDate, userIds, sinceDate)) as {
      kind: TxnKind
      id: string
      user_id: string
      name: string
      amount: number
      date: string
      category_id: string | null
      wallet_id: string | null
      needs_type: NeedsType | null
      is_family_expense: number
    }[]
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      kind: r.kind,
      name: r.name,
      amount: Number(r.amount),
      date: r.date,
      categoryId: r.category_id,
      walletId: r.wallet_id,
      needsType: r.needs_type,
      isFamilyExpense: !!r.is_family_expense,
    }))
  },

  /** Transaksi pada satu bulan "YYYY-MM" (untuk cek "sudah dicatat?"). */
  async loadMonth(userIds: string[], month: string): Promise<TxnLike[]> {
    return this.loadTransactions(userIds, `${month}-01`).then((all) => all.filter((t) => t.date.startsWith(month)))
  },

  /** id kategori (pengeluaran/pemasukan) → nama. */
  async categoryNames(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    if (!ids.length) return out
    const rows = (await db
      .prepare<[string[], string[]]>(
        `SELECT id, name FROM expense_categories WHERE id = ANY(?)
         UNION ALL SELECT id, name FROM income_categories WHERE id = ANY(?)`,
      )
      .all(ids, ids)) as { id: string; name: string }[]
    for (const r of rows) out.set(r.id, r.name)
    return out
  },

  async list(userIds: string[]): Promise<PatternRow[]> {
    if (!userIds.length) return []
    return (await db
      .prepare<[string[]]>(`${SELECT_PATTERN} WHERE p.user_id = ANY(?) ORDER BY p.is_active DESC, p.day_of_month, p.name`)
      .all(userIds)) as PatternRow[]
  },

  async findById(id: string): Promise<PatternRow | undefined> {
    return (await db.prepare<[string]>(`${SELECT_PATTERN} WHERE p.id = ?`).get(id)) as PatternRow | undefined
  },

  async insert(p: PatternInput): Promise<void> {
    await db
      .prepare(
        `INSERT INTO recurring_patterns
           (id, user_id, household_id, kind, name, category_id, wallet_id, needs_type, is_family_expense,
            amount_avg, amount_min, amount_max, occurrences, day_of_month, confidence, auto_post, last_seen_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        p.id, p.userId, p.householdId, p.kind, p.name, p.categoryId, p.walletId, p.needsType, p.isFamilyExpense ? 1 : 0,
        p.amountAvg, p.amountMin, p.amountMax, p.occurrences, p.dayOfMonth, p.confidence, p.autoPost ? 1 : 0, p.lastSeenDate,
      )
  },

  /** Perbarui pola milik user (anti-IDOR lewat user_id). */
  async update(
    id: string,
    userId: string,
    patch: {
      name?: string
      amountAvg?: number
      dayOfMonth?: number
      categoryId?: string | null
      walletId?: string | null
      isActive?: boolean
      autoPost?: boolean
    },
  ): Promise<number> {
    const sets: string[] = []
    const vals: unknown[] = []
    const add = (col: string, v: unknown) => {
      sets.push(`${col} = ?`)
      vals.push(v)
    }
    if (patch.name !== undefined) add("name", patch.name)
    if (patch.amountAvg !== undefined) {
      add("amount_avg", patch.amountAvg)
      add("amount_min", patch.amountAvg)
      add("amount_max", patch.amountAvg)
    }
    if (patch.dayOfMonth !== undefined) add("day_of_month", patch.dayOfMonth)
    if (patch.categoryId !== undefined) add("category_id", patch.categoryId)
    if (patch.walletId !== undefined) add("wallet_id", patch.walletId)
    if (patch.isActive !== undefined) add("is_active", patch.isActive ? 1 : 0)
    if (patch.autoPost !== undefined) add("auto_post", patch.autoPost ? 1 : 0)
    if (!sets.length) return 0
    sets.push("updated_at = NOW()")
    return (await db.prepare(`UPDATE recurring_patterns SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`).run(...vals, id, userId)).changes
  },

  async delete(id: string, userId: string): Promise<number> {
    return (await db.prepare("DELETE FROM recurring_patterns WHERE id = ? AND user_id = ?").run(id, userId)).changes
  },

  /**
   * Tandai bulan sudah ditangani — ATOMIK: hanya satu pemanggil yang berhasil per
   * (pola, bulan), jadi dua device/tab tidak bisa membuat transaksi ganda.
   * Mengembalikan true bila klaim ini yang menang.
   */
  async claimMonth(id: string, userId: string, month: string): Promise<boolean> {
    const res = await db
      .prepare(
        `UPDATE recurring_patterns SET last_posted_month = ?, updated_at = NOW()
         WHERE id = ? AND user_id = ? AND is_active = 1 AND last_posted_month IS DISTINCT FROM ?`,
      )
      .run(month, id, userId, month)
    return res.changes === 1
  },
}
