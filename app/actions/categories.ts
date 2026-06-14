"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { pool } from "@/lib/db"
import { requirePermission } from "@/lib/licence"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error("Unauthenticated")
  return session
}

// ── User: Income Categories ─────────────────────────────────────────────────

export async function createUserIncomeCategory(formData: FormData) {
  const session = await requireUser()
  await requirePermission(session.user.id, "add_category")
  const name    = (formData.get("name") as string)?.trim().toUpperCase()
  const color   = (formData.get("color") as string)?.trim() || null
  const year    = parseInt(formData.get("year") as string) || new Date().getFullYear()
  if (!name) throw new Error("Name is required")
  const orderRes = await pool.query<{ max: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS max
     FROM income_categories WHERE user_id = $1 AND year = $2`,
    [session.user.id, year],
  )
  await pool.query(
    `INSERT INTO income_categories (name, is_default, user_id, color, sort_order, year)
     VALUES ($1, false, $2, $3, $4, $5)`,
    [name, session.user.id, color, orderRes.rows[0].max, year],
  )
  revalidatePath("/settings/categories")
  revalidatePath("/rekap", "layout")
}

export async function updateUserIncomeCategory(id: string, formData: FormData) {
  const session = await requireUser()
  await requirePermission(session.user.id, "change_category")
  const name    = (formData.get("name") as string)?.trim().toUpperCase()
  const color   = (formData.get("color") as string)?.trim() || null
  if (!name) throw new Error("Name is required")
  await pool.query(
    `UPDATE income_categories SET name = $1, color = $2 WHERE id = $3 AND user_id = $4`,
    [name, color, id, session.user.id],
  )
  const backUrl = formData.get("back_url") as string | null
  if (backUrl?.startsWith("/")) redirect(backUrl)
  else redirect("/settings/categories?tab=income")
}

export async function toggleUserIncomeCategoryVisibility(id: string) {
  const session = await requireUser()
  await requirePermission(session.user.id, "change_category")
  await pool.query(
    `UPDATE income_categories SET is_hidden = NOT is_hidden WHERE id = $1 AND user_id = $2`,
    [id, session.user.id],
  )
  revalidatePath("/settings/categories")
  revalidatePath("/rekap", "layout")
}

export async function deleteUserIncomeCategory(id: string) {
  const session = await requireUser()
  await requirePermission(session.user.id, "delete_category")
  await pool.query(
    `DELETE FROM income_categories WHERE id = $1 AND user_id = $2`,
    [id, session.user.id],
  )
  revalidatePath("/settings/categories")
  revalidatePath("/rekap", "layout")
}

// ── User: Expense Categories ────────────────────────────────────────────────

export async function createUserExpenseCategory(formData: FormData) {
  const session = await requireUser()
  await requirePermission(session.user.id, "add_category")
  const name    = (formData.get("name") as string)?.trim().toUpperCase()
  const typeId  = formData.get("type_id") as string
  const year    = parseInt(formData.get("year") as string) || new Date().getFullYear()
  if (!name || !typeId) throw new Error("Name and type are required")
  const orderRes = await pool.query<{ max: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS max
     FROM expense_categories WHERE user_id = $1 AND type_id = $2`,
    [session.user.id, typeId],
  )
  await pool.query(
    `INSERT INTO expense_categories (name, type_id, is_default, user_id, sort_order, year)
     VALUES ($1, $2, false, $3, $4, $5)`,
    [name, typeId, session.user.id, orderRes.rows[0].max, year],
  )
  revalidatePath("/settings/categories")
  revalidatePath("/rekap", "layout")
}

export async function updateUserExpenseCategory(id: string, formData: FormData) {
  const session = await requireUser()
  await requirePermission(session.user.id, "change_category")
  const name    = (formData.get("name") as string)?.trim().toUpperCase()
  if (!name) throw new Error("Name is required")
  await pool.query(
    `UPDATE expense_categories SET name = $1 WHERE id = $2 AND user_id = $3`,
    [name, id, session.user.id],
  )
  const backUrl = formData.get("back_url") as string | null
  if (backUrl?.startsWith("/")) redirect(backUrl)
  else redirect("/settings/categories?tab=expense")
}

export async function toggleUserExpenseCategoryVisibility(id: string) {
  const session = await requireUser()
  await requirePermission(session.user.id, "change_category")
  await pool.query(
    `UPDATE expense_categories SET is_hidden = NOT is_hidden WHERE id = $1 AND user_id = $2`,
    [id, session.user.id],
  )
  revalidatePath("/settings/categories")
  revalidatePath("/rekap", "layout")
}

export async function deleteUserExpenseCategory(id: string) {
  const session = await requireUser()
  await requirePermission(session.user.id, "delete_category")
  await pool.query(
    `DELETE FROM expense_categories WHERE id = $1 AND user_id = $2`,
    [id, session.user.id],
  )
  revalidatePath("/settings/categories")
  revalidatePath("/rekap", "layout")
}
