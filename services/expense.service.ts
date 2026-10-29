import crypto from "crypto"
import { expenseRepository } from "@/repositories/expense.repository"
import type { ExpenseInput, IncomeInput } from "@/dtos/transaction"
import { memberRepository } from "@/repositories/member.repository"
import type { SessionData } from "@/lib/auth-simple"

export class TransactionError extends Error {}

async function assertRefs(
  session: SessionData,
  v: { wallet_id: string | null; category_id: string | null },
  categoryTable: "income_categories" | "expense_categories",
) {
  if (v.wallet_id && !(await expenseRepository.walletOwnedBy(v.wallet_id, session.userId))) {
    throw new TransactionError("Dompet tidak ditemukan")
  }
  if (v.category_id && !(await expenseRepository.categoryVisibleTo(categoryTable, v.category_id, session.householdId))) {
    throw new TransactionError("Kategori tidak ditemukan")
  }
}

/** Anak tidak boleh melewati `spending_limit` bulanan (pengeluaran non-awal). */
async function assertChildLimit(session: SessionData, v: ExpenseInput, excludeId: string | null) {
  if (session.householdRole !== "child" || !session.householdId || v.is_initial) return
  const member = await memberRepository.find(session.householdId, session.userId)
  if (member?.spending_limit == null) return
  const spent = await expenseRepository.monthlySpent(session.userId, v.year, v.month, excludeId)
  if (spent + v.amount > member.spending_limit) {
    throw new TransactionError(`Melebihi batas belanja bulanan (sisa Rp ${Math.max(0, member.spending_limit - spent).toLocaleString("id-ID")})`)
  }
}

/**
 * Pengeluaran anak dibatasi `spending_limit` bulanan; bukan beban keluarga
 * kecuali ditandai. Keputusan scope personal vs keluarga ada di sini, bukan di UI.
 */
export const expenseService = {
  async createExpense(session: SessionData, v: ExpenseInput): Promise<void> {
    await assertRefs(session, v, "expense_categories")
    await assertChildLimit(session, v, null)
    await expenseRepository.insertExpense(crypto.randomUUID(), session.userId, session.userId, v)
  },

  async updateExpense(session: SessionData, id: string, v: ExpenseInput): Promise<void> {
    await assertRefs(session, v, "expense_categories")
    await assertChildLimit(session, v, id)
    if (!(await expenseRepository.updateExpense(id, session.userId, v))) throw new TransactionError("Data tidak ditemukan")
  },

  /** Ringkasan belanja anak bulan ini terhadap limit. */
  async childSummary(session: SessionData, year: number, month: number) {
    const member = session.householdId ? await memberRepository.find(session.householdId, session.userId) : undefined
    const spent = await expenseRepository.monthlySpent(session.userId, year, month, null)
    const limit = member?.spending_limit ?? null
    return { spent, limit, remaining: limit == null ? null : Math.max(0, limit - spent) }
  },

  async deleteExpense(session: SessionData, id: string): Promise<void> {
    await expenseRepository.deleteExpense(id, session.userId)
  },

  async createIncome(session: SessionData, v: IncomeInput): Promise<void> {
    await assertRefs(session, v, "income_categories")
    await expenseRepository.insertIncome(crypto.randomUUID(), session.userId, session.userId, v)
  },

  async updateIncome(session: SessionData, id: string, v: IncomeInput): Promise<void> {
    await assertRefs(session, v, "income_categories")
    if (!(await expenseRepository.updateIncome(id, session.userId, v))) throw new TransactionError("Data tidak ditemukan")
  },

  async deleteIncome(session: SessionData, id: string): Promise<void> {
    await expenseRepository.deleteIncome(id, session.userId)
  },

  /**
   * Total pengeluaran per anggota, dipisah personal vs rumah tangga.
   * Pengeluaran ber-flag keluarga TIDAK mengurangi budget personal.
   */
  async spendingSplit(userIds: string[], year: number, month: number | null) {
    return await expenseRepository.spendingSplit(userIds, year, month)
  },
}
