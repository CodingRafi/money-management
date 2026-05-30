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

export async function createWallet(formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id

  const name = (formData.get("name") as string)?.trim()
  const categoryId = formData.get("category_id") as string
  const isLiquid = formData.get("is_liquid") === "true"
  const color = (formData.get("color") as string)?.trim() || null

  if (!name) throw new Error("Nama dompet tidak boleh kosong")
  if (!categoryId) throw new Error("Kategori wajib dipilih")

  const orderRes = await pool.query<{ max: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS max FROM wallets WHERE user_id = $1`,
    [userId],
  )

  await pool.query(
    `INSERT INTO wallets (user_id, category_id, name, is_liquid, color, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, categoryId, name, isLiquid, color, orderRes.rows[0].max],
  )

  redirect("/dompet")
}

export async function updateWallet(id: string, formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id

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

  await pool.query(
    `UPDATE wallets SET is_active = false, updated_at = now()
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  )

  revalidatePath("/dompet")
}
