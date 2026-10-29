"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { requireUserIdAction } from "@/lib/session"
import crypto from "crypto"

function uuid() { return crypto.randomUUID() }

export async function createGoal(formData: FormData) {
  const userId       = await requireUserIdAction()
  const name         = (formData.get("name") as string)?.trim()
  const targetAmount = formData.get("target_amount") ? parseFloat(formData.get("target_amount") as string) : null
  const targetDate   = (formData.get("target_date") as string) || null
  const color        = (formData.get("color") as string) || null

  if (!name) throw new Error("Nama kantong wajib diisi")
  if (targetAmount !== null && (isNaN(targetAmount) || targetAmount <= 0)) throw new Error("Target nominal tidak valid")

  await db.prepare(
    "INSERT INTO investment_goals (id, user_id, name, target_amount, target_date, color) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(uuid(), userId, name, targetAmount, targetDate, color)

  revalidatePath("/investasi")
}

export async function updateGoal(id: string, formData: FormData) {
  const userId       = await requireUserIdAction()
  const name         = (formData.get("name") as string)?.trim()
  const targetAmount = formData.get("target_amount") ? parseFloat(formData.get("target_amount") as string) : null
  const targetDate   = (formData.get("target_date") as string) || null
  const color        = (formData.get("color") as string) || null

  if (!name) throw new Error("Nama kantong wajib diisi")
  if (targetAmount !== null && (isNaN(targetAmount) || targetAmount <= 0)) throw new Error("Target nominal tidak valid")

  await db.prepare(
    "UPDATE investment_goals SET name=?, target_amount=?, target_date=?, color=?, updated_at=datetime('now') WHERE id=? AND user_id=?"
  ).run(name, targetAmount, targetDate, color, id, userId)

  revalidatePath("/investasi")
}

export async function deleteGoal(id: string) {
  const userId = await requireUserIdAction()

  const txRow = await db.prepare(
    "SELECT COUNT(*) AS cnt FROM investment_transactions WHERE goal_id=?"
  ).get(id) as { cnt: number }
  if (txRow.cnt > 0) throw new Error("Kantong masih memiliki transaksi aktif dan tidak bisa dihapus")

  await db.prepare(
    "UPDATE investment_goals SET is_active=0, updated_at=datetime('now') WHERE id=? AND user_id=?"
  ).run(id, userId)

  revalidatePath("/investasi")
}
