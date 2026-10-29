"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { requireWritableUserId } from "@/lib/scope"
import crypto from "crypto"

function uuid() { return crypto.randomUUID() }

export async function createWallet(formData: FormData) {
  const userId     = await requireWritableUserId()
  const name       = (formData.get("name") as string)?.trim()
  const categoryId = formData.get("category_id") as string
  const color      = (formData.get("color") as string)?.trim() || null

  if (!name)       throw new Error("Nama dompet tidak boleh kosong")
  if (!categoryId) throw new Error("Kategori wajib dipilih")

  const orderRow = await db.prepare(
    "SELECT COALESCE(MAX(sort_order), 0) + 1 AS max FROM wallets WHERE user_id = ?"
  ).get(userId) as { max: number }

  await db.prepare(
    "INSERT INTO wallets (id, user_id, category_id, name, is_liquid, color, sort_order) VALUES (?, ?, ?, ?, 1, ?, ?)"
  ).run(uuid(), userId, categoryId, name, color, orderRow.max)

  redirect("/dompet")
}

export async function updateWallet(id: string, formData: FormData) {
  const userId = await requireWritableUserId()
  const name   = (formData.get("name") as string)?.trim()
  const color  = (formData.get("color") as string)?.trim() || null

  if (!name) throw new Error("Nama dompet tidak boleh kosong")

  await db.prepare(
    "UPDATE wallets SET name = ?, is_liquid = 1, color = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ? AND is_active = 1"
  ).run(name, color, id, userId)

  redirect("/dompet")
}

export async function deleteWallet(id: string) {
  const userId = await requireWritableUserId()
  await db.prepare(
    "UPDATE wallets SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(id, userId)
  revalidatePath("/dompet")
}
