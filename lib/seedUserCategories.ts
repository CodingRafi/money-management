import { db } from "./db"
import crypto from "crypto"

const DEFAULT_TYPE_ALLOCATIONS: Record<string, number> = {
  TETAP:     50,
  FLEKSIBEL: 30,
}

function uuid() { return crypto.randomUUID() }

export function seedUserCategories(userId: string): void {
  const existing = db.prepare("SELECT 1 FROM income_categories WHERE user_id = ? LIMIT 1").get(userId)
  if (existing) return

  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1

  const seedTx = db.transaction(() => {
    // Copy income categories from defaults
    const defaultIncome = db.prepare(
      "SELECT name, color, sort_order FROM income_categories WHERE is_default = 1 AND user_id IS NULL ORDER BY sort_order"
    ).all() as { name: string; color: string | null; sort_order: number }[]
    const inStmt = db.prepare("INSERT INTO income_categories (id, name, is_default, user_id, color, sort_order, year) VALUES (?, ?, 0, ?, ?, ?, ?)")
    for (const row of defaultIncome) inStmt.run(uuid(), row.name, userId, row.color, row.sort_order, year)

    // Copy expense types + categories
    const defaultTypes = db.prepare(
      "SELECT id, name, sort_order FROM expense_types WHERE is_default = 1 AND user_id IS NULL ORDER BY sort_order"
    ).all() as { id: string; name: string; sort_order: number }[]

    for (const type of defaultTypes) {
      const newTypeId = uuid()
      db.prepare("INSERT INTO expense_types (id, name, is_default, user_id, sort_order, year) VALUES (?, ?, 0, ?, ?, ?)").run(
        newTypeId, type.name, userId, type.sort_order, year
      )

      const allocPct = DEFAULT_TYPE_ALLOCATIONS[type.name] ?? 0
      db.prepare("INSERT OR IGNORE INTO type_allocations (id, user_id, type_id, percentage, year) VALUES (?, ?, ?, ?, ?)").run(
        uuid(), userId, newTypeId, allocPct, year
      )

      const defaultCats = db.prepare(
        "SELECT name, sort_order, default_percentage FROM expense_categories WHERE type_id = ? AND is_default = 1 AND user_id IS NULL ORDER BY sort_order"
      ).all(type.id) as { name: string; sort_order: number; default_percentage: number }[]

      for (const cat of defaultCats) {
        const newCatId = uuid()
        db.prepare("INSERT INTO expense_categories (id, name, type_id, is_default, user_id, sort_order, year) VALUES (?, ?, ?, 0, ?, ?, ?)").run(
          newCatId, cat.name, newTypeId, userId, cat.sort_order, year
        )
        if (cat.default_percentage > 0) {
          db.prepare("INSERT OR IGNORE INTO budgets (id, user_id, category_id, percentage, month, year) VALUES (?, ?, ?, ?, ?, ?)").run(
            uuid(), userId, newCatId, cat.default_percentage, month, year
          )
        }
      }
    }
  })

  seedTx()
}
