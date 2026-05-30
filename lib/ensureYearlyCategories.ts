import { pool } from "./db"

/**
 * Auto-duplicates the most recent year's categories/types/allocations into
 * `year` if no data exists yet. Called when a user first accesses a new year.
 */
export async function ensureYearlyCategories(userId: string, year: number): Promise<void> {
  const { rows: existing } = await pool.query(
    `SELECT 1 FROM income_categories WHERE user_id = $1 AND year = $2 LIMIT 1`,
    [userId, year],
  )
  if (existing.length > 0) return

  const { rows: prevRows } = await pool.query<{ year: number }>(
    `SELECT year FROM income_categories
     WHERE user_id = $1 AND year < $2 AND year IS NOT NULL
     ORDER BY year DESC LIMIT 1`,
    [userId, year],
  )
  if (prevRows.length === 0) return
  const prevYear = prevRows[0].year

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    // 1. Income categories
    await client.query(
      `INSERT INTO income_categories (name, is_default, user_id, color, is_hidden, sort_order, year)
       SELECT name, is_default, user_id, color, is_hidden, sort_order, $1
       FROM income_categories
       WHERE user_id = $2 AND year = $3`,
      [year, userId, prevYear],
    )

    // 2. Expense types + categories + allocations
    const { rows: prevTypes } = await client.query<{
      id: string; name: string; sort_order: number
    }>(
      `SELECT id, name, sort_order FROM expense_types
       WHERE user_id = $1 AND year = $2
       ORDER BY sort_order`,
      [userId, prevYear],
    )

    for (const type of prevTypes) {
      const { rows: newTypeRows } = await client.query<{ id: string }>(
        `INSERT INTO expense_types (name, is_default, user_id, sort_order, year)
         VALUES ($1, false, $2, $3, $4) RETURNING id`,
        [type.name, userId, type.sort_order, year],
      )
      const newTypeId = newTypeRows[0].id

      // Copy allocation from previous type UUID
      const { rows: allocRows } = await client.query<{ percentage: string }>(
        `SELECT percentage FROM type_allocations WHERE user_id = $1 AND type_id = $2`,
        [userId, type.id],
      )
      if (allocRows.length > 0) {
        await client.query(
          `INSERT INTO type_allocations (user_id, type_id, percentage, year)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, type_id, year) DO NOTHING`,
          [userId, newTypeId, allocRows[0].percentage, year],
        )
      }

      // Copy expense categories for this type
      const { rows: prevCats } = await client.query<{
        name: string; is_default: boolean; is_hidden: boolean
        default_percentage: string; sort_order: number
      }>(
        `SELECT name, is_default, is_hidden, default_percentage, sort_order
         FROM expense_categories
         WHERE type_id = $1 AND user_id = $2
         ORDER BY sort_order`,
        [type.id, userId],
      )
      for (const cat of prevCats) {
        await client.query(
          `INSERT INTO expense_categories
             (name, type_id, is_default, user_id, is_hidden, default_percentage, sort_order, year)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [cat.name, newTypeId, cat.is_default, userId,
           cat.is_hidden, cat.default_percentage, cat.sort_order, year],
        )
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
