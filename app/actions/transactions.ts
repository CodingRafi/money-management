"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { z } from "zod"
import { requireWritableUserId, requireWritableSession } from "@/lib/scope"
import { expenseRepository } from "@/repositories/expense.repository"
import { expenseService } from "@/services/expense.service"
import { incomeSchema, expenseSchema, formToObject } from "@/dtos/transaction"
import crypto from "crypto"

function uuid() { return crypto.randomUUID() }

// ── Delete year ──────────────────────────────────────────────────────────────

export async function deleteYearData(year: string) {
  const userId = await requireWritableUserId()
  const y = z.coerce.number().int().min(2000).max(2100).parse(year)

  await db.transaction(async () => {
    await expenseRepository.deleteYear(userId, y)
  })

  revalidatePath("/rekap")
  revalidatePath("/dompet")
  revalidatePath("/dashboard")
}

// ── Income ───────────────────────────────────────────────────────────────────

function parseForm<T>(schema: z.ZodType<T>, formData: FormData): T {
  const r = schema.safeParse(formToObject(formData))
  if (!r.success) throw new Error(r.error.issues[0].message)
  return r.data
}

export async function addIncome(formData: FormData) {
  const session = await requireWritableSession()
  const v = parseForm(incomeSchema, formData)
  await expenseService.createIncome(session, v)
  revalidatePath("/dashboard")
  redirect(`/rekap/${v.year}?bulan=${v.month}&tab=pendapatan`)
}

export async function updateIncome(id: string, formData: FormData) {
  const session = await requireWritableSession()
  const v = parseForm(incomeSchema, formData)
  await expenseService.updateIncome(session, id, v)
  revalidatePath("/dashboard")
  redirect(`/rekap/${v.year}?bulan=${v.month}&tab=pendapatan`)
}

export async function deleteIncome(id: string, year: string, month: string) {
  const session = await requireWritableSession()
  await expenseService.deleteIncome(session, id)
  revalidatePath(`/rekap/${year}`)
  revalidatePath("/rekap")
  revalidatePath("/dashboard")
}

// ── Expense ──────────────────────────────────────────────────────────────────

export async function addExpense(formData: FormData) {
  const session = await requireWritableSession()
  const v = parseForm(expenseSchema, formData)
  await expenseService.createExpense(session, v)
  revalidatePath("/dashboard")
  redirect(`/rekap/${v.year}?bulan=${v.month}&tab=pengeluaran`)
}

export async function updateExpense(id: string, formData: FormData) {
  const session = await requireWritableSession()
  const v = parseForm(expenseSchema, formData)
  await expenseService.updateExpense(session, id, v)
  revalidatePath("/dashboard")
  redirect(`/rekap/${v.year}?bulan=${v.month}&tab=pengeluaran`)
}

export async function deleteExpense(id: string, year: string, month: string) {
  const session = await requireWritableSession()
  await expenseService.deleteExpense(session, id)
  revalidatePath(`/rekap/${year}`)
  revalidatePath("/rekap")
  revalidatePath("/dashboard")
}

// ── Loan Given ───────────────────────────────────────────────────────────────

export async function addLoanGiven(formData: FormData) {
  const userId   = await requireWritableUserId()
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
  const userId   = await requireWritableUserId()
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
  const userId = await requireWritableUserId()
  await db.prepare("DELETE FROM loans_given WHERE id = ? AND user_id = ?").run(id, userId)
  revalidatePath(`/rekap/${year}`)
}

// ── Loan Taken ───────────────────────────────────────────────────────────────

export async function addLoanTaken(formData: FormData) {
  const userId = await requireWritableUserId()
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
  const userId = await requireWritableUserId()
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
  const userId = await requireWritableUserId()
  await db.prepare("DELETE FROM loans_taken WHERE id = ? AND user_id = ?").run(id, userId)
  revalidatePath(`/rekap/${year}`)
}
