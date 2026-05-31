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

export async function createWallet(formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "add_wallet")

  const name = (formData.get("name") as string)?.trim()
  const categoryId = formData.get("category_id") as string
  const isLiquid = formData.get("is_liquid") === "true"
  const color = (formData.get("color") as string)?.trim() || null
  const initialBalance = parseFloat((formData.get("initial_balance") as string) || "0") || 0

  if (!name) throw new Error("Nama dompet tidak boleh kosong")
  if (!categoryId) throw new Error("Kategori wajib dipilih")

  const orderRes = await pool.query<{ max: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS max FROM wallets WHERE user_id = $1`,
    [userId],
  )

  await pool.query(
    `INSERT INTO wallets (user_id, category_id, name, is_liquid, color, sort_order, initial_balance, balance)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
    [userId, categoryId, name, isLiquid, color, orderRes.rows[0].max, initialBalance],
  )

  redirect("/dompet")
}

export async function updateWallet(id: string, formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "change_wallet")

  const name = (formData.get("name") as string)?.trim()
  const isLiquid = formData.get("is_liquid") === "true"
  const color = (formData.get("color") as string)?.trim() || null

  if (!name) throw new Error("Nama dompet tidak boleh kosong")

  await pool.query(
    `UPDATE wallets
     SET name = $1, is_liquid = $2, color = $3, updated_at = now()
     WHERE id = $4 AND user_id = $5 AND is_active = true`,
    [name, isLiquid, color, id, userId],
  )

  redirect("/dompet")
}

export async function deleteWallet(id: string) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "delete_wallet")

  await pool.query(
    `UPDATE wallets SET is_active = false, updated_at = now()
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  )

  revalidatePath("/dompet")
}

export async function adjustBalance(id: string, formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "change_wallet")

  const targetBalance = parseFloat(formData.get("target_balance") as string)
  if (isNaN(targetBalance)) throw new Error("Nominal tidak valid")

  const res = await pool.query<{ balance: string; initial_balance: string }>(
    `SELECT balance::text, initial_balance::text FROM wallets WHERE id = $1 AND user_id = $2 AND is_active = true`,
    [id, userId],
  )
  if (!res.rows[0]) throw new Error("Dompet tidak ditemukan")

  const currentBalance  = parseFloat(res.rows[0].balance)
  const currentInitial  = parseFloat(res.rows[0].initial_balance)
  const newInitial      = currentInitial + (targetBalance - currentBalance)

  await pool.query(
    `UPDATE wallets SET initial_balance = $1, balance = $2, updated_at = now()
     WHERE id = $3 AND user_id = $4`,
    [newInitial, targetBalance, id, userId],
  )

  revalidatePath("/dompet")
  revalidatePath("/investasi")
}
