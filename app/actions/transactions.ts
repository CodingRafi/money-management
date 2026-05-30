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

// ── Delete entire year's data ────────────────────────────────────────────────

export async function deleteYearData(year: string) {
  const session = await requireUser()
  const userId = session.user.id
  const y = parseInt(year)

  await Promise.all([
    pool.query(`DELETE FROM incomes    WHERE user_id = $1 AND year = $2`, [userId, y]),
    pool.query(`DELETE FROM expenses   WHERE user_id = $1 AND year = $2`, [userId, y]),
    pool.query(`DELETE FROM loans_given WHERE user_id = $1 AND year = $2`, [userId, y]),
    pool.query(`DELETE FROM loans_taken WHERE user_id = $1 AND year = $2`, [userId, y]),
  ])

  revalidatePath("/rekap")
}

// ── Income ──────────────────────────────────────────────────────────────────

export async function addIncome(formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id

  const date       = formData.get("date") as string
  const name       = (formData.get("name") as string)?.trim()
  const categoryId = (formData.get("category_id") as string) || null
  const walletId   = (formData.get("wallet_id") as string) || null
  const amount     = parseFloat(formData.get("amount") as string)
  const month      = parseInt(formData.get("month") as string)
  const year       = parseInt(formData.get("year") as string)

  if (!date || !name || isNaN(amount) || amount <= 0) throw new Error("Data tidak valid")

  await pool.query(
    `INSERT INTO incomes (user_id, date, name, category_id, wallet_id, amount, month, year)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, date, name, categoryId, walletId, amount, month, year],
  )

  redirect(`/rekap/${year}?bulan=${month}&tab=pendapatan`)
}

export async function deleteIncome(id: string, year: string, month: string) {
  const session = await requireUser()
  await pool.query(`DELETE FROM incomes WHERE id = $1 AND user_id = $2`, [id, session.user.id])
  revalidatePath(`/rekap/${year}`)
  revalidatePath("/rekap")
}

// ── Expense ─────────────────────────────────────────────────────────────────

export async function addExpense(formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id

  const date       = formData.get("date") as string
  const name       = (formData.get("name") as string)?.trim()
  const walletId   = (formData.get("wallet_id") as string) || null
  const categoryId = (formData.get("category_id") as string) || null
  const needsType  = formData.get("needs_type") as string
  const amount     = parseFloat(formData.get("amount") as string)
  const month      = parseInt(formData.get("month") as string)
  const year       = parseInt(formData.get("year") as string)

  if (!date || !name || !needsType || isNaN(amount) || amount <= 0) throw new Error("Data tidak valid")

  await pool.query(
    `INSERT INTO expenses (user_id, date, name, wallet_id, category_id, needs_type, amount, month, year)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [userId, date, name, walletId, categoryId, needsType, amount, month, year],
  )

  redirect(`/rekap/${year}?bulan=${month}&tab=pengeluaran`)
}

export async function deleteExpense(id: string, year: string, month: string) {
  const session = await requireUser()
  await pool.query(`DELETE FROM expenses WHERE id = $1 AND user_id = $2`, [id, session.user.id])
  revalidatePath(`/rekap/${year}`)
  revalidatePath("/rekap")
}

// ── Loan Given — Dipinjam ────────────────────────────────────────────────────

export async function addLoanGiven(formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id

  const borrower = (formData.get("borrower") as string)?.trim()
  const amount   = parseFloat(formData.get("amount") as string)
  const status   = formData.get("status") as string
  const notes    = (formData.get("notes") as string)?.trim() || null
  const month    = parseInt(formData.get("month") as string)
  const year     = parseInt(formData.get("year") as string)

  if (!borrower || isNaN(amount) || amount <= 0 || !status) throw new Error("Data tidak valid")

  await pool.query(
    `INSERT INTO loans_given (user_id, borrower, amount, status, notes, month, year)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, borrower, amount, status, notes, month, year],
  )

  redirect(`/rekap/${year}?bulan=${month}&tab=dipinjam`)
}

export async function deleteLoanGiven(id: string, year: string, month: string) {
  const session = await requireUser()
  await pool.query(`DELETE FROM loans_given WHERE id = $1 AND user_id = $2`, [id, session.user.id])
  revalidatePath(`/rekap/${year}`)
}

// ── Loan Taken — Hutang ──────────────────────────────────────────────────────

export async function addLoanTaken(formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id

  const lender = (formData.get("lender") as string)?.trim()
  const amount = parseFloat(formData.get("amount") as string)
  const notes  = (formData.get("notes") as string)?.trim() || null
  const month  = parseInt(formData.get("month") as string)
  const year   = parseInt(formData.get("year") as string)

  if (!lender || isNaN(amount) || amount <= 0) throw new Error("Data tidak valid")

  await pool.query(
    `INSERT INTO loans_taken (user_id, lender, amount, notes, month, year)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, lender, amount, notes, month, year],
  )

  redirect(`/rekap/${year}?bulan=${month}&tab=hutang`)
}

export async function deleteLoanTaken(id: string, year: string, month: string) {
  const session = await requireUser()
  await pool.query(`DELETE FROM loans_taken WHERE id = $1 AND user_id = $2`, [id, session.user.id])
  revalidatePath(`/rekap/${year}`)
}

// ── Update actions ───────────────────────────────────────────────────────────

export async function updateIncome(id: string, formData: FormData) {
  const session = await requireUser()
  const userId     = session.user.id
  const date       = formData.get("date") as string
  const name       = (formData.get("name") as string)?.trim()
  const categoryId = (formData.get("category_id") as string) || null
  const walletId   = (formData.get("wallet_id") as string) || null
  const amount     = parseFloat(formData.get("amount") as string)
  const month      = parseInt(formData.get("month") as string)
  const year       = parseInt(formData.get("year") as string)

  if (!date || !name || isNaN(amount) || amount <= 0) throw new Error("Data tidak valid")
  await pool.query(
    `UPDATE incomes SET date=$1, name=$2, category_id=$3, wallet_id=$4, amount=$5
     WHERE id=$6 AND user_id=$7`,
    [date, name, categoryId, walletId, amount, id, userId],
  )
  redirect(`/rekap/${year}?bulan=${month}&tab=pendapatan`)
}

export async function updateExpense(id: string, formData: FormData) {
  const session = await requireUser()
  const userId     = session.user.id
  const date       = formData.get("date") as string
  const name       = (formData.get("name") as string)?.trim()
  const walletId   = (formData.get("wallet_id") as string) || null
  const categoryId = (formData.get("category_id") as string) || null
  const needsType  = formData.get("needs_type") as string
  const amount     = parseFloat(formData.get("amount") as string)
  const month      = parseInt(formData.get("month") as string)
  const year       = parseInt(formData.get("year") as string)

  if (!date || !name || !needsType || isNaN(amount) || amount <= 0) throw new Error("Data tidak valid")
  await pool.query(
    `UPDATE expenses SET date=$1, name=$2, wallet_id=$3, category_id=$4, needs_type=$5, amount=$6
     WHERE id=$7 AND user_id=$8`,
    [date, name, walletId, categoryId, needsType, amount, id, userId],
  )
  redirect(`/rekap/${year}?bulan=${month}&tab=pengeluaran`)
}

export async function updateLoanGiven(id: string, formData: FormData) {
  const session = await requireUser()
  const userId   = session.user.id
  const borrower = (formData.get("borrower") as string)?.trim()
  const amount   = parseFloat(formData.get("amount") as string)
  const status   = formData.get("status") as string
  const notes    = (formData.get("notes") as string)?.trim() || null
  const month    = parseInt(formData.get("month") as string)
  const year     = parseInt(formData.get("year") as string)

  if (!borrower || isNaN(amount) || amount <= 0) throw new Error("Data tidak valid")
  await pool.query(
    `UPDATE loans_given SET borrower=$1, amount=$2, status=$3, notes=$4
     WHERE id=$5 AND user_id=$6`,
    [borrower, amount, status, notes, id, userId],
  )
  redirect(`/rekap/${year}?bulan=${month}&tab=dipinjam`)
}

export async function updateLoanTaken(id: string, formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id
  const lender = (formData.get("lender") as string)?.trim()
  const amount = parseFloat(formData.get("amount") as string)
  const notes  = (formData.get("notes") as string)?.trim() || null
  const month  = parseInt(formData.get("month") as string)
  const year   = parseInt(formData.get("year") as string)

  if (!lender || isNaN(amount) || amount <= 0) throw new Error("Data tidak valid")
  await pool.query(
    `UPDATE loans_taken SET lender=$1, amount=$2, notes=$3
     WHERE id=$4 AND user_id=$5`,
    [lender, amount, notes, id, userId],
  )
  redirect(`/rekap/${year}?bulan=${month}&tab=hutang`)
}
