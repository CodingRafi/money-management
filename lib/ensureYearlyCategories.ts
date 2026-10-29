import { db } from "./db"
import crypto from "crypto"

function uuid() { return crypto.randomUUID() }

export async function ensureYearlyCategories(userId: string, year: number): Promise<void> {
  await ensureIncomeCategories(userId, year)
  await ensureExpenseTypes(userId, year)
}

async function ensureIncomeCategories(userId: string, year: number): Promise<void> {
  const existing = await db.prepare("SELECT 1 FROM income_categories WHERE user_id = ? AND year = ? LIMIT 1").get(userId, year)
  if (existing) return

  const prevRow = await db.prepare(
    "SELECT year FROM income_categories WHERE user_id = ? AND year < ? ORDER BY year DESC LIMIT 1"
  ).get(userId, year) as { year: number } | undefined

  const sourceWhere = prevRow
    ? `user_id = '${userId}' AND year = ${prevRow.year}`
    : `user_id IS NULL AND is_default = 1`

  const rows = await db.prepare(
    `SELECT name, is_default, color, is_hidden, sort_order FROM income_categories WHERE ${sourceWhere} ORDER BY sort_order`
  ).all() as { name: string; is_default: number; color: string | null; is_hidden: number; sort_order: number }[]

  await db.transaction(async () => {
    const stmt = await db.prepare("INSERT INTO income_categories (id, name, is_default, user_id, color, is_hidden, sort_order, year) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    for (const row of rows) await stmt.run(uuid(), row.name, row.is_default, userId, row.color, row.is_hidden, row.sort_order, year)
  })
}

async function ensureExpenseTypes(userId: string, year: number): Promise<void> {
  const existing = await db.prepare("SELECT 1 FROM expense_types WHERE user_id = ? AND year = ? LIMIT 1").get(userId, year)
  if (existing) return

  const prevRow = await db.prepare(
    "SELECT year FROM expense_types WHERE user_id = ? AND year < ? ORDER BY year DESC LIMIT 1"
  ).get(userId, year) as { year: number } | undefined

  const fromUser = !!prevRow

  const types = fromUser
    ? await db.prepare("SELECT id, name, sort_order FROM expense_types WHERE user_id = ? AND year = ? ORDER BY sort_order").all(userId, prevRow!.year) as { id: string; name: string; sort_order: number }[]
    : await db.prepare("SELECT id, name, sort_order FROM expense_types WHERE user_id IS NULL AND is_default = 1 ORDER BY sort_order").all() as { id: string; name: string; sort_order: number }[]

  await db.transaction(async () => {
    for (const type of types) {
      const newTypeId = uuid()
      await db.prepare("INSERT INTO expense_types (id, name, is_default, user_id, sort_order, year) VALUES (?, ?, 0, ?, ?, ?)").run(
        newTypeId, type.name, userId, type.sort_order, year
      )

      if (fromUser) {
        const allocRow = await db.prepare(
          "SELECT percentage FROM type_allocations WHERE user_id = ? AND type_id = ? LIMIT 1"
        ).get(userId, type.id) as { percentage: number } | undefined
        if (allocRow) {
          await db.prepare(
            "INSERT INTO type_allocations (id, user_id, type_id, percentage, year) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING"
          ).run(
            uuid(), userId, newTypeId, allocRow.percentage, year
          )
        }
      }

      const cats = fromUser
        ? await db.prepare("SELECT name, is_default, is_hidden, default_percentage, sort_order FROM expense_categories WHERE type_id = ? AND user_id = ? ORDER BY sort_order").all(type.id, userId) as { name: string; is_default: number; is_hidden: number; default_percentage: number; sort_order: number }[]
        : await db.prepare("SELECT name, is_default, is_hidden, default_percentage, sort_order FROM expense_categories WHERE type_id = ? AND user_id IS NULL ORDER BY sort_order").all(type.id) as { name: string; is_default: number; is_hidden: number; default_percentage: number; sort_order: number }[]

      for (const cat of cats) {
        await db.prepare("INSERT INTO expense_categories (id, name, type_id, is_default, user_id, is_hidden, default_percentage, sort_order, year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
          uuid(), cat.name, newTypeId, cat.is_default, userId, cat.is_hidden, cat.default_percentage, cat.sort_order, year
        )
      }
    }
  })
}
