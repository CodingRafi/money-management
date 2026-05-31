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

export async function createInvestment(year: string, formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id

  const name       = (formData.get("name") as string)?.trim()
  const categoryId = formData.get("category_id") as string
  const walletId   = (formData.get("wallet_id") as string) || null
  const unit       = (formData.get("unit") as string)?.trim() || null
  const notes      = (formData.get("notes") as string)?.trim() || null

  if (!name || !categoryId) throw new Error("Data tidak valid")

  await pool.query(
    `INSERT INTO investments (user_id, category_id, name, wallet_id, unit, notes)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [userId, categoryId, name, walletId, unit, notes],
  )

  redirect(`/rekap/${year}?tab=investasi`)
}

export async function updateInvestment(id: string, year: string, formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id

  const name     = (formData.get("name") as string)?.trim()
  const walletId = (formData.get("wallet_id") as string) || null
  const unit     = (formData.get("unit") as string)?.trim() || null
  const notes    = (formData.get("notes") as string)?.trim() || null

  if (!name) throw new Error("Nama tidak boleh kosong")

  await pool.query(
    `UPDATE investments SET name=$1, wallet_id=$2, unit=$3, notes=$4, updated_at=now()
     WHERE id=$5 AND user_id=$6`,
    [name, walletId, unit, notes, id, userId],
  )

  redirect(`/rekap/${year}/investasi/${id}`)
}

export async function deleteInvestment(id: string, year: string) {
  const session = await requireUser()
  const userId = session.user.id

  const sellRes = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM investment_transactions
     WHERE investment_id=$1 AND type='SELL'`,
    [id],
  )
  if (parseInt(sellRes.rows[0].cnt) > 0) {
    throw new Error("Tidak bisa hapus aset yang sudah punya transaksi SELL")
  }

  await pool.query(
    `UPDATE investments SET is_active=false, updated_at=now() WHERE id=$1 AND user_id=$2`,
    [id, userId],
  )

  redirect(`/rekap/${year}?tab=investasi`)
}

export async function addInvestmentTransaction(investmentId: string, year: string, formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id

  const invRes = await pool.query(
    `SELECT id FROM investments WHERE id=$1 AND user_id=$2 AND is_active=true`,
    [investmentId, userId],
  )
  if (!invRes.rows[0]) throw new Error("Aset tidak ditemukan")

  const type         = formData.get("type") as string
  const quantity     = parseFloat(formData.get("quantity") as string)
  const pricePerUnit = parseFloat(formData.get("price_per_unit") as string)
  const date         = formData.get("date") as string
  const fromWalletId = (formData.get("from_wallet_id") as string) || null
  const toWalletId   = (formData.get("to_wallet_id") as string) || null
  const notes        = (formData.get("notes") as string)?.trim() || null

  if (!["BUY", "SELL"].includes(type)) throw new Error("Tipe tidak valid")
  if (isNaN(quantity) || quantity <= 0) throw new Error("Quantity tidak valid")
  if (isNaN(pricePerUnit) || pricePerUnit <= 0) throw new Error("Harga tidak valid")
  if (!date) throw new Error("Tanggal wajib diisi")
  if (type === "BUY" && !fromWalletId) throw new Error("Dompet asal wajib diisi untuk BUY")
  if (type === "SELL" && !toWalletId) throw new Error("Dompet tujuan wajib diisi untuk SELL")

  if (type === "SELL") {
    const qtyRes = await pool.query<{ total_bought: string; total_sold: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN type='BUY'  THEN quantity ELSE 0 END),0)::text AS total_bought,
         COALESCE(SUM(CASE WHEN type='SELL' THEN quantity ELSE 0 END),0)::text AS total_sold
       FROM investment_transactions WHERE investment_id=$1`,
      [investmentId],
    )
    const remaining = Number(qtyRes.rows[0].total_bought) - Number(qtyRes.rows[0].total_sold)
    if (quantity > remaining) {
      throw new Error(`Quantity melebihi stok tersedia (${remaining})`)
    }
  }

  const totalAmount = quantity * pricePerUnit
  const txYear      = new Date(date).getFullYear()

  await pool.query(
    `INSERT INTO investment_transactions
     (investment_id, type, quantity, price_per_unit, total_amount, from_wallet_id, to_wallet_id, date, year, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [investmentId, type, quantity, pricePerUnit, totalAmount, fromWalletId, toWalletId, date, txYear, notes],
  )

  redirect(`/rekap/${year}/investasi/${investmentId}`)
}

export async function deleteInvestmentTransaction(id: string, investmentId: string, year: string) {
  const session = await requireUser()
  const userId = session.user.id

  const res = await pool.query(
    `SELECT it.id FROM investment_transactions it
     JOIN investments i ON i.id = it.investment_id
     WHERE it.id=$1 AND i.user_id=$2`,
    [id, userId],
  )
  if (!res.rows[0]) throw new Error("Transaksi tidak ditemukan")

  await pool.query(`DELETE FROM investment_transactions WHERE id=$1`, [id])

  revalidatePath(`/rekap/${year}/investasi/${investmentId}`)
}
