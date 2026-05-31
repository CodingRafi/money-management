"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { pool } from "@/lib/db"
import { recalcWalletBalances } from "@/lib/wallet"
import { requirePermission } from "@/lib/licence"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error("Unauthenticated")
  return session
}

// ── Delete entire year's data ────────────────────────────────────────────────

export async function deleteYearData(year: string) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "delete_transaction")
  const y = parseInt(year)

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await Promise.all([
      client.query(`DELETE FROM incomes     WHERE user_id = $1 AND year = $2`, [userId, y]),
      client.query(`DELETE FROM expenses    WHERE user_id = $1 AND year = $2`, [userId, y]),
      client.query(`DELETE FROM loans_given WHERE user_id = $1 AND year = $2`, [userId, y]),
      client.query(`DELETE FROM loans_taken WHERE user_id = $1 AND year = $2`, [userId, y]),
    ])
    await recalcWalletBalances(userId, client)
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }

  revalidatePath("/rekap")
  revalidatePath("/dompet")
}

// ── Income ──────────────────────────────────────────────────────────────────

export async function addIncome(formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "add_transaction")

  const date       = formData.get("date") as string
  const name       = (formData.get("name") as string)?.trim()
  const categoryId = (formData.get("category_id") as string) || null
  const walletId   = (formData.get("wallet_id") as string) || null
  const amount     = parseFloat(formData.get("amount") as string)
  const month      = parseInt(formData.get("month") as string)
  const year       = parseInt(formData.get("year") as string)
  const isInitial  = formData.get("is_initial") === "true"

  if (!date || !name || isNaN(amount) || amount <= 0) throw new Error("Data tidak valid")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(
      `INSERT INTO incomes (user_id, date, name, category_id, wallet_id, amount, month, year, is_initial)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, date, name, categoryId, walletId, amount, month, year, isInitial],
    )
    if (walletId && !isInitial) {
      await client.query(
        `UPDATE wallets SET balance = balance + $1 WHERE id = $2 AND user_id = $3`,
        [amount, walletId, userId],
      )
    }
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }

  redirect(`/rekap/${year}?bulan=${month}&tab=pendapatan`)
}

export async function updateIncome(id: string, formData: FormData) {
  const session = await requireUser()
  const userId     = session.user.id
  await requirePermission(userId, "change_transaction")

  const date       = formData.get("date") as string
  const name       = (formData.get("name") as string)?.trim()
  const categoryId = (formData.get("category_id") as string) || null
  const walletId   = (formData.get("wallet_id") as string) || null
  const amount     = parseFloat(formData.get("amount") as string)
  const month      = parseInt(formData.get("month") as string)
  const year       = parseInt(formData.get("year") as string)
  const isInitial  = formData.get("is_initial") === "true"

  if (!date || !name || isNaN(amount) || amount <= 0) throw new Error("Data tidak valid")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const old = await client.query<{ wallet_id: string | null; amount: string; is_initial: boolean }>(
      `SELECT wallet_id, amount::text, is_initial FROM incomes WHERE id = $1 AND user_id = $2`,
      [id, userId],
    )
    if (!old.rows[0]) throw new Error("Data tidak ditemukan")

    const { wallet_id: oldWalletId, amount: oldAmountStr, is_initial: oldIsInitial } = old.rows[0]
    const oldAmount = parseFloat(oldAmountStr)

    if (oldWalletId && !oldIsInitial) {
      await client.query(
        `UPDATE wallets SET balance = balance - $1 WHERE id = $2 AND user_id = $3`,
        [oldAmount, oldWalletId, userId],
      )
    }
    if (walletId && !isInitial) {
      await client.query(
        `UPDATE wallets SET balance = balance + $1 WHERE id = $2 AND user_id = $3`,
        [amount, walletId, userId],
      )
    }

    await client.query(
      `UPDATE incomes SET date=$1, name=$2, category_id=$3, wallet_id=$4, amount=$5, is_initial=$6
       WHERE id=$7 AND user_id=$8`,
      [date, name, categoryId, walletId, amount, isInitial, id, userId],
    )
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }

  redirect(`/rekap/${year}?bulan=${month}&tab=pendapatan`)
}

export async function deleteIncome(id: string, year: string, month: string) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "delete_transaction")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const res = await client.query<{ wallet_id: string | null; amount: string; is_initial: boolean }>(
      `SELECT wallet_id, amount::text, is_initial FROM incomes WHERE id = $1 AND user_id = $2`,
      [id, userId],
    )
    if (res.rows[0]?.wallet_id && !res.rows[0].is_initial) {
      await client.query(
        `UPDATE wallets SET balance = balance - $1 WHERE id = $2 AND user_id = $3`,
        [parseFloat(res.rows[0].amount), res.rows[0].wallet_id, userId],
      )
    }
    await client.query(`DELETE FROM incomes WHERE id = $1 AND user_id = $2`, [id, userId])
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }

  revalidatePath(`/rekap/${year}`)
  revalidatePath("/rekap")
  revalidatePath("/dompet")
}

// ── Expense ─────────────────────────────────────────────────────────────────

export async function addExpense(formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "add_transaction")

  const date       = formData.get("date") as string
  const name       = (formData.get("name") as string)?.trim()
  const walletId   = (formData.get("wallet_id") as string) || null
  const categoryId = (formData.get("category_id") as string) || null
  const needsType  = formData.get("needs_type") as string
  const amount     = parseFloat(formData.get("amount") as string)
  const month      = parseInt(formData.get("month") as string)
  const year       = parseInt(formData.get("year") as string)
  const isInitial  = formData.get("is_initial") === "true"

  if (!date || !name || !needsType || isNaN(amount) || amount <= 0) throw new Error("Data tidak valid")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(
      `INSERT INTO expenses (user_id, date, name, wallet_id, category_id, needs_type, amount, month, year, is_initial)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [userId, date, name, walletId, categoryId, needsType, amount, month, year, isInitial],
    )
    if (walletId && !isInitial) {
      await client.query(
        `UPDATE wallets SET balance = balance - $1 WHERE id = $2 AND user_id = $3`,
        [amount, walletId, userId],
      )
    }
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }

  redirect(`/rekap/${year}?bulan=${month}&tab=pengeluaran`)
}

export async function updateExpense(id: string, formData: FormData) {
  const session = await requireUser()
  const userId     = session.user.id
  await requirePermission(userId, "change_transaction")

  const date       = formData.get("date") as string
  const name       = (formData.get("name") as string)?.trim()
  const walletId   = (formData.get("wallet_id") as string) || null
  const categoryId = (formData.get("category_id") as string) || null
  const needsType  = formData.get("needs_type") as string
  const amount     = parseFloat(formData.get("amount") as string)
  const month      = parseInt(formData.get("month") as string)
  const year       = parseInt(formData.get("year") as string)
  const isInitial  = formData.get("is_initial") === "true"

  if (!date || !name || !needsType || isNaN(amount) || amount <= 0) throw new Error("Data tidak valid")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const old = await client.query<{ wallet_id: string | null; amount: string; is_initial: boolean }>(
      `SELECT wallet_id, amount::text, is_initial FROM expenses WHERE id = $1 AND user_id = $2`,
      [id, userId],
    )
    if (!old.rows[0]) throw new Error("Data tidak ditemukan")

    const { wallet_id: oldWalletId, amount: oldAmountStr, is_initial: oldIsInitial } = old.rows[0]
    const oldAmount = parseFloat(oldAmountStr)

    if (oldWalletId && !oldIsInitial) {
      await client.query(
        `UPDATE wallets SET balance = balance + $1 WHERE id = $2 AND user_id = $3`,
        [oldAmount, oldWalletId, userId],
      )
    }
    if (walletId && !isInitial) {
      await client.query(
        `UPDATE wallets SET balance = balance - $1 WHERE id = $2 AND user_id = $3`,
        [amount, walletId, userId],
      )
    }

    await client.query(
      `UPDATE expenses SET date=$1, name=$2, wallet_id=$3, category_id=$4, needs_type=$5, amount=$6, is_initial=$7
       WHERE id=$8 AND user_id=$9`,
      [date, name, walletId, categoryId, needsType, amount, isInitial, id, userId],
    )
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }

  redirect(`/rekap/${year}?bulan=${month}&tab=pengeluaran`)
}

export async function deleteExpense(id: string, year: string, month: string) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "delete_transaction")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const res = await client.query<{ wallet_id: string | null; amount: string; is_initial: boolean }>(
      `SELECT wallet_id, amount::text, is_initial FROM expenses WHERE id = $1 AND user_id = $2`,
      [id, userId],
    )
    if (res.rows[0]?.wallet_id && !res.rows[0].is_initial) {
      await client.query(
        `UPDATE wallets SET balance = balance + $1 WHERE id = $2 AND user_id = $3`,
        [parseFloat(res.rows[0].amount), res.rows[0].wallet_id, userId],
      )
    }
    await client.query(`DELETE FROM expenses WHERE id = $1 AND user_id = $2`, [id, userId])
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }

  revalidatePath(`/rekap/${year}`)
  revalidatePath("/rekap")
  revalidatePath("/dompet")
}

// ── Loan Given — Dipinjam ────────────────────────────────────────────────────

export async function addLoanGiven(formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "add_transaction")

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

export async function updateLoanGiven(id: string, formData: FormData) {
  const session = await requireUser()
  const userId   = session.user.id
  await requirePermission(userId, "change_transaction")

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

export async function deleteLoanGiven(id: string, year: string, month: string) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "delete_transaction")
  await pool.query(`DELETE FROM loans_given WHERE id = $1 AND user_id = $2`, [id, userId])
  revalidatePath(`/rekap/${year}`)
}

// ── Loan Taken — Hutang ──────────────────────────────────────────────────────

export async function addLoanTaken(formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "add_transaction")

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

export async function updateLoanTaken(id: string, formData: FormData) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "change_transaction")

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

export async function deleteLoanTaken(id: string, year: string, month: string) {
  const session = await requireUser()
  const userId = session.user.id
  await requirePermission(userId, "delete_transaction")
  await pool.query(`DELETE FROM loans_taken WHERE id = $1 AND user_id = $2`, [id, userId])
  revalidatePath(`/rekap/${year}`)
}
