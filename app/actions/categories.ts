"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { pool } from "@/lib/db"
import { userHasPermission } from "@/lib/permissions"

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error("Unauthenticated")
  const ok = await userHasPermission(session.user.id, "manage_roles")
  if (!ok) throw new Error("Unauthorized")
  return session
}

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error("Unauthenticated")
  return session
}

// ── Admin: Master Income Categories ────────────────────────────────────────

export async function createMasterIncomeCategory(formData: FormData) {
  await requireAdmin()
  const name  = (formData.get("name") as string)?.trim().toUpperCase()
  const color = (formData.get("color") as string)?.trim() || null
  if (!name) throw new Error("Name is required")
  const orderRes = await pool.query<{ max: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS max
     FROM income_categories WHERE is_default = true AND user_id IS NULL`,
  )
  await pool.query(
    `INSERT INTO income_categories (name, is_default, user_id, color, sort_order)
     VALUES ($1, true, null, $2, $3)`,
    [name, color, orderRes.rows[0].max],
  )
  revalidatePath("/admin/master/income")
}

export async function updateMasterIncomeCategory(id: string, formData: FormData) {
  await requireAdmin()
  const name  = (formData.get("name") as string)?.trim().toUpperCase()
  const color = (formData.get("color") as string)?.trim() || null
  if (!name) throw new Error("Name is required")
  await pool.query(
    `UPDATE income_categories SET name = $1, color = $2
     WHERE id = $3 AND is_default = true AND user_id IS NULL`,
    [name, color, id],
  )
  redirect("/admin/master/income")
}

export async function deleteMasterIncomeCategory(id: string) {
  await requireAdmin()
  await pool.query(
    `DELETE FROM income_categories WHERE id = $1 AND is_default = true AND user_id IS NULL`,
    [id],
  )
  revalidatePath("/admin/master/income")
}

// ── Admin: Master Expense Types ─────────────────────────────────────────────

export async function createMasterExpenseType(formData: FormData) {
  await requireAdmin()
  const name = (formData.get("name") as string)?.trim().toUpperCase()
  if (!name) throw new Error("Name is required")
  const orderRes = await pool.query<{ max: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS max
     FROM expense_types WHERE is_default = true AND user_id IS NULL`,
  )
  await pool.query(
    `INSERT INTO expense_types (name, is_default, user_id, sort_order) VALUES ($1, true, null, $2)`,
    [name, orderRes.rows[0].max],
  )
  revalidatePath("/admin/master/expense")
}

export async function deleteMasterExpenseType(id: string) {
  await requireAdmin()
  await pool.query(
    `DELETE FROM expense_types WHERE id = $1 AND is_default = true AND user_id IS NULL`,
    [id],
  )
  revalidatePath("/admin/master/expense")
}

// ── Admin: Master Expense Categories ───────────────────────────────────────

export async function createMasterExpenseCategory(formData: FormData) {
  await requireAdmin()
  const name   = (formData.get("name") as string)?.trim().toUpperCase()
  const typeId = formData.get("type_id") as string
  const pctRaw = formData.get("default_percentage") as string
  const pct    = pctRaw ? parseFloat(pctRaw) : 0
  if (!name || !typeId) throw new Error("Name and type are required")
  const orderRes = await pool.query<{ max: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS max
     FROM expense_categories WHERE type_id = $1 AND is_default = true AND user_id IS NULL`,
    [typeId],
  )
  await pool.query(
    `INSERT INTO expense_categories (name, type_id, is_default, user_id, sort_order, default_percentage)
     VALUES ($1, $2, true, null, $3, $4)`,
    [name, typeId, orderRes.rows[0].max, pct],
  )
  revalidatePath("/admin/master/expense")
}

export async function updateMasterExpenseCategory(id: string, formData: FormData) {
  await requireAdmin()
  const name   = (formData.get("name") as string)?.trim().toUpperCase()
  const pctRaw = formData.get("default_percentage") as string
  const pct    = pctRaw ? parseFloat(pctRaw) : 0
  if (!name) throw new Error("Name is required")
  await pool.query(
    `UPDATE expense_categories SET name = $1, default_percentage = $2
     WHERE id = $3 AND is_default = true AND user_id IS NULL`,
    [name, pct, id],
  )
  redirect("/admin/master/expense")
}

export async function deleteMasterExpenseCategory(id: string) {
  await requireAdmin()
  await pool.query(
    `DELETE FROM expense_categories WHERE id = $1 AND is_default = true AND user_id IS NULL`,
    [id],
  )
  revalidatePath("/admin/master/expense")
}

// ── User: Income Categories ─────────────────────────────────────────────────

export async function createUserIncomeCategory(formData: FormData) {
  const session = await requireUser()
  const name    = (formData.get("name") as string)?.trim().toUpperCase()
  const color   = (formData.get("color") as string)?.trim() || null
  if (!name) throw new Error("Name is required")
  const orderRes = await pool.query<{ max: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS max FROM income_categories WHERE user_id = $1`,
    [session.user.id],
  )
  await pool.query(
    `INSERT INTO income_categories (name, is_default, user_id, color, sort_order)
     VALUES ($1, false, $2, $3, $4)`,
    [name, session.user.id, color, orderRes.rows[0].max],
  )
  revalidatePath("/settings/categories")
}

export async function updateUserIncomeCategory(id: string, formData: FormData) {
  const session = await requireUser()
  const name    = (formData.get("name") as string)?.trim().toUpperCase()
  const color   = (formData.get("color") as string)?.trim() || null
  if (!name) throw new Error("Name is required")
  await pool.query(
    `UPDATE income_categories SET name = $1, color = $2 WHERE id = $3 AND user_id = $4`,
    [name, color, id, session.user.id],
  )
  redirect("/settings/categories?tab=income")
}

export async function toggleUserIncomeCategoryVisibility(id: string) {
  const session = await requireUser()
  await pool.query(
    `UPDATE income_categories SET is_hidden = NOT is_hidden WHERE id = $1 AND user_id = $2`,
    [id, session.user.id],
  )
  revalidatePath("/settings/categories")
}

export async function deleteUserIncomeCategory(id: string) {
  const session = await requireUser()
  await pool.query(
    `DELETE FROM income_categories WHERE id = $1 AND user_id = $2`,
    [id, session.user.id],
  )
  revalidatePath("/settings/categories")
}

// ── User: Expense Categories ────────────────────────────────────────────────

export async function createUserExpenseCategory(formData: FormData) {
  const session = await requireUser()
  const name    = (formData.get("name") as string)?.trim().toUpperCase()
  const typeId  = formData.get("type_id") as string
  if (!name || !typeId) throw new Error("Name and type are required")
  const orderRes = await pool.query<{ max: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS max
     FROM expense_categories WHERE user_id = $1 AND type_id = $2`,
    [session.user.id, typeId],
  )
  await pool.query(
    `INSERT INTO expense_categories (name, type_id, is_default, user_id, sort_order)
     VALUES ($1, $2, false, $3, $4)`,
    [name, typeId, session.user.id, orderRes.rows[0].max],
  )
  revalidatePath("/settings/categories")
}

export async function updateUserExpenseCategory(id: string, formData: FormData) {
  const session = await requireUser()
  const name    = (formData.get("name") as string)?.trim().toUpperCase()
  if (!name) throw new Error("Name is required")
  await pool.query(
    `UPDATE expense_categories SET name = $1 WHERE id = $2 AND user_id = $3`,
    [name, id, session.user.id],
  )
  redirect("/settings/categories?tab=expense")
}

export async function toggleUserExpenseCategoryVisibility(id: string) {
  const session = await requireUser()
  await pool.query(
    `UPDATE expense_categories SET is_hidden = NOT is_hidden WHERE id = $1 AND user_id = $2`,
    [id, session.user.id],
  )
  revalidatePath("/settings/categories")
}

export async function deleteUserExpenseCategory(id: string) {
  const session = await requireUser()
  await pool.query(
    `DELETE FROM expense_categories WHERE id = $1 AND user_id = $2`,
    [id, session.user.id],
  )
  revalidatePath("/settings/categories")
}
