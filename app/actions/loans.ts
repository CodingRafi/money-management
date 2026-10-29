"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { requireUserIdAction } from "@/lib/session"
import { calcNextInterest, calcLoanStatus, type InterestType } from "@/lib/loan"
import crypto from "crypto"

function uuid() { return crypto.randomUUID() }
function formatRupiah(n: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n) }

export async function createLoan(formData: FormData) {
  const userId          = await requireUserIdAction()
  const type               = formData.get("type") as string
  const name               = (formData.get("name") as string)?.trim()
  const description        = (formData.get("description") as string)?.trim() || null
  const principalAmount    = parseFloat(formData.get("principal_amount") as string)
  const interestRate       = parseFloat(formData.get("interest_rate") as string) || 0
  const interestType       = (formData.get("interest_type") as string) || "FLAT"
  const startDate          = formData.get("start_date") as string
  const dueDate            = (formData.get("due_date") as string) || null
  const walletId           = formData.get("wallet_id") as string
  const isInitial          = formData.get("is_initial") === "true" ? 1 : 0
  const rawLikelihood      = (formData.get("payment_likelihood") as string) || null
  const paymentLikelihood  = type === "PIUTANG" && rawLikelihood ? rawLikelihood : null

  if (!["PIUTANG", "HUTANG"].includes(type)) throw new Error("Tipe tidak valid")
  if (!name)                                 throw new Error("Nama wajib diisi")
  if (isNaN(principalAmount) || principalAmount <= 0) throw new Error("Pokok tidak valid")
  if (interestRate < 0)                      throw new Error("Bunga tidak boleh negatif")
  if (!startDate)                            throw new Error("Tanggal mulai wajib diisi")
  if (!walletId)                             throw new Error("Dompet wajib dipilih")

  let loanId!: string
  await db.transaction(async () => {
    const wallet = await db.prepare(
      "SELECT balance, user_id FROM wallets WHERE id=? AND is_active=1"
    ).get(walletId) as { balance: number; user_id: string } | undefined
    if (!wallet || wallet.user_id !== userId) throw new Error("Dompet tidak ditemukan")

    if (!isInitial) {
      if (type === "PIUTANG") {
        if (wallet.balance < principalAmount) throw new Error(`Saldo tidak mencukupi. Tersedia: ${formatRupiah(wallet.balance)}`)
        await db.prepare("UPDATE wallets SET balance = balance - ? WHERE id = ?").run(principalAmount, walletId)
      } else {
        await db.prepare("UPDATE wallets SET balance = balance + ? WHERE id = ?").run(principalAmount, walletId)
      }
    }

    loanId = uuid()
    await db.prepare(
      "INSERT INTO loans (id, user_id, type, name, description, principal_amount, interest_rate, interest_type, start_date, due_date, wallet_id, is_initial, payment_likelihood) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(loanId, userId, type, name, description, principalAmount, interestRate, interestType, startDate, dueDate, walletId, isInitial, paymentLikelihood)
  })

  redirect(`/pinjaman/${loanId}`)
}

export async function updateLoan(id: string, formData: FormData) {
  const userId            = await requireUserIdAction()
  const name              = (formData.get("name") as string)?.trim()
  const description       = (formData.get("description") as string)?.trim() || null
  const dueDate           = (formData.get("due_date") as string) || null
  const interestRate      = parseFloat(formData.get("interest_rate") as string) || 0
  const interestType      = (formData.get("interest_type") as string) || "FLAT"
  const rawLikelihood     = (formData.get("payment_likelihood") as string) || null
  const paymentLikelihood = rawLikelihood || null

  if (!name)            throw new Error("Nama wajib diisi")
  if (interestRate < 0) throw new Error("Bunga tidak boleh negatif")

  const loan = await db.prepare("SELECT type FROM loans WHERE id=? AND user_id=?").get(id, userId) as { type: string } | undefined
  const finalLikelihood = loan?.type === "PIUTANG" ? paymentLikelihood : null

  await db.prepare(
    "UPDATE loans SET name=?, description=?, due_date=?, interest_rate=?, interest_type=?, payment_likelihood=?, updated_at=datetime('now') WHERE id=? AND user_id=?"
  ).run(name, description, dueDate, interestRate, interestType, finalLikelihood, id, userId)

  revalidatePath(`/pinjaman/${id}`)
  revalidatePath("/pinjaman")
  redirect(`/pinjaman/${id}`)
}

export async function deleteLoan(id: string) {
  const userId = await requireUserIdAction()

  const payRow = await db.prepare(
    "SELECT COUNT(*) AS cnt FROM loan_payments WHERE loan_id=?"
  ).get(id) as { cnt: number }
  if (payRow.cnt > 0) throw new Error("Hapus semua cicilan terlebih dahulu")

  const loan = await db.prepare(
    "SELECT type, principal_amount, wallet_id, is_initial FROM loans WHERE id=? AND user_id=? AND is_active=1"
  ).get(id, userId) as { type: string; principal_amount: number; wallet_id: string; is_initial: number } | undefined
  if (!loan) throw new Error("Pinjaman tidak ditemukan")

  await db.transaction(async () => {
    if (!loan.is_initial) {
      if (loan.type === "PIUTANG") {
        await db.prepare("UPDATE wallets SET balance = balance + ? WHERE id = ?").run(loan.principal_amount, loan.wallet_id)
      } else {
        await db.prepare("UPDATE wallets SET balance = balance - ? WHERE id = ?").run(loan.principal_amount, loan.wallet_id)
      }
    }
    await db.prepare(
      "UPDATE loans SET is_active=0, updated_at=datetime('now') WHERE id=? AND user_id=?"
    ).run(id, userId)
  })

  revalidatePath("/pinjaman")
  redirect("/pinjaman")
}

export async function addLoanPayment(loanId: string, formData: FormData) {
  const userId        = await requireUserIdAction()
  const principalPaid = parseFloat(formData.get("principal_paid") as string)
  const date          = formData.get("date") as string
  const notes         = (formData.get("notes") as string)?.trim() || null
  const isInitial     = formData.get("is_initial") === "true" ? 1 : 0

  if (isNaN(principalPaid) || principalPaid <= 0) throw new Error("Jumlah pokok tidak valid")
  if (!date)                                      throw new Error("Tanggal wajib diisi")

  await db.transaction(async () => {
    const loan = await db.prepare(
      "SELECT type, principal_amount, interest_rate, interest_type, due_date, wallet_id, user_id FROM loans WHERE id=? AND is_active=1"
    ).get(loanId) as { type: string; principal_amount: number; interest_rate: number; interest_type: string; due_date: string | null; wallet_id: string; user_id: string } | undefined
    if (!loan || loan.user_id !== userId) throw new Error("Pinjaman tidak ditemukan")

    const paidRow = await db.prepare(
      "SELECT COALESCE(SUM(principal_paid), 0) AS total_pp FROM loan_payments WHERE loan_id=?"
    ).get(loanId) as { total_pp: number }
    const remainingPrincipal = loan.principal_amount - paidRow.total_pp

    if (principalPaid > remainingPrincipal) {
      throw new Error(`Melebihi sisa pokok. Sisa: ${formatRupiah(remainingPrincipal)}`)
    }

    const interestPaid = calcNextInterest(loan.principal_amount, loan.interest_rate, loan.interest_type as InterestType, remainingPrincipal)
    const totalPaid    = principalPaid + interestPaid

    const wallet = await db.prepare("SELECT balance FROM wallets WHERE id=? AND is_active=1").get(loan.wallet_id) as { balance: number } | undefined
    if (!wallet) throw new Error("Dompet tidak ditemukan")

    if (!isInitial) {
      if (loan.type === "HUTANG") {
        if (wallet.balance < totalPaid) throw new Error(`Saldo tidak mencukupi. Tersedia: ${formatRupiah(wallet.balance)}`)
        await db.prepare("UPDATE wallets SET balance = balance - ? WHERE id = ?").run(totalPaid, loan.wallet_id)
      } else {
        await db.prepare("UPDATE wallets SET balance = balance + ? WHERE id = ?").run(totalPaid, loan.wallet_id)
      }
    }

    await db.prepare(
      "INSERT INTO loan_payments (id, loan_id, principal_paid, interest_paid, total_paid, date, notes, is_initial) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(uuid(), loanId, principalPaid, interestPaid, totalPaid, date, notes, isInitial)

    const newRemaining = remainingPrincipal - principalPaid
    const newStatus    = calcLoanStatus(loan.due_date, newRemaining)
    await db.prepare("UPDATE loans SET status=?, updated_at=datetime('now') WHERE id=?").run(newStatus, loanId)
  })

  revalidatePath(`/pinjaman/${loanId}`)
  revalidatePath("/pinjaman")
  redirect(`/pinjaman/${loanId}`)
}

export async function deleteLoanPayment(paymentId: string, loanId: string) {
  const userId = await requireUserIdAction()

  await db.transaction(async () => {
    const pay = await db.prepare(`
      SELECT lp.total_paid, lp.is_initial
      FROM loan_payments lp JOIN loans l ON l.id = lp.loan_id
      WHERE lp.id=? AND l.user_id=?
    `).get(paymentId, userId) as { total_paid: number; is_initial: number } | undefined
    if (!pay) throw new Error("Cicilan tidak ditemukan")

    const loan = await db.prepare(
      "SELECT type, wallet_id, due_date, principal_amount FROM loans WHERE id=? AND user_id=?"
    ).get(loanId, userId) as { type: string; wallet_id: string; due_date: string | null; principal_amount: number } | undefined
    if (!loan) throw new Error("Pinjaman tidak ditemukan")

    if (!pay.is_initial) {
      if (loan.type === "PIUTANG") {
        await db.prepare("UPDATE wallets SET balance = balance - ? WHERE id = ?").run(pay.total_paid, loan.wallet_id)
      } else {
        await db.prepare("UPDATE wallets SET balance = balance + ? WHERE id = ?").run(pay.total_paid, loan.wallet_id)
      }
    }

    await db.prepare("DELETE FROM loan_payments WHERE id=?").run(paymentId)

    const newPaidRow = await db.prepare(
      "SELECT COALESCE(SUM(principal_paid), 0) AS total_pp FROM loan_payments WHERE loan_id=?"
    ).get(loanId) as { total_pp: number }
    const remaining = loan.principal_amount - newPaidRow.total_pp
    const newStatus = calcLoanStatus(loan.due_date, remaining)
    await db.prepare("UPDATE loans SET status=?, updated_at=datetime('now') WHERE id=?").run(newStatus, loanId)
  })

  revalidatePath(`/pinjaman/${loanId}`)
  revalidatePath("/pinjaman")
  redirect(`/pinjaman/${loanId}`)
}
