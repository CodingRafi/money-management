"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { requireUserIdAction } from "@/lib/session"
import crypto from "crypto"

function uuid() { return crypto.randomUUID() }

export async function createUserIncomeCategory(formData: FormData) {
  const userId = await requireUserIdAction()
  const name   = (formData.get("name") as string)?.trim().toUpperCase()
  const color  = (formData.get("color") as string)?.trim() || null
  const year   = parseInt(formData.get("year") as string) || new Date().getFullYear()
  if (!name) throw new Error("Name is required")
  const orderRow = await db.prepare(
    "SELECT COALESCE(MAX(sort_order), 0) + 1 AS max FROM income_categories WHERE user_id = ? AND year = ?"
  ).get(userId, year) as { max: number }
  await db.prepare(
    "INSERT INTO income_categories (id, name, is_default, user_id, color, sort_order, year) VALUES (?, ?, 0, ?, ?, ?, ?)"
  ).run(uuid(), name, userId, color, orderRow.max, year)
  revalidatePath("/settings/categories")
  revalidatePath("/rekap", "layout")
}

export async function updateUserIncomeCategory(id: string, formData: FormData) {
  const userId = await requireUserIdAction()
  const name   = (formData.get("name") as string)?.trim().toUpperCase()
  const color  = (formData.get("color") as string)?.trim() || null
  if (!name) throw new Error("Name is required")
  await db.prepare(
    "UPDATE income_categories SET name = ?, color = ? WHERE id = ? AND user_id = ?"
  ).run(name, color, id, userId)
  const backUrl = formData.get("back_url") as string | null
  if (backUrl?.startsWith("/")) redirect(backUrl)
  else redirect("/settings/categories?tab=income")
}

export async function toggleUserIncomeCategoryVisibility(id: string) {
  const userId = await requireUserIdAction()
  await db.prepare(
    "UPDATE income_categories SET is_hidden = CASE WHEN is_hidden = 1 THEN 0 ELSE 1 END WHERE id = ? AND user_id = ?"
  ).run(id, userId)
  revalidatePath("/settings/categories")
  revalidatePath("/rekap", "layout")
}

export async function deleteUserIncomeCategory(id: string) {
  const userId = await requireUserIdAction()
  await db.prepare("DELETE FROM income_categories WHERE id = ? AND user_id = ?").run(id, userId)
  revalidatePath("/settings/categories")
  revalidatePath("/rekap", "layout")
}

export async function createUserExpenseCategory(formData: FormData) {
  const userId = await requireUserIdAction()
  const name   = (formData.get("name") as string)?.trim().toUpperCase()
  const typeId = formData.get("type_id") as string
  const year   = parseInt(formData.get("year") as string) || new Date().getFullYear()
  if (!name || !typeId) throw new Error("Name and type are required")
  const orderRow = await db.prepare(
    "SELECT COALESCE(MAX(sort_order), 0) + 1 AS max FROM expense_categories WHERE user_id = ? AND type_id = ?"
  ).get(userId, typeId) as { max: number }
  await db.prepare(
    "INSERT INTO expense_categories (id, name, type_id, is_default, user_id, sort_order, year) VALUES (?, ?, ?, 0, ?, ?, ?)"
  ).run(uuid(), name, typeId, userId, orderRow.max, year)
  revalidatePath("/settings/categories")
  revalidatePath("/rekap", "layout")
}

export async function updateUserExpenseCategory(id: string, formData: FormData) {
  const userId = await requireUserIdAction()
  const name   = (formData.get("name") as string)?.trim().toUpperCase()
  if (!name) throw new Error("Name is required")
  await db.prepare(
    "UPDATE expense_categories SET name = ? WHERE id = ? AND user_id = ?"
  ).run(name, id, userId)
  const backUrl = formData.get("back_url") as string | null
  if (backUrl?.startsWith("/")) redirect(backUrl)
  else redirect("/settings/categories?tab=expense")
}

export async function toggleUserExpenseCategoryVisibility(id: string) {
  const userId = await requireUserIdAction()
  await db.prepare(
    "UPDATE expense_categories SET is_hidden = CASE WHEN is_hidden = 1 THEN 0 ELSE 1 END WHERE id = ? AND user_id = ?"
  ).run(id, userId)
  revalidatePath("/settings/categories")
  revalidatePath("/rekap", "layout")
}

export async function deleteUserExpenseCategory(id: string) {
  const userId = await requireUserIdAction()
  await db.prepare("DELETE FROM expense_categories WHERE id = ? AND user_id = ?").run(id, userId)
  revalidatePath("/settings/categories")
  revalidatePath("/rekap", "layout")
}
