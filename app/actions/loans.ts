"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { pool } from "@/lib/db"
import { requirePermission } from "@/lib/licence"
import { calcNextInterest, calcLoanStatus, type InterestType } from "@/lib/loan"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error("Unauthenticated")
  return session
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

export async function createLoan(formData: FormData) {
  const session = await requireUser()
  const userId  = session.user.id
  await requirePermission(userId, "add_investment")

  const type            = formData.get("type") as string
  const name            = (formData.get("name") as string)?.trim()
  const description     = (formData.get("description") as string)?.trim() || null
  const principalAmount = parseFloat(formData.get("principal_amount") as string)
  const interestRate    = parseFloat(formData.get("interest_rate") as string) || 0
  const interestType    = (formData.get("interest_type") as string) || "FLAT"
  const startDate       = formData.get("start_date") as string
  const dueDate         = (formData.get("due_date") as string) || null
  const walletId        = formData.get("wallet_id") as string
  const isInitial       = formData.get("is_initial") === "true"

  if (!["PIUTANG", "HUTANG"].includes(type)) throw new Error("Tipe tidak valid")
  if (!name) throw new Error("Nama wajib diisi")
  if (isNaN(principalAmount) || principalAmount <= 0) throw new Error("Pokok tidak valid")
  if (interestRate < 0) throw new Error("Bunga tidak boleh negatif")
  if (!startDate) throw new Error("Tanggal mulai wajib diisi")
  if (!walletId) throw new Error("Dompet wajib dipilih")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const walletRes = await client.query<{ balance: string; user_id: string }>(
      `SELECT balance::text, user_id FROM wallets WHERE id=$1 AND is_active=true FOR UPDATE`,
      [walletId],
    )
    if (!walletRes.rows[0] || walletRes.rows[0].user_id !== userId) {
      throw new Error("Dompet tidak ditemukan")
    }

    if (!isInitial) {
      if (type === "PIUTANG") {
        const balance = parseFloat(walletRes.rows[0].balance)
        if (balance < principalAmount) {
          throw new Error(`Saldo tidak mencukupi. Tersedia: ${formatRupiah(balance)}`)
        }
        await client.query(`UPDATE wallets SET balance = balance - $1 WHERE id = $2`, [principalAmount, walletId])
      } else {
        await client.query(`UPDATE wallets SET balance = balance + $1 WHERE id = $2`, [principalAmount, walletId])
      }
    }

    const loanRes = await client.query<{ id: string }>(
      `INSERT INTO loans
         (user_id, type, name, description, principal_amount, interest_rate, interest_type,
          start_date, due_date, wallet_id, is_initial)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [userId, type, name, description, principalAmount, interestRate, interestType,
       startDate, dueDate || null, walletId, isInitial],
    )

    await client.query("COMMIT")
    const loanId = loanRes.rows[0].id
    redirect(`/pinjaman/${loanId}`)
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }
}

export async function updateLoan(id: string, formData: FormData) {
  const session = await requireUser()
  const userId  = session.user.id
  await requirePermission(userId, "change_investment")

  const name         = (formData.get("name") as string)?.trim()
  const description  = (formData.get("description") as string)?.trim() || null
  const dueDate      = (formData.get("due_date") as string) || null
  const interestRate = parseFloat(formData.get("interest_rate") as string) || 0
  const interestType = (formData.get("interest_type") as string) || "FLAT"

  if (!name) throw new Error("Nama wajib diisi")
  if (interestRate < 0) throw new Error("Bunga tidak boleh negatif")

  await pool.query(
    `UPDATE loans SET name=$1, description=$2, due_date=$3, interest_rate=$4, interest_type=$5, updated_at=now()
     WHERE id=$6 AND user_id=$7`,
    [name, description, dueDate || null, interestRate, interestType, id, userId],
  )

  revalidatePath(`/pinjaman/${id}`)
  revalidatePath("/pinjaman")
  redirect(`/pinjaman/${id}`)
}

export async function deleteLoan(id: string) {
  const session = await requireUser()
  const userId  = session.user.id
  await requirePermission(userId, "delete_investment")

  const paymentRes = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM loan_payments WHERE loan_id=$1`,
    [id],
  )
  if (parseInt(paymentRes.rows[0].cnt) > 0) {
    throw new Error("Hapus semua cicilan terlebih dahulu")
  }

  const loanRes = await pool.query<{
    type: string; principal_amount: string; wallet_id: string; is_initial: boolean
  }>(
    `SELECT type, principal_amount::text, wallet_id, is_initial FROM loans
     WHERE id=$1 AND user_id=$2 AND is_active=true`,
    [id, userId],
  )
  if (!loanRes.rows[0]) throw new Error("Pinjaman tidak ditemukan")
  const { type, principal_amount, wallet_id, is_initial } = loanRes.rows[0]
  const amount = parseFloat(principal_amount)

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    if (!is_initial) {
      if (type === "PIUTANG") {
        await client.query(`UPDATE wallets SET balance = balance + $1 WHERE id = $2`, [amount, wallet_id])
      } else {
        await client.query(`UPDATE wallets SET balance = balance - $1 WHERE id = $2`, [amount, wallet_id])
      }
    }
    await client.query(
      `UPDATE loans SET is_active=false, updated_at=now() WHERE id=$1 AND user_id=$2`,
      [id, userId],
    )
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }

  revalidatePath("/pinjaman")
  redirect("/pinjaman")
}

export async function addLoanPayment(loanId: string, formData: FormData) {
  const session = await requireUser()
  const userId  = session.user.id
  await requirePermission(userId, "add_investment")

  const principalPaid = parseFloat(formData.get("principal_paid") as string)
  const date          = formData.get("date") as string
  const notes         = (formData.get("notes") as string)?.trim() || null
  const isInitial     = formData.get("is_initial") === "true"

  if (isNaN(principalPaid) || principalPaid <= 0) throw new Error("Jumlah pokok tidak valid")
  if (!date) throw new Error("Tanggal wajib diisi")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const loanRes = await client.query<{
      type: string
      principal_amount: string
      interest_rate: string
      interest_type: string
      due_date: string | null
      wallet_id: string
      user_id: string
    }>(
      `SELECT type, principal_amount::text, interest_rate::text, interest_type,
              due_date::text, wallet_id, user_id
       FROM loans WHERE id=$1 AND is_active=true FOR UPDATE`,
      [loanId],
    )
    if (!loanRes.rows[0] || loanRes.rows[0].user_id !== userId) {
      throw new Error("Pinjaman tidak ditemukan")
    }
    const loan = loanRes.rows[0]

    const paidRes = await client.query<{ total_pp: string }>(
      `SELECT COALESCE(SUM(principal_paid),0)::text AS total_pp FROM loan_payments WHERE loan_id=$1`,
      [loanId],
    )
    const remainingPrincipal = Number(loan.principal_amount) - Number(paidRes.rows[0].total_pp)

    if (principalPaid > remainingPrincipal) {
      throw new Error(`Melebihi sisa pokok. Sisa: ${formatRupiah(remainingPrincipal)}`)
    }

    const interestPaid = calcNextInterest(
      Number(loan.principal_amount),
      Number(loan.interest_rate),
      loan.interest_type as InterestType,
      remainingPrincipal,
    )
    const totalPaid = principalPaid + interestPaid

    const walletRes = await client.query<{ balance: string; user_id: string }>(
      `SELECT balance::text, user_id FROM wallets WHERE id=$1 AND is_active=true FOR UPDATE`,
      [loan.wallet_id],
    )
    if (!walletRes.rows[0]) throw new Error("Dompet tidak ditemukan")

    if (!isInitial) {
      if (loan.type === "HUTANG") {
        const balance = parseFloat(walletRes.rows[0].balance)
        if (balance < totalPaid) {
          throw new Error(`Saldo tidak mencukupi. Tersedia: ${formatRupiah(balance)}`)
        }
        await client.query(`UPDATE wallets SET balance = balance - $1 WHERE id = $2`, [totalPaid, loan.wallet_id])
      } else {
        await client.query(`UPDATE wallets SET balance = balance + $1 WHERE id = $2`, [totalPaid, loan.wallet_id])
      }
    }

    await client.query(
      `INSERT INTO loan_payments (loan_id, principal_paid, interest_paid, total_paid, date, notes, is_initial)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [loanId, principalPaid, interestPaid, totalPaid, date, notes, isInitial],
    )

    const newRemaining = remainingPrincipal - principalPaid
    const newStatus = calcLoanStatus(loan.due_date, newRemaining)
    await client.query(
      `UPDATE loans SET status=$1, updated_at=now() WHERE id=$2`,
      [newStatus, loanId],
    )

    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }

  revalidatePath(`/pinjaman/${loanId}`)
  revalidatePath("/pinjaman")
  redirect(`/pinjaman/${loanId}`)
}

export async function deleteLoanPayment(paymentId: string, loanId: string) {
  const session = await requireUser()
  const userId  = session.user.id
  await requirePermission(userId, "delete_investment")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const payRes = await client.query<{
      principal_paid: string
      interest_paid: string
      total_paid: string
      is_initial: boolean
    }>(
      `SELECT lp.principal_paid::text, lp.interest_paid::text, lp.total_paid::text, lp.is_initial
       FROM loan_payments lp
       JOIN loans l ON l.id = lp.loan_id
       WHERE lp.id=$1 AND l.user_id=$2`,
      [paymentId, userId],
    )
    if (!payRes.rows[0]) throw new Error("Cicilan tidak ditemukan")
    const { total_paid, is_initial } = payRes.rows[0]

    const loanRes = await client.query<{ type: string; wallet_id: string; due_date: string | null; principal_amount: string }>(
      `SELECT type, wallet_id, due_date::text, principal_amount::text
       FROM loans WHERE id=$1 AND user_id=$2 FOR UPDATE`,
      [loanId, userId],
    )
    if (!loanRes.rows[0]) throw new Error("Pinjaman tidak ditemukan")
    const { type, wallet_id, due_date, principal_amount } = loanRes.rows[0]

    if (!is_initial) {
      if (type === "PIUTANG") {
        await client.query(`UPDATE wallets SET balance = balance - $1 WHERE id = $2`, [total_paid, wallet_id])
      } else {
        await client.query(`UPDATE wallets SET balance = balance + $1 WHERE id = $2`, [total_paid, wallet_id])
      }
    }

    await client.query(`DELETE FROM loan_payments WHERE id=$1`, [paymentId])

    const newPaidRes = await client.query<{ total_pp: string }>(
      `SELECT COALESCE(SUM(principal_paid),0)::text AS total_pp FROM loan_payments WHERE loan_id=$1`,
      [loanId],
    )
    const remaining = Number(principal_amount) - Number(newPaidRes.rows[0].total_pp)
    const newStatus = calcLoanStatus(due_date, remaining)
    await client.query(
      `UPDATE loans SET status=$1, updated_at=now() WHERE id=$2`,
      [newStatus, loanId],
    )

    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }

  revalidatePath(`/pinjaman/${loanId}`)
  revalidatePath("/pinjaman")
  redirect(`/pinjaman/${loanId}`)
}
