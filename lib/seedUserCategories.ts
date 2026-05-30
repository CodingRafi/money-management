import { pool } from "./db"

const DEFAULT_TYPE_ALLOCATIONS: Record<string, number> = {
  TETAP:     40,
  FLEKSIBEL: 20,
  MENABUNG:  40,
}

export async function seedUserCategories(userId: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const existing = await client.query(
      `SELECT 1 FROM income_categories WHERE user_id = $1 LIMIT 1`,
      [userId],
    )
    if (existing.rows.length > 0) {
      await client.query("COMMIT")
      return
    }

    const now   = new Date()
    const month = now.getMonth() + 1
    const year  = now.getFullYear()

    // Copy income categories
    await client.query(
      `INSERT INTO income_categories (name, is_default, user_id, color, sort_order, year)
       SELECT name, false, $1, color, sort_order, $2
       FROM income_categories
       WHERE is_default = true AND user_id IS NULL
       ORDER BY sort_order`,
      [userId, year],
    )

    // Copy expense types + categories + set type allocations
    const typesRes = await client.query<{ id: string; name: string; sort_order: number }>(
      `SELECT id, name, sort_order FROM expense_types
       WHERE is_default = true AND user_id IS NULL
       ORDER BY sort_order`,
    )

    for (const type of typesRes.rows) {
      const newTypeRes = await client.query<{ id: string }>(
        `INSERT INTO expense_types (name, is_default, user_id, sort_order, year)
         VALUES ($1, false, $2, $3, $4) RETURNING id`,
        [type.name, userId, type.sort_order, year],
      )
      const newTypeId = newTypeRes.rows[0].id

      // Default type allocation (40/20/40)
      const allocPct = DEFAULT_TYPE_ALLOCATIONS[type.name] ?? 0
      await client.query(
        `INSERT INTO type_allocations (user_id, type_id, percentage, year)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, type_id, year) DO NOTHING`,
        [userId, newTypeId, allocPct, year],
      )

      // Copy expense categories for this type
      const catsRes = await client.query<{
        name: string; sort_order: number; default_percentage: string
      }>(
        `SELECT name, sort_order, default_percentage
         FROM expense_categories
         WHERE type_id = $1 AND is_default = true AND user_id IS NULL
         ORDER BY sort_order`,
        [type.id],
      )

      for (const cat of catsRes.rows) {
        const newCatRes = await client.query<{ id: string }>(
          `INSERT INTO expense_categories (name, type_id, is_default, user_id, sort_order, year)
           VALUES ($1, $2, false, $3, $4, $5) RETURNING id`,
          [cat.name, newTypeId, userId, cat.sort_order, year],
        )
        const pct = parseFloat(cat.default_percentage)
        if (pct > 0) {
          await client.query(
            `INSERT INTO budgets (user_id, category_id, percentage, month, year)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, category_id, month, year) DO NOTHING`,
            [userId, newCatRes.rows[0].id, pct, month, year],
          )
        }
      }
    }

    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
  }
}
