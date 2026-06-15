import { db } from "./db"
import crypto from "crypto"

function uuid() { return crypto.randomUUID() }

export function ensureYearlyCategories(userId: string, year: number): void {
  const existing = db.prepare("SELECT 1 FROM income_categories WHERE user_id = ? AND year = ? LIMIT 1").get(userId, year)
  if (existing) return

  const prevRow = db.prepare(
    "SELECT year FROM income_categories WHERE user_id = ? AND year < ? AND year IS NOT NULL ORDER BY year DESC LIMIT 1"
  ).get(userId, year) as { year: number } | undefined
  if (!prevRow) return

  const prevYear = prevRow.year

  const tx = db.transaction(() => {
    // Income categories
    const prevIncome = db.prepare(
      "SELECT name, is_default, color, is_hidden, sort_order FROM income_categories WHERE user_id = ? AND year = ?"
    ).all(userId, prevYear) as { name: string; is_default: number; color: string | null; is_hidden: number; sort_order: number }[]
    const inStmt = db.prepare("INSERT INTO income_categories (id, name, is_default, user_id, color, is_hidden, sort_order, year) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    for (const row of prevIncome) inStmt.run(uuid(), row.name, row.is_default, userId, row.color, row.is_hidden, row.sort_order, year)

    // Expense types
    const prevTypes = db.prepare(
      "SELECT id, name, sort_order FROM expense_types WHERE user_id = ? AND year = ? ORDER BY sort_order"
    ).all(userId, prevYear) as { id: string; name: string; sort_order: number }[]

    for (const type of prevTypes) {
      const newTypeId = uuid()
      db.prepare("INSERT INTO expense_types (id, name, is_default, user_id, sort_order, year) VALUES (?, ?, 0, ?, ?, ?)").run(
        newTypeId, type.name, userId, type.sort_order, year
      )

      const allocRow = db.prepare(
        "SELECT percentage FROM type_allocations WHERE user_id = ? AND type_id = ? LIMIT 1"
      ).get(userId, type.id) as { percentage: number } | undefined
      if (allocRow) {
        db.prepare("INSERT OR IGNORE INTO type_allocations (id, user_id, type_id, percentage, year) VALUES (?, ?, ?, ?, ?)").run(
          uuid(), userId, newTypeId, allocRow.percentage, year
        )
      }

      const prevCats = db.prepare(
        "SELECT name, is_default, is_hidden, default_percentage, sort_order FROM expense_categories WHERE type_id = ? AND user_id = ? ORDER BY sort_order"
      ).all(type.id, userId) as { name: string; is_default: number; is_hidden: number; default_percentage: number; sort_order: number }[]

      for (const cat of prevCats) {
        db.prepare("INSERT INTO expense_categories (id, name, type_id, is_default, user_id, is_hidden, default_percentage, sort_order, year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
          uuid(), cat.name, newTypeId, cat.is_default, userId, cat.is_hidden, cat.default_percentage, cat.sort_order, year
        )
      }
    }
  })

  tx()
}
