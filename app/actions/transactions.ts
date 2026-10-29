"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { recalcWalletBalances } from "@/lib/wallet"
import { requireUserIdAction } from "@/lib/session"
import crypto from "crypto"

function uuid() { return crypto.randomUUID() }

// ── Delete year ──────────────────────────────────────────────────────────────

export async function deleteYearData(year: string) {
  const userId = await requireUserIdAction()
  const y = parseInt(year)

  await db.transaction(async () => {
    await db.prepare("DELETE FROM incomes     WHERE user_id = ? AND year = ?").run(userId, y)
    await db.prepare("DELETE FROM expenses    WHERE user_id = ? AND year = ?").run(userId, y)
    await db.prepare("DELETE FROM loans_given WHERE user_id = ? AND year = ?").run(userId, y)
    await db.prepare("DELETE FROM loans_taken WHERE user_id = ? AND year = ?").run(userId, y)
    await recalcWalletBalances(userId)
  })

  revalidatePath("/rekap")
  revalidatePath("/dompet")
  revalidatePath("/dashboard")
}

// ── Income ───────────────────────────────────────────────────────────────────

export async function addIncome(formData: FormData) {
  const userId     = await requireUserIdAction()
  const date       = formData.get("date") as string
  const name       = (formData.get("name") as string)?.trim()
  const categoryId = (formData.get("category_id") as string) || null
  const walletId   = (formData.get("wallet_id")   as string) || null
  const amount     = parseFloat(formData.get("amount") as string)
  const month      = parseInt(formData.get("month") as string)
  const year       = parseInt(formData.get("year")  as string)
  const isInitial  = formData.get("is_initial") === "true" ? 1 : 0

  if (!date || !name || isNaN(amount) || amount <= 0) throw new Error("Data tidak valid")

  await db.transaction(async () => {
    await db.prepare(
      "INSERT INTO incomes (id, user_id, date, name, category_id, wallet_id, amount, month, year, is_initial) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(uuid(), userId, date, name, categoryId, walletId, amount, month, year, isInitial)
    if (walletId && !isInitial) {
      await db.prepare("UPDATE wallets SET balance = balance + ? WHERE id = ? AND user_id = ?").run(amount, walletId, userId)
    }
  })

  revalidatePath("/dashboard")
  redirect(`/rekap/${year}?bulan=${month}&tab=pendapatan`)
}

export async function updateIncome(id: string, formData: FormData) {
  const userId     = await requireUserIdAction()
  const date       = formData.get("date") as string
  const name       = (formData.get("name") as string)?.trim()
  const categoryId = (formData.get("category_id") as string) || null
  const walletId   = (formData.get("wallet_id")   as string) || null
  const amount     = parseFloat(formData.get("amount") as string)
  const month      = parseInt(formData.get("month") as string)
  const year       = parseInt(formData.get("year")  as string)
  const isInitial  = formData.get("is_initial") === "true" ? 1 : 0

  if (!date || !name || isNaN(amount) || amount <= 0) throw new Error("Data tidak valid")

  await db.transaction(async () => {
    const old = await db.prepare(
      "SELECT wallet_id, amount, is_initial FROM incomes WHERE id = ? AND user_id = ?"
    ).get(id, userId) as { wallet_id: string | null; amount: number; is_initial: number } | undefined
    if (!old) throw new Error("Data tidak ditemukan")

    if (old.wallet_id && !old.is_initial) {
      await db.prepare("UPDATE wallets SET balance = balance - ? WHERE id = ? AND user_id = ?").run(old.amount, old.wallet_id, userId)
    }
    if (walletId && !isInitial) {
      await db.prepare("UPDATE wallets SET balance = balance + ? WHERE id = ? AND user_id = ?").run(amount, walletId, userId)
    }
    await db.prepare(
      "UPDATE incomes SET date=?, name=?, category_id=?, wallet_id=?, amount=?, is_initial=? WHERE id=? AND user_id=?"
    ).run(date, name, categoryId, walletId, amount, isInitial, id, userId)
  })

  revalidatePath("/dashboard")
  redirect(`/rekap/${year}?bulan=${month}&tab=pendapatan`)
}

export async function deleteIncome(id: string, year: string, month: string) {
  const userId = await requireUserIdAction()

  await db.transaction(async () => {
    const row = await db.prepare(
      "SELECT wallet_id, amount, is_initial FROM incomes WHERE id = ? AND user_id = ?"
    ).get(id, userId) as { wallet_id: string | null; amount: number; is_initial: number } | undefined
    if (row?.wallet_id && !row.is_initial) {
      await db.prepare("UPDATE wallets SET balance = balance - ? WHERE id = ? AND user_id = ?").run(row.amount, row.wallet_id, userId)
    }
    await db.prepare("DELETE FROM incomes WHERE id = ? AND user_id = ?").run(id, userId)
  })

  revalidatePath(`/rekap/${year}`)
  revalidatePath("/rekap")
  revalidatePath("/dompet")
  revalidatePath("/dashboard")
}

// ── Expense ──────────────────────────────────────────────────────────────────

export async function addExpense(formData: FormData) {
  const userId     = await requireUserIdAction()
  const date       = formData.get("date") as string
  const name       = (formData.get("name") as string)?.trim()
  const walletId   = (formData.get("wallet_id")   as string) || null
  const categoryId = (formData.get("category_id") as string) || null
  const needsType  = formData.get("needs_type") as string
  const amount     = parseFloat(formData.get("amount") as string)
  const month      = parseInt(formData.get("month") as string)
  const year       = parseInt(formData.get("year")  as string)
  const isInitial  = formData.get("is_initial") === "true" ? 1 : 0

  if (!date || !name || !needsType || isNaN(amount) || amount <= 0) throw new Error("Data tidak valid")

  await db.transaction(async () => {
    await db.prepare(
      "INSERT INTO expenses (id, user_id, date, name, wallet_id, category_id, needs_type, amount, month, year, is_initial) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(uuid(), userId, date, name, walletId, categoryId, needsType, amount, month, year, isInitial)
    if (walletId && !isInitial) {
      await db.prepare("UPDATE wallets SET balance = balance - ? WHERE id = ? AND user_id = ?").run(amount, walletId, userId)
    }
  })

  revalidatePath("/dashboard")
  redirect(`/rekap/${year}?bulan=${month}&tab=pengeluaran`)
}

export async function updateExpense(id: string, formData: FormData) {
  const userId     = await requireUserIdAction()
  const date       = formData.get("date") as string
  const name       = (formData.get("name") as string)?.trim()
  const walletId   = (formData.get("wallet_id")   as string) || null
  const categoryId = (formData.get("category_id") as string) || null
  const needsType  = formData.get("needs_type") as string
  const amount     = parseFloat(formData.get("amount") as string)
  const month      = parseInt(formData.get("month") as string)
  const year       = parseInt(formData.get("year")  as string)
  const isInitial  = formData.get("is_initial") === "true" ? 1 : 0

  if (!date || !name || !needsType || isNaN(amount) || amount <= 0) throw new Error("Data tidak valid")

  await db.transaction(async () => {
    const old = await db.prepare(
      "SELECT wallet_id, amount, is_initial FROM expenses WHERE id = ? AND user_id = ?"
    ).get(id, userId) as { wallet_id: string | null; amount: number; is_initial: number } | undefined
    if (!old) throw new Error("Data tidak ditemukan")

    if (old.wallet_id && !old.is_initial) {
      await db.prepare("UPDATE wallets SET balance = balance + ? WHERE id = ? AND user_id = ?").run(old.amount, old.wallet_id, userId)
    }
    if (walletId && !isInitial) {
      await db.prepare("UPDATE wallets SET balance = balance - ? WHERE id = ? AND user_id = ?").run(amount, walletId, userId)
    }
    await db.prepare(
      "UPDATE expenses SET date=?, name=?, wallet_id=?, category_id=?, needs_type=?, amount=?, is_initial=? WHERE id=? AND user_id=?"
    ).run(date, name, walletId, categoryId, needsType, amount, isInitial, id, userId)
  })

  revalidatePath("/dashboard")
  redirect(`/rekap/${year}?bulan=${month}&tab=pengeluaran`)
}

export async function deleteExpense(id: string, year: string, month: string) {
  const userId = await requireUserIdAction()

  await db.transaction(async () => {
    const row = await db.prepare(
      "SELECT wallet_id, amount, is_initial FROM expenses WHERE id = ? AND user_id = ?"
    ).get(id, userId) as { wallet_id: string | null; amount: number; is_initial: number } | undefined
    if (row?.wallet_id && !row.is_initial) {
      await db.prepare("UPDATE wallets SET balance = balance + ? WHERE id = ? AND user_id = ?").run(row.amount, row.wallet_id, userId)
    }
    await db.prepare("DELETE FROM expenses WHERE id = ? AND user_id = ?").run(id, userId)
  })

  revalidatePath(`/rekap/${year}`)
  revalidatePath("/rekap")
  revalidatePath("/dompet")
  revalidatePath("/dashboard")
}

// ── Loan Given ───────────────────────────────────────────────────────────────

export async function addLoanGiven(formData: FormData) {
  const userId   = await requireUserIdAction()
  const borrower = (formData.get("borrower") as string)?.trim()
  const amount   = parseFloat(formData.get("amount") as string)
  const status   = formData.get("status") as string
  const notes    = (formData.get("notes") as string)?.trim() || null
  const month    = parseInt(formData.get("month") as string)
  const year     = parseInt(formData.get("year")  as string)

  if (!borrower || isNaN(amount) || amount <= 0 || !status) throw new Error("Data tidak valid")

  await db.prepare(
    "INSERT INTO loans_given (id, user_id, borrower, amount, status, notes, month, year) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(uuid(), userId, borrower, amount, status, notes, month, year)

  redirect(`/rekap/${year}?bulan=${month}&tab=dipinjam`)
}

export async function updateLoanGiven(id: string, formData: FormData) {
  const userId   = await requireUserIdAction()
  const borrower = (formData.get("borrower") as string)?.trim()
  const amount   = parseFloat(formData.get("amount") as string)
  const status   = formData.get("status") as string
  const notes    = (formData.get("notes") as string)?.trim() || null
  const month    = parseInt(formData.get("month") as string)
  const year     = parseInt(formData.get("year")  as string)

  if (!borrower || isNaN(amount) || amount <= 0) throw new Error("Data tidak valid")
  await db.prepare(
    "UPDATE loans_given SET borrower=?, amount=?, status=?, notes=? WHERE id=? AND user_id=?"
  ).run(borrower, amount, status, notes, id, userId)
  redirect(`/rekap/${year}?bulan=${month}&tab=dipinjam`)
}

export async function deleteLoanGiven(id: string, year: string, month: string) {
  const userId = await requireUserIdAction()
  await db.prepare("DELETE FROM loans_given WHERE id = ? AND user_id = ?").run(id, userId)
  revalidatePath(`/rekap/${year}`)
}

// ── Loan Taken ───────────────────────────────────────────────────────────────

export async function addLoanTaken(formData: FormData) {
  const userId = await requireUserIdAction()
  const lender = (formData.get("lender") as string)?.trim()
  const amount = parseFloat(formData.get("amount") as string)
  const notes  = (formData.get("notes") as string)?.trim() || null
  const month  = parseInt(formData.get("month") as string)
  const year   = parseInt(formData.get("year")  as string)

  if (!lender || isNaN(amount) || amount <= 0) throw new Error("Data tidak valid")

  await db.prepare(
    "INSERT INTO loans_taken (id, user_id, lender, amount, notes, month, year) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(uuid(), userId, lender, amount, notes, month, year)

  redirect(`/rekap/${year}?bulan=${month}&tab=hutang`)
}

export async function updateLoanTaken(id: string, formData: FormData) {
  const userId = await requireUserIdAction()
  const lender = (formData.get("lender") as string)?.trim()
  const amount = parseFloat(formData.get("amount") as string)
  const notes  = (formData.get("notes") as string)?.trim() || null
  const month  = parseInt(formData.get("month") as string)
  const year   = parseInt(formData.get("year")  as string)

  if (!lender || isNaN(amount) || amount <= 0) throw new Error("Data tidak valid")
  await db.prepare(
    "UPDATE loans_taken SET lender=?, amount=?, notes=? WHERE id=? AND user_id=?"
  ).run(lender, amount, notes, id, userId)
  redirect(`/rekap/${year}?bulan=${month}&tab=hutang`)
}

export async function deleteLoanTaken(id: string, year: string, month: string) {
  const userId = await requireUserIdAction()
  await db.prepare("DELETE FROM loans_taken WHERE id = ? AND user_id = ?").run(id, userId)
  revalidatePath(`/rekap/${year}`)
}
