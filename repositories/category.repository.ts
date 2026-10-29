import { db } from "@/lib/db"
import crypto from "crypto"

const uuid = () => crypto.randomUUID()

export const categoryRepository = {
  /**
   * Menyalin template global (household_id IS NULL, is_default = 1) menjadi
   * kategori milik keluarga baru. Harus dipanggil di dalam db.transaction().
   */
  async seedHouseholdFromTemplate(householdId: string): Promise<void> {
    const incomes = await db.prepare(
      "SELECT name, color, sort_order FROM income_categories WHERE is_default = 1 AND household_id IS NULL AND user_id IS NULL ORDER BY sort_order"
    ).all() as { name: string; color: string | null; sort_order: number }[]
    for (const r of incomes) {
      await db.prepare(
        "INSERT INTO income_categories (id, name, is_default, household_id, color, sort_order) VALUES (?, ?, 0, ?, ?, ?)"
      ).run(uuid(), r.name, householdId, r.color, r.sort_order)
    }

    const types = await db.prepare(
      "SELECT id, name, sort_order FROM expense_types WHERE is_default = 1 AND household_id IS NULL AND user_id IS NULL ORDER BY sort_order"
    ).all() as { id: string; name: string; sort_order: number }[]
    for (const t of types) {
      const typeId = uuid()
      await db.prepare(
        "INSERT INTO expense_types (id, name, is_default, household_id, sort_order) VALUES (?, ?, 0, ?, ?)"
      ).run(typeId, t.name, householdId, t.sort_order)

      const cats = await db.prepare(
        "SELECT name, sort_order, default_percentage FROM expense_categories WHERE type_id = ? AND is_default = 1 AND household_id IS NULL AND user_id IS NULL ORDER BY sort_order"
      ).all(t.id) as { name: string; sort_order: number; default_percentage: number }[]
      for (const c of cats) {
        await db.prepare(
          "INSERT INTO expense_categories (id, name, type_id, is_default, household_id, sort_order, default_percentage) VALUES (?, ?, ?, 0, ?, ?, ?)"
        ).run(uuid(), c.name, typeId, householdId, c.sort_order, c.default_percentage)
      }
    }
  },

  async createIncome(householdId: string, name: string, color: string | null): Promise<void> {
    const row = await db.prepare(
      "SELECT COALESCE(MAX(sort_order), 0) + 1 AS max FROM income_categories WHERE household_id = ?"
    ).get(householdId) as { max: number }
    await db.prepare(
      "INSERT INTO income_categories (id, name, is_default, household_id, color, sort_order) VALUES (?, ?, 0, ?, ?, ?)"
    ).run(uuid(), name, householdId, color, row.max)
  },

  async updateIncome(householdId: string, id: string, name: string, color: string | null): Promise<void> {
    await db.prepare("UPDATE income_categories SET name = ?, color = ? WHERE id = ? AND household_id = ?")
      .run(name, color, id, householdId)
  },

  async typeInHousehold(householdId: string, typeId: string): Promise<boolean> {
    return !!(await db.prepare("SELECT 1 FROM expense_types WHERE id = ? AND household_id = ?").get(typeId, householdId))
  },

  async createExpense(householdId: string, typeId: string, name: string): Promise<void> {
    const row = await db.prepare(
      "SELECT COALESCE(MAX(sort_order), 0) + 1 AS max FROM expense_categories WHERE household_id = ? AND type_id = ?"
    ).get(householdId, typeId) as { max: number }
    await db.prepare(
      "INSERT INTO expense_categories (id, name, type_id, is_default, household_id, sort_order) VALUES (?, ?, ?, 0, ?, ?)"
    ).run(uuid(), name, typeId, householdId, row.max)
  },

  async updateExpense(householdId: string, id: string, name: string): Promise<void> {
    await db.prepare("UPDATE expense_categories SET name = ? WHERE id = ? AND household_id = ?").run(name, id, householdId)
  },

  async toggleHidden(table: "income_categories" | "expense_categories", householdId: string, id: string): Promise<void> {
    await db.prepare(
      `UPDATE ${table} SET is_hidden = CASE WHEN is_hidden = 1 THEN 0 ELSE 1 END WHERE id = ? AND household_id = ?`
    ).run(id, householdId)
  },

  async remove(table: "income_categories" | "expense_categories", householdId: string, id: string): Promise<void> {
    await db.prepare(`DELETE FROM ${table} WHERE id = ? AND household_id = ?`).run(id, householdId)
  },
}
