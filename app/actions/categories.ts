"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { requireSessionAction } from "@/lib/session"
import { categoryRepository } from "@/repositories/category.repository"

// Kategori satu daftar untuk seluruh keluarga: household_id selalu dari sesi.
// Anak (child) tidak boleh mengubah kategori.
async function requireHousehold() {
  const s = await requireSessionAction()
  if (!s.householdId || s.householdRole === "child") throw new Error("Forbidden")
  return s.householdId
}

const nameSchema = z.string().trim().min(1, "Nama wajib diisi").max(80).transform((v) => v.toUpperCase())
const colorSchema = z.string().trim().max(32).nullish().transform((v) => v || null)
const idSchema = z.string().min(1)

function refresh() {
  revalidatePath("/settings/categories")
  revalidatePath("/rekap", "layout")
}

function backOr(formData: FormData, fallback: string): never {
  const backUrl = formData.get("back_url")
  redirect(typeof backUrl === "string" && backUrl.startsWith("/") && !backUrl.startsWith("//") ? backUrl : fallback)
}

// ── Income ───────────────────────────────────────────────────────────────────

export async function createUserIncomeCategory(formData: FormData) {
  const householdId = await requireHousehold()
  await categoryRepository.createIncome(householdId, nameSchema.parse(formData.get("name")), colorSchema.parse(formData.get("color")))
  refresh()
}

export async function updateUserIncomeCategory(id: string, formData: FormData) {
  const householdId = await requireHousehold()
  await categoryRepository.updateIncome(householdId, idSchema.parse(id), nameSchema.parse(formData.get("name")), colorSchema.parse(formData.get("color")))
  backOr(formData, "/settings/categories?tab=income")
}

export async function toggleUserIncomeCategoryVisibility(id: string) {
  const householdId = await requireHousehold()
  await categoryRepository.toggleHidden("income_categories", householdId, idSchema.parse(id))
  refresh()
}

export async function deleteUserIncomeCategory(id: string) {
  const householdId = await requireHousehold()
  await categoryRepository.remove("income_categories", householdId, idSchema.parse(id))
  refresh()
}

// ── Expense ──────────────────────────────────────────────────────────────────

export async function createUserExpenseCategory(formData: FormData) {
  const householdId = await requireHousehold()
  const name = nameSchema.parse(formData.get("name"))
  const typeId = idSchema.parse(formData.get("type_id"))
  if (!(await categoryRepository.typeInHousehold(householdId, typeId))) throw new Error("Tipe tidak ditemukan")
  await categoryRepository.createExpense(householdId, typeId, name)
  refresh()
}

export async function updateUserExpenseCategory(id: string, formData: FormData) {
  const householdId = await requireHousehold()
  await categoryRepository.updateExpense(householdId, idSchema.parse(id), nameSchema.parse(formData.get("name")))
  backOr(formData, "/settings/categories?tab=expense")
}

export async function toggleUserExpenseCategoryVisibility(id: string) {
  const householdId = await requireHousehold()
  await categoryRepository.toggleHidden("expense_categories", householdId, idSchema.parse(id))
  refresh()
}

export async function deleteUserExpenseCategory(id: string) {
  const householdId = await requireHousehold()
  await categoryRepository.remove("expense_categories", householdId, idSchema.parse(id))
  refresh()
}
