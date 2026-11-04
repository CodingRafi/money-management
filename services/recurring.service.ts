import crypto from "crypto"
import { z } from "zod"
import { db } from "@/lib/db"
import type { SessionData } from "@/lib/auth-simple"
import {
  detectRecurring,
  isSamePattern,
  matchesPattern,
  type DetectedPattern,
  type TxnLike,
} from "@/lib/recurring/detect"
import { dueDateIn, monthIndex } from "@/lib/recurring/score"
import { recurringRepository, type PatternRow } from "@/repositories/recurring.repository"
import { expenseRepository } from "@/repositories/expense.repository"
import { expenseService, TransactionError } from "@/services/expense.service"

export class RecurringError extends Error {}

export type Candidate = DetectedPattern & { categoryName: string | null }

export type MissingEntry = {
  patternId: string
  userId: string
  kind: "EXPENSE" | "INCOME"
  name: string
  amount: number
  dueDate: string
  /** overdue = lewat jatuh tempo, due-soon = ≤ 3 hari lagi */
  severity: "overdue" | "due-soon"
  /** Hari keterlambatan (negatif = hari lagi sebelum jatuh tempo). */
  daysLate: number
  categoryName: string | null
  confidence: number
}

const DUE_SOON_DAYS = 3

function toPatternLike(p: PatternRow) {
  return {
    kind: p.kind,
    name: p.name,
    categoryId: p.category_id,
    amountAvg: Number(p.amount_avg),
    amountMin: Number(p.amount_min),
    amountMax: Number(p.amount_max),
  }
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000)
}

/** "YYYY-MM-DD" n bulan sebelumnya (awal bulan). */
function monthsAgoStart(today: string, months: number): string {
  const idx = monthIndex(today) - months
  const y = Math.floor(idx / 12)
  const m = (idx % 12) + 1
  return `${y}-${String(m).padStart(2, "0")}-01`
}

// ── Validasi input konfirmasi pola (nilai dari klien tidak dipercaya) ─────────

export const confirmSchema = z.object({
  kind: z.enum(["EXPENSE", "INCOME"]),
  name: z.string().trim().min(1, "Nama wajib diisi").max(200),
  categoryId: z.string().min(1).nullish().transform((v) => v ?? null),
  walletId: z.string().min(1).nullish().transform((v) => v ?? null),
  needsType: z.enum(["PRIMER", "SEKUNDER", "TERSIER"]).default("PRIMER"),
  isFamilyExpense: z.boolean().default(false),
  amountAvg: z.coerce.number().positive().finite(),
  amountMin: z.coerce.number().positive().finite(),
  amountMax: z.coerce.number().positive().finite(),
  occurrences: z.coerce.number().int().min(0).max(1000),
  dayOfMonth: z.coerce.number().int().min(1).max(31),
  confidence: z.coerce.number().min(0).max(1),
  lastSeenDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().transform((v) => v ?? null),
  autoPost: z.boolean().default(false),
})
export type ConfirmInput = z.infer<typeof confirmSchema>

export const recurringService = {
  /**
   * Deteksi pola dari histori (belum disimpan). Kandidat yang sudah mirip pola
   * tersimpan — termasuk yang diabaikan — disembunyikan.
   */
  async detect(
    userIds: string[],
    opts: { months?: number; minConfidence?: number } = {},
  ): Promise<Candidate[]> {
    const today = await recurringRepository.today()
    const txns = await recurringRepository.loadTransactions(userIds, monthsAgoStart(today, opts.months ?? 12))
    const detected = detectRecurring(txns, { asOfMonth: today.slice(0, 7), minConfidence: opts.minConfidence })
    if (!detected.length) return []

    const stored = await recurringRepository.list(userIds)
    const fresh = detected.filter(
      (d) => !stored.some((s) => s.user_id === d.userId && isSamePattern(d, toPatternLike(s))),
    )
    const names = await recurringRepository.categoryNames([...new Set(fresh.map((f) => f.categoryId).filter((x): x is string => !!x))])
    return fresh.map((f) => ({ ...f, categoryName: f.categoryId ? (names.get(f.categoryId) ?? null) : null }))
  },

  /** Pola tersimpan (aktif & diabaikan) dalam scope. */
  async list(userIds: string[]): Promise<PatternRow[]> {
    return recurringRepository.list(userIds)
  },

  /** Simpan pola hasil review user. Idempoten: pola yang sama diperbarui, bukan digandakan. */
  async confirm(session: SessionData, raw: unknown): Promise<string> {
    const v = confirmSchema.parse(raw)
    if (v.kind === "INCOME") v.isFamilyExpense = false
    if (v.walletId && !(await expenseRepository.walletOwnedBy(v.walletId, session.userId))) {
      throw new RecurringError("Dompet tidak ditemukan")
    }
    if (v.categoryId) {
      const table = v.kind === "EXPENSE" ? "expense_categories" : "income_categories"
      if (!(await expenseRepository.categoryVisibleTo(table, v.categoryId, session.householdId))) {
        throw new RecurringError("Kategori tidak ditemukan")
      }
    }

    const existing = (await recurringRepository.list([session.userId])).find((s) =>
      isSamePattern(v, toPatternLike(s)),
    )
    if (existing) {
      await recurringRepository.update(existing.id, session.userId, {
        name: v.name, amountAvg: v.amountAvg, dayOfMonth: v.dayOfMonth,
        categoryId: v.categoryId, walletId: v.walletId, isActive: true, autoPost: v.autoPost,
      })
      return existing.id
    }

    const id = crypto.randomUUID()
    await recurringRepository.insert({ ...v, id, userId: session.userId, householdId: session.householdId })
    return id
  },

  /** Kandidat ditolak: simpan sebagai pola nonaktif agar tidak diusulkan lagi. */
  async ignore(session: SessionData, raw: unknown): Promise<void> {
    const id = await this.confirm(session, raw)
    await recurringRepository.update(id, session.userId, { isActive: false, autoPost: false })
  },

  async setState(session: SessionData, id: string, patch: { isActive?: boolean; autoPost?: boolean }): Promise<void> {
    if (!(await recurringRepository.update(id, session.userId, patch))) throw new RecurringError("Pola tidak ditemukan")
  },

  async edit(
    session: SessionData,
    id: string,
    patch: { name: string; amountAvg: number; dayOfMonth: number; autoPost: boolean },
  ): Promise<void> {
    const p = z
      .object({
        name: z.string().trim().min(1).max(200),
        amountAvg: z.coerce.number().positive().finite(),
        dayOfMonth: z.coerce.number().int().min(1).max(31),
        autoPost: z.boolean(),
      })
      .parse(patch)
    if (!(await recurringRepository.update(id, session.userId, p))) throw new RecurringError("Pola tidak ditemukan")
  },

  async remove(session: SessionData, id: string): Promise<void> {
    await recurringRepository.delete(id, session.userId)
  },

  /**
   * Pola aktif yang jatuh tempo (atau ≤ 3 hari lagi) pada bulan ini tapi belum
   * ada transaksinya. Urut: overdue dulu, lalu confidence tertinggi.
   */
  async missingThisMonth(userIds: string[], today?: string): Promise<MissingEntry[]> {
    const now = today ?? (await recurringRepository.today())
    const month = now.slice(0, 7)
    const patterns = (await recurringRepository.list(userIds)).filter(
      (p) => p.is_active === 1 && p.last_posted_month !== month,
    )
    if (!patterns.length) return []

    const monthTxns = await recurringRepository.loadMonth([...new Set(patterns.map((p) => p.user_id))], month)
    const out: MissingEntry[] = []
    for (const p of patterns) {
      const dueDate = dueDateIn(month, p.day_of_month)
      const daysLate = daysBetween(now, dueDate)
      if (daysLate < -DUE_SOON_DAYS) continue // belum waktunya
      const like = toPatternLike(p)
      const mine = monthTxns.filter((t) => t.userId === p.user_id)
      if (mine.some((t) => matchesPattern(like, t))) continue
      out.push({
        patternId: p.id,
        userId: p.user_id,
        kind: p.kind,
        name: p.name,
        amount: Number(p.amount_avg),
        dueDate,
        severity: daysLate > 0 ? "overdue" : "due-soon",
        daysLate,
        categoryName: p.category_name,
        confidence: Number(p.confidence),
      })
    }
    return out.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "overdue" ? -1 : 1
      return b.confidence - a.confidence || b.daysLate - a.daysLate
    })
  },

  /** Buat transaksi dari pola pada tanggal `date`. Klaim bulan + insert dalam SATU transaksi DB. */
  async postPattern(session: SessionData, p: PatternRow, date: string): Promise<boolean> {
    const month = date.slice(0, 7)
    return db.transaction(async () => {
      if (!(await recurringRepository.claimMonth(p.id, session.userId, month))) return false
      const base = {
        date,
        name: p.name,
        amount: Number(p.amount_avg),
        month: Number(date.slice(5, 7)),
        year: Number(date.slice(0, 4)),
        is_initial: false,
        wallet_id: p.wallet_id,
        category_id: p.category_id,
      }
      if (p.kind === "EXPENSE") {
        await expenseService.createExpense(session, { ...base, needs_type: p.needs_type, is_family_expense: !!p.is_family_expense })
      } else {
        await expenseService.createIncome(session, base)
      }
      return true
    })
  },

  /** Buat transaksi sekarang (tombol "Catat sekarang"). */
  async postNow(session: SessionData, id: string): Promise<void> {
    const p = await recurringRepository.findById(id)
    if (!p || p.user_id !== session.userId) throw new RecurringError("Pola tidak ditemukan")
    const today = await recurringRepository.today()
    const ok = await this.postPattern(session, p, today)
    if (!ok) throw new RecurringError("Bulan ini sudah ditandai tercatat")
  },

  /** Tandai bulan ini sudah dicatat secara manual (tanpa membuat transaksi). */
  async markHandled(session: SessionData, id: string): Promise<void> {
    const p = await recurringRepository.findById(id)
    if (!p || p.user_id !== session.userId) throw new RecurringError("Pola tidak ditemukan")
    const today = await recurringRepository.today()
    await recurringRepository.claimMonth(id, session.userId, today.slice(0, 7))
  },

  /**
   * Buat transaksi untuk pola `auto_post` milik user yang sudah jatuh tempo bulan ini.
   * Idempoten per (pola, bulan) lewat `claimMonth`.
   */
  async postDue(session: SessionData): Promise<{ created: number; skipped: number }> {
    const today = await recurringRepository.today()
    const month = today.slice(0, 7)
    const patterns = (await recurringRepository.list([session.userId])).filter(
      (p) => p.is_active === 1 && p.auto_post === 1 && p.last_posted_month !== month,
    )
    if (!patterns.length) return { created: 0, skipped: 0 }

    const monthTxns: TxnLike[] = await recurringRepository.loadMonth([session.userId], month)
    let created = 0
    let skipped = 0
    for (const p of patterns) {
      const dueDate = dueDateIn(month, p.day_of_month)
      if (today < dueDate) continue
      try {
        if (monthTxns.some((t) => matchesPattern(toPatternLike(p), t))) {
          // Sudah dicatat manual → cukup tandai, jangan dobel.
          await recurringRepository.claimMonth(p.id, session.userId, month)
          skipped++
          continue
        }
        if (await this.postPattern(session, p, dueDate)) created++
        else skipped++
      } catch (err) {
        if (!(err instanceof TransactionError)) console.error("[recurring] postDue gagal:", err)
        skipped++
      }
    }
    return { created, skipped }
  },
}
