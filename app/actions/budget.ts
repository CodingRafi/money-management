"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { requireUserIdAction } from "@/lib/session"
import crypto from "crypto"

function uuid() { return crypto.randomUUID() }

export async function setBudget(formData: FormData) {
  const userId     = await requireUserIdAction()
  const categoryId = formData.get("category_id") as string
  const pctRaw     = formData.get("percentage") as string
  const month      = parseInt(formData.get("month") as string)
  const year       = parseInt(formData.get("year")  as string)
  const pct        = parseFloat(pctRaw)

  if (!categoryId || isNaN(pct) || isNaN(month) || isNaN(year)) throw new Error("Invalid input")
  if (pct < 0 || pct > 100) throw new Error("Percentage must be between 0 and 100")

  const cat = await db.prepare("SELECT 1 FROM expense_categories WHERE id = ? AND user_id = ?").get(categoryId, userId)
  if (!cat) throw new Error("Category not found")

  await db.prepare(`
    INSERT INTO budgets (id, user_id, category_id, percentage, month, year)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, category_id, month, year) DO UPDATE SET percentage = excluded.percentage
  `).run(uuid(), userId, categoryId, pct, month, year)

  revalidatePath("/settings/categories")
  revalidatePath("/rekap", "layout")
}

export async function setCategoryNominal(formData: FormData) {
  const userId    = await requireUserIdAction()
  const categoryId = formData.get("category_id") as string
  const year      = parseInt(formData.get("year") as string)
  const nominal   = parseFloat(formData.get("nominal") as string)

  if (!categoryId || isNaN(year) || isNaN(nominal)) throw new Error("Invalid input")
  if (nominal < 0) throw new Error("Nominal must be >= 0")

  const cat = await db.prepare("SELECT 1 FROM expense_categories WHERE id = ? AND user_id = ?").get(categoryId, userId)
  if (!cat) throw new Error("Category not found")

  await db.prepare(`
    INSERT INTO category_nominal_budgets (id, user_id, category_id, year, nominal)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user_id, category_id, year) DO UPDATE SET nominal = excluded.nominal
  `).run(uuid(), userId, categoryId, year, nominal)

  revalidatePath("/rekap", "layout")
}

export async function setMaxExpensePct(formData: FormData) {
  const userId = await requireUserIdAction()
  const year   = parseInt(formData.get("year") as string)
  const pct    = parseFloat(formData.get("max_expense_pct") as string)
  if (isNaN(year) || isNaN(pct)) throw new Error("Invalid input")
  if (pct < 0 || pct > 100) throw new Error("Percentage must be between 0 and 100")

  await db.prepare(`
    INSERT INTO year_budget_settings (id, user_id, year, max_expense_pct)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id, year) DO UPDATE SET max_expense_pct = excluded.max_expense_pct
  `).run(uuid(), userId, year, pct)

  revalidatePath("/rekap", "layout")
}

export async function setTypeAllocations(formData: FormData) {
  const userId  = await requireUserIdAction()
  const year    = parseInt(formData.get("year") as string) || new Date().getFullYear()
  const rawBack = formData.get("back_url") as string | null
  const backUrl = rawBack?.startsWith("/") ? rawBack : "/settings/categories?tab=expense"

  const pairs: Array<{ typeId: string; pct: number }> = []
  let i = 0
  while (formData.has(`type_${i}`)) {
    const typeId = formData.get(`type_${i}`) as string
    const pct    = parseFloat(formData.get(`pct_${i}`) as string)
    if (typeId && !isNaN(pct)) pairs.push({ typeId, pct })
    i++
  }

  const total = pairs.reduce((s, p) => s + p.pct, 0)
  if (Math.abs(total - 100) > 0.01) redirect(`${backUrl}&alloc_error=1`)

  for (const { typeId, pct } of pairs) {
    const check = await db.prepare("SELECT 1 FROM expense_types WHERE id = ? AND user_id = ?").get(typeId, userId)
    if (!check) continue
    await db.prepare(`
      INSERT INTO type_allocations (id, user_id, type_id, percentage, year)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (user_id, type_id, year) DO UPDATE SET percentage = excluded.percentage
    `).run(uuid(), userId, typeId, pct, year)
  }

  redirect(backUrl)
}
