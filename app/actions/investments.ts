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

// ── Asset CRUD ────────────────────────────────────────────────────────────────

export async function createInvestment(year: string, formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "add_investment")

  const name       = (formData.get("name") as string)?.trim()
  const categoryId = formData.get("category_id") as string
  const walletId   = (formData.get("wallet_id") as string) || null
  const isLiquid   = formData.get("is_liquid") === "true"
  const notes      = (formData.get("notes") as string)?.trim() || null

  if (!name || !categoryId) throw new Error("Data tidak valid")

  await pool.query(
    `INSERT INTO investments (user_id, category_id, name, wallet_id, is_liquid, notes)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [userId, categoryId, name, walletId, isLiquid, notes],
  )

  redirect(`/rekap/${year}?tab=investasi`)
}

export async function createInvestmentDirect(formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "add_investment")

  const name       = (formData.get("name") as string)?.trim()
  const categoryId = formData.get("category_id") as string
  const walletId   = (formData.get("wallet_id") as string) || null
  const isLiquid   = formData.get("is_liquid") === "true"
  const notes      = (formData.get("notes") as string)?.trim() || null

  if (!name || !categoryId) throw new Error("Data tidak valid")

  const res = await pool.query<{ id: string }>(
    `INSERT INTO investments (user_id, category_id, name, wallet_id, is_liquid, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [userId, categoryId, name, walletId, isLiquid, notes],
  )

  redirect(`/investasi/aset/${res.rows[0].id}`)
}

export async function updateInvestment(id: string, year: string, formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "change_investment")

  const name     = (formData.get("name") as string)?.trim()
  const walletId = (formData.get("wallet_id") as string) || null
  const isLiquid = formData.get("is_liquid") === "true"
  const notes    = (formData.get("notes") as string)?.trim() || null

  if (!name) throw new Error("Nama tidak boleh kosong")

  await pool.query(
    `UPDATE investments SET name=$1, wallet_id=$2, is_liquid=$3, notes=$4, updated_at=now()
     WHERE id=$5 AND user_id=$6`,
    [name, walletId, isLiquid, notes, id, userId],
  )

  redirect(`/rekap/${year}/investasi/${id}`)
}

export async function updateInvestmentDirect(id: string, formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "change_investment")

  const name     = (formData.get("name") as string)?.trim()
  const walletId = (formData.get("wallet_id") as string) || null
  const isLiquid = formData.get("is_liquid") === "true"
  const notes    = (formData.get("notes") as string)?.trim() || null

  if (!name) throw new Error("Nama tidak boleh kosong")

  await pool.query(
    `UPDATE investments SET name=$1, wallet_id=$2, is_liquid=$3, notes=$4, updated_at=now()
     WHERE id=$5 AND user_id=$6`,
    [name, walletId, isLiquid, notes, id, userId],
  )

  redirect(`/investasi/aset/${id}`)
}

export async function deleteInvestment(id: string, year: string) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "delete_investment")

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

export async function deleteInvestmentDirect(id: string) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "delete_investment")

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

  redirect("/investasi")
}

// ── Transaction helpers ───────────────────────────────────────────────────────

async function execAddInvestmentTransaction(
  investmentId: string,
  userId: string,
  formData: FormData,
) {
  const invRes = await pool.query(
    `SELECT id FROM investments WHERE id=$1 AND user_id=$2 AND is_active=true`,
    [investmentId, userId],
  )
  if (!invRes.rows[0]) throw new Error("Aset tidak ditemukan")

  const type         = formData.get("type") as string
  const goalId       = (formData.get("goal_id") as string) || null
  const quantity     = (formData.get("quantity") as string)?.trim() || "1"
  const numericQty   = parseFloat(quantity) || 1
  const totalAmount  = parseFloat(formData.get("total_amount") as string)
  const pricePerUnit = totalAmount / numericQty
  const date         = formData.get("date") as string
  const fromWalletId = (formData.get("from_wallet_id") as string) || null
  const toWalletId   = (formData.get("to_wallet_id") as string) || null
  const notes        = (formData.get("notes") as string)?.trim() || null
  const isInitial    = formData.get("is_initial") === "true"

  if (!["BUY", "SELL"].includes(type)) throw new Error("Tipe tidak valid")
  if (isNaN(totalAmount) || totalAmount <= 0) throw new Error("Harga transaksi tidak valid")
  if (!date) throw new Error("Tanggal wajib diisi")
  if (type === "BUY"  && !fromWalletId) throw new Error("Dompet asal wajib diisi untuk BUY")
  if (type === "SELL" && !toWalletId)   throw new Error("Dompet tujuan wajib diisi untuk SELL")
  if (type === "BUY"  && !goalId)       throw new Error("Kantong wajib dipilih untuk transaksi BUY")

  if (goalId) {
    const goalRes = await pool.query(
      `SELECT id FROM investment_goals WHERE id=$1 AND user_id=$2 AND is_active=true`,
      [goalId, userId],
    )
    if (!goalRes.rows[0]) throw new Error("Kantong tidak ditemukan")
  }

  const txYear = new Date(date).getFullYear()

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    if (type === "BUY") {
      const walletRes = await client.query<{ balance: string; user_id: string }>(
        `SELECT balance::text, user_id FROM wallets WHERE id=$1 AND is_active=true FOR UPDATE`,
        [fromWalletId],
      )
      if (!walletRes.rows[0] || walletRes.rows[0].user_id !== userId) {
        throw new Error("Dompet tidak ditemukan")
      }
      if (!isInitial) {
        const walletBalance = parseFloat(walletRes.rows[0].balance)
        if (walletBalance < totalAmount) {
          throw new Error(`Saldo tidak mencukupi. Tersedia: ${formatRupiah(walletBalance)}`)
        }
        await client.query(
          `UPDATE wallets SET balance = balance - $1 WHERE id = $2`,
          [totalAmount, fromWalletId],
        )
      }
    }

    if (type === "SELL") {

      const walletRes = await client.query<{ user_id: string }>(
        `SELECT user_id FROM wallets WHERE id=$1 AND is_active=true`,
        [toWalletId],
      )
      if (!walletRes.rows[0] || walletRes.rows[0].user_id !== userId) {
        throw new Error("Dompet tujuan tidak ditemukan")
      }
      if (!isInitial) {
        await client.query(
          `UPDATE wallets SET balance = balance + $1 WHERE id = $2`,
          [totalAmount, toWalletId],
        )
      }
    }

    await client.query(
      `INSERT INTO investment_transactions
       (investment_id, goal_id, type, quantity, price_per_unit, total_amount, from_wallet_id, to_wallet_id, date, year, notes, is_initial)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [investmentId, goalId, type, quantity, pricePerUnit, totalAmount, fromWalletId, toWalletId, date, txYear, notes, isInitial],
    )

    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }
}

async function execDeleteInvestmentTransaction(id: string, userId: string) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const res = await client.query<{
      type: string
      total_amount: string
      from_wallet_id: string | null
      to_wallet_id: string | null
      is_initial: boolean
    }>(
      `SELECT it.type, it.total_amount::text, it.from_wallet_id, it.to_wallet_id, it.is_initial
       FROM investment_transactions it
       JOIN investments i ON i.id = it.investment_id
       WHERE it.id=$1 AND i.user_id=$2`,
      [id, userId],
    )
    if (!res.rows[0]) throw new Error("Transaksi tidak ditemukan")

    const { type, total_amount, from_wallet_id, to_wallet_id, is_initial: isInitial } = res.rows[0]
    const amount = parseFloat(total_amount)

    if (!isInitial) {
      if (type === "BUY" && from_wallet_id) {
        await client.query(`UPDATE wallets SET balance = balance + $1 WHERE id = $2`, [amount, from_wallet_id])
      }
      if (type === "SELL" && to_wallet_id) {
        await client.query(`UPDATE wallets SET balance = balance - $1 WHERE id = $2`, [amount, to_wallet_id])
      }
    }

    await client.query(`DELETE FROM investment_transactions WHERE id=$1`, [id])
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }
}

// ── Transaction actions ───────────────────────────────────────────────────────

export async function addInvestmentTransaction(investmentId: string, year: string, formData: FormData) {
  const session = await requireUser()
  await requirePermission(session.user.id, "add_investment")
  await execAddInvestmentTransaction(investmentId, session.user.id, formData)
  revalidatePath("/dompet")
  revalidatePath("/investasi")
  redirect(`/rekap/${year}/investasi/${investmentId}`)
}

export async function addInvestmentTransactionDirect(investmentId: string, formData: FormData) {
  const session = await requireUser()
  await requirePermission(session.user.id, "add_investment")
  await execAddInvestmentTransaction(investmentId, session.user.id, formData)
  revalidatePath("/dompet")
  revalidatePath("/investasi")
  redirect(`/investasi/aset/${investmentId}`)
}

export async function deleteInvestmentTransaction(id: string, investmentId: string, year: string) {
  const session = await requireUser()
  await requirePermission(session.user.id, "delete_investment")
  await execDeleteInvestmentTransaction(id, session.user.id)
  revalidatePath(`/rekap/${year}/investasi/${investmentId}`)
  revalidatePath("/dompet")
  revalidatePath("/investasi")
}

export async function deleteInvestmentTransactionDirect(id: string, investmentId: string) {
  const session = await requireUser()
  await requirePermission(session.user.id, "delete_investment")
  await execDeleteInvestmentTransaction(id, session.user.id)
  revalidatePath(`/investasi/aset/${investmentId}`)
  revalidatePath("/dompet")
  revalidatePath("/investasi")
  redirect(`/investasi/aset/${investmentId}`)
}
