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

export async function addTransfer(formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id

  const fromWalletId = formData.get("from_wallet_id") as string
  const toWalletId   = formData.get("to_wallet_id") as string
  const amount       = parseFloat(formData.get("amount") as string)
  const date         = formData.get("date") as string
  const notes        = (formData.get("notes") as string)?.trim() || null
  const month        = parseInt(formData.get("month") as string)
  const year         = parseInt(formData.get("year") as string)

  if (!fromWalletId || !toWalletId || !date) throw new Error("Data tidak valid")
  if (isNaN(amount) || amount <= 0) throw new Error("Jumlah transfer harus lebih dari 0")
  if (fromWalletId === toWalletId) throw new Error("Dompet asal dan tujuan tidak boleh sama")

  const walletsRes = await pool.query<{ id: string; is_liquid: boolean }>(
    `SELECT id, is_liquid FROM wallets
     WHERE id = ANY($1) AND user_id = $2 AND is_active = true`,
    [[fromWalletId, toWalletId], userId],
  )

  if (walletsRes.rows.length !== 2) throw new Error("Dompet tidak valid")

  const fromWallet = walletsRes.rows.find((w) => w.id === fromWalletId)
  const toWallet   = walletsRes.rows.find((w) => w.id === toWalletId)

  if (!fromWallet?.is_liquid) throw new Error("Dompet asal harus berupa dompet liquid")
  if (!toWallet?.is_liquid)   throw new Error("Dompet tujuan harus berupa dompet liquid")

  await pool.query(
    `INSERT INTO transfers (user_id, from_wallet_id, to_wallet_id, amount, date, month, year, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [userId, fromWalletId, toWalletId, amount, date, month, year, notes],
  )

  redirect(`/rekap/${year}?bulan=${month}&tab=transfer`)
}

export async function deleteTransfer(id: string, year: string, month: string) {
  const session = await requireUser()
  await pool.query(
    `DELETE FROM transfers WHERE id=$1 AND user_id=$2`,
    [id, session.user.id],
  )
  revalidatePath(`/rekap/${year}`)
}
