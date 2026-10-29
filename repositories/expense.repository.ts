import { db } from "@/lib/db"
import type { ExpenseInput, IncomeInput } from "@/dtos/transaction"

export const expenseRepository = {
  /** Dompet harus milik user (anti-IDOR). */
  async walletOwnedBy(walletId: string, userId: string): Promise<boolean> {
    const row = await db.prepare("SELECT 1 FROM wallets WHERE id = ? AND user_id = ?").get(walletId, userId)
    return !!row
  },

  async categoryVisibleTo(table: "income_categories" | "expense_categories", categoryId: string, householdId: string | null): Promise<boolean> {
    const row = await db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND household_id IS NOT DISTINCT FROM ?`).get(categoryId, householdId)
    return !!row
  },

  async insertExpense(id: string, userId: string, recordedBy: string, v: ExpenseInput): Promise<void> {
    await db.prepare(
      `INSERT INTO expenses (id, user_id, recorded_by, date, name, wallet_id, category_id, needs_type, amount, month, year, is_initial, is_family_expense)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, recordedBy, v.date, v.name, v.wallet_id, v.category_id, v.needs_type, v.amount, v.month, v.year,
      v.is_initial ? 1 : 0, v.is_family_expense ? 1 : 0)
  },

  async updateExpense(id: string, userId: string, v: ExpenseInput): Promise<number> {
    const res = await db.prepare(
      `UPDATE expenses SET date=?, name=?, wallet_id=?, category_id=?, needs_type=?, amount=?, is_initial=?, is_family_expense=?
       WHERE id=? AND user_id=?`
    ).run(v.date, v.name, v.wallet_id, v.category_id, v.needs_type, v.amount, v.is_initial ? 1 : 0, v.is_family_expense ? 1 : 0, id, userId)
    return res.changes
  },

  async deleteExpense(id: string, userId: string): Promise<number> {
    return (await db.prepare("DELETE FROM expenses WHERE id = ? AND user_id = ?").run(id, userId)).changes
  },

  async insertIncome(id: string, userId: string, recordedBy: string, v: IncomeInput): Promise<void> {
    await db.prepare(
      `INSERT INTO incomes (id, user_id, recorded_by, date, name, category_id, wallet_id, amount, month, year, is_initial)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, recordedBy, v.date, v.name, v.category_id, v.wallet_id, v.amount, v.month, v.year, v.is_initial ? 1 : 0)
  },

  async updateIncome(id: string, userId: string, v: IncomeInput): Promise<number> {
    const res = await db.prepare(
      "UPDATE incomes SET date=?, name=?, category_id=?, wallet_id=?, amount=?, is_initial=? WHERE id=? AND user_id=?"
    ).run(v.date, v.name, v.category_id, v.wallet_id, v.amount, v.is_initial ? 1 : 0, id, userId)
    return res.changes
  },

  async deleteIncome(id: string, userId: string): Promise<number> {
    return (await db.prepare("DELETE FROM incomes WHERE id = ? AND user_id = ?").run(id, userId)).changes
  },

  async deleteYear(userId: string, year: number): Promise<void> {
    await db.prepare("DELETE FROM incomes     WHERE user_id = ? AND year = ?").run(userId, year)
    await db.prepare("DELETE FROM expenses    WHERE user_id = ? AND year = ?").run(userId, year)
    await db.prepare("DELETE FROM loans_given WHERE user_id = ? AND year = ?").run(userId, year)
    await db.prepare("DELETE FROM loans_taken WHERE user_id = ? AND year = ?").run(userId, year)
  },

  async monthlySpent(userId: string, year: number, month: number, excludeId: string | null): Promise<number> {
    const row = await db.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
       WHERE user_id = ? AND year = ? AND month = ? AND is_initial = 0 AND (?::text IS NULL OR id <> ?::text)`
    ).get(userId, year, month, excludeId, excludeId) as { total: number }
    return row.total
  },

  /** Pengeluaran personal vs rumah tangga per user pada satu periode. */
  async spendingSplit(userIds: string[], year: number, month: number | null) {
    if (userIds.length === 0) return []
    const ph = userIds.map(() => "?").join(",")
    return await db.prepare(
      `SELECT user_id,
              COALESCE(SUM(CASE WHEN is_family_expense = 0 THEN amount ELSE 0 END), 0) AS personal,
              COALESCE(SUM(CASE WHEN is_family_expense = 1 THEN amount ELSE 0 END), 0) AS household
       FROM expenses
       WHERE user_id IN (${ph}) AND year = ? AND (?::int IS NULL OR month = ?::int) AND is_initial = 0
       GROUP BY user_id`
    ).all(...userIds, year, month, month) as { user_id: string; personal: number; household: number }[]
  },
}
