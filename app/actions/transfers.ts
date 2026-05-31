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

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

export async function addTransfer(formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "add_transaction")

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

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const walletsRes = await client.query<{ id: string; is_liquid: boolean; balance: string }>(
      `SELECT id, is_liquid, balance::text FROM wallets
       WHERE id = ANY($1) AND user_id = $2 AND is_active = true FOR UPDATE`,
      [[fromWalletId, toWalletId], userId],
    )

    if (walletsRes.rows.length !== 2) throw new Error("Dompet tidak valid")
    const fromWallet = walletsRes.rows.find((w) => w.id === fromWalletId)!
    const toWallet   = walletsRes.rows.find((w) => w.id === toWalletId)!

    if (!fromWallet.is_liquid) throw new Error("Dompet asal harus berupa dompet liquid")
    if (!toWallet.is_liquid)   throw new Error("Dompet tujuan harus berupa dompet liquid")

    const fromBalance = parseFloat(fromWallet.balance)
    if (fromBalance < amount) {
      throw new Error(`Saldo tidak mencukupi. Tersedia: ${formatRupiah(fromBalance)}`)
    }

    await client.query(
      `INSERT INTO transfers (user_id, from_wallet_id, to_wallet_id, amount, date, month, year, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, fromWalletId, toWalletId, amount, date, month, year, notes],
    )
    await client.query(`UPDATE wallets SET balance = balance - $1 WHERE id = $2`, [amount, fromWalletId])
    await client.query(`UPDATE wallets SET balance = balance + $1 WHERE id = $2`, [amount, toWalletId])

    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }

  redirect(`/rekap/${year}?bulan=${month}&tab=transfer`)
}

export async function deleteTransfer(id: string, year: string, month: string) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "delete_transaction")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const res = await client.query<{ from_wallet_id: string; to_wallet_id: string; amount: string }>(
      `SELECT from_wallet_id, to_wallet_id, amount::text FROM transfers WHERE id=$1 AND user_id=$2`,
      [id, userId],
    )
    if (!res.rows[0]) throw new Error("Transfer tidak ditemukan")

    const { from_wallet_id, to_wallet_id, amount: amountStr } = res.rows[0]
    const amount = parseFloat(amountStr)

    await client.query(`DELETE FROM transfers WHERE id=$1 AND user_id=$2`, [id, userId])
    await client.query(`UPDATE wallets SET balance = balance + $1 WHERE id = $2`, [amount, from_wallet_id])
    await client.query(`UPDATE wallets SET balance = balance - $1 WHERE id = $2`, [amount, to_wallet_id])

    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }

  revalidatePath(`/rekap/${year}`)
  revalidatePath("/dompet")
}
