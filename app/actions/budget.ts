"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { pool } from "@/lib/db"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error("Unauthenticated")
  return session
}

export async function setBudget(formData: FormData) {
  const session    = await requireUser()
  const categoryId = formData.get("category_id") as string
  const pctRaw     = formData.get("percentage") as string
  const month      = parseInt(formData.get("month") as string)
  const year       = parseInt(formData.get("year") as string)
  const pct        = parseFloat(pctRaw)

  if (!categoryId || isNaN(pct) || isNaN(month) || isNaN(year))
    throw new Error("Invalid input")
  if (pct < 0 || pct > 100)
    throw new Error("Percentage must be between 0 and 100")

  const catRes = await pool.query(
    `SELECT 1 FROM expense_categories WHERE id = $1 AND user_id = $2`,
    [categoryId, session.user.id],
  )
  if (catRes.rows.length === 0) throw new Error("Category not found")

  await pool.query(
    `INSERT INTO budgets (user_id, category_id, percentage, month, year)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, category_id, month, year)
     DO UPDATE SET percentage = EXCLUDED.percentage`,
    [session.user.id, categoryId, pct, month, year],
  )
  revalidatePath("/settings/categories")
}

export async function setTypeAllocations(formData: FormData) {
  const session = await requireUser()

  // Collect indexed pairs: type_0/pct_0, type_1/pct_1, ...
  const pairs: Array<{ typeId: string; pct: number }> = []
  let i = 0
  while (formData.has(`type_${i}`)) {
    const typeId = formData.get(`type_${i}`) as string
    const pct    = parseFloat(formData.get(`pct_${i}`) as string)
    if (typeId && !isNaN(pct)) pairs.push({ typeId, pct })
    i++
  }

  const total = pairs.reduce((s, p) => s + p.pct, 0)
  if (Math.abs(total - 100) > 0.01) {
    redirect("/settings/categories?tab=expense&alloc_error=1")
  }

  for (const { typeId, pct } of pairs) {
    const check = await pool.query(
      `SELECT 1 FROM expense_types WHERE id = $1 AND user_id = $2`,
      [typeId, session.user.id],
    )
    if (check.rows.length === 0) continue
    await pool.query(
      `INSERT INTO type_allocations (user_id, type_id, percentage)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, type_id) DO UPDATE SET percentage = EXCLUDED.percentage`,
      [session.user.id, typeId, pct],
    )
  }

  redirect("/settings/categories?tab=expense")
}
