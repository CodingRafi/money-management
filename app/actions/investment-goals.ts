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

export async function createGoal(formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "add_investment")

  const name         = (formData.get("name") as string)?.trim()
  const targetAmount = (formData.get("target_amount") as string) ? parseFloat(formData.get("target_amount") as string) : null
  const targetDate   = (formData.get("target_date") as string) || null
  const color        = (formData.get("color") as string) || null

  if (!name) throw new Error("Nama kantong wajib diisi")
  if (targetAmount !== null && (isNaN(targetAmount) || targetAmount <= 0)) throw new Error("Target nominal tidak valid")

  await pool.query(
    `INSERT INTO investment_goals (user_id, name, target_amount, target_date, color)
     VALUES ($1,$2,$3,$4,$5)`,
    [userId, name, targetAmount, targetDate, color],
  )

  revalidatePath("/investasi")
  redirect("/investasi")
}

export async function updateGoal(id: string, formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "change_investment")

  const name         = (formData.get("name") as string)?.trim()
  const targetAmount = (formData.get("target_amount") as string) ? parseFloat(formData.get("target_amount") as string) : null
  const targetDate   = (formData.get("target_date") as string) || null
  const color        = (formData.get("color") as string) || null

  if (!name) throw new Error("Nama kantong wajib diisi")
  if (targetAmount !== null && (isNaN(targetAmount) || targetAmount <= 0)) throw new Error("Target nominal tidak valid")

  await pool.query(
    `UPDATE investment_goals
     SET name=$1, target_amount=$2, target_date=$3, color=$4, updated_at=now()
     WHERE id=$5 AND user_id=$6`,
    [name, targetAmount, targetDate, color, id, userId],
  )

  revalidatePath("/investasi")
  redirect("/investasi")
}

export async function deleteGoal(id: string) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "delete_investment")

  const txRes = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM investment_transactions WHERE goal_id=$1`,
    [id],
  )
  if (parseInt(txRes.rows[0].cnt) > 0) {
    throw new Error("Kantong masih memiliki transaksi aktif dan tidak bisa dihapus")
  }

  await pool.query(
    `UPDATE investment_goals SET is_active=false, updated_at=now() WHERE id=$1 AND user_id=$2`,
    [id, userId],
  )

  revalidatePath("/investasi")
  redirect("/investasi")
}
