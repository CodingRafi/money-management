"use server"

import { revalidatePath, refresh } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { requireWritableUserId } from "@/lib/scope"
import { financeService } from "@/services/finance.service"

// ── Asset CRUD ────────────────────────────────────────────────────────────────

export async function createInvestment(year: string, formData: FormData) {
  const userId     = await requireWritableUserId()
  const name       = (formData.get("name") as string)?.trim()
  const categoryId = formData.get("category_id") as string
  const walletId   = (formData.get("wallet_id") as string) || null
  const isLiquid   = formData.get("is_liquid") === "true"
  const unit       = (formData.get("unit") as string) || null
  const notes      = (formData.get("notes") as string)?.trim() || null
  await financeService.createInvestment(userId, { name, categoryId, walletId, isLiquid, unit, notes })
  redirect(`/rekap/${year}?tab=investasi`)
}

export async function createInvestmentDirect(formData: FormData) {
  const userId     = await requireWritableUserId()
  const name       = (formData.get("name") as string)?.trim()
  const categoryId = formData.get("category_id") as string
  const walletId   = (formData.get("wallet_id") as string) || null
  const isLiquid   = formData.get("is_liquid") === "true"
  const unit       = (formData.get("unit") as string) || null
  const notes      = (formData.get("notes") as string)?.trim() || null
  const id = await financeService.createInvestment(userId, { name, categoryId, walletId, isLiquid, unit, notes })
  redirect(`/investasi/aset/${id}`)
}

export async function updateInvestment(id: string, year: string, formData: FormData) {
  const userId   = await requireWritableUserId()
  const name     = (formData.get("name") as string)?.trim()
  const walletId = (formData.get("wallet_id") as string) || null
  const isLiquid = formData.get("is_liquid") === "true" ? 1 : 0
  const notes    = (formData.get("notes") as string)?.trim() || null
  if (!name) throw new Error("Nama tidak boleh kosong")
  await db.prepare(
    "UPDATE investments SET name=?, wallet_id=?, is_liquid=?, notes=?, updated_at=datetime('now') WHERE id=? AND user_id=?"
  ).run(name, walletId, isLiquid, notes, id, userId)
  redirect(`/rekap/${year}/investasi/${id}`)
}

export async function updateInvestmentDirect(id: string, formData: FormData) {
  const userId   = await requireWritableUserId()
  const name     = (formData.get("name") as string)?.trim()
  const walletId = (formData.get("wallet_id") as string) || null
  const isLiquid = formData.get("is_liquid") === "true" ? 1 : 0
  const notes    = (formData.get("notes") as string)?.trim() || null
  if (!name) throw new Error("Nama tidak boleh kosong")
  await db.prepare(
    "UPDATE investments SET name=?, wallet_id=?, is_liquid=?, notes=?, updated_at=datetime('now') WHERE id=? AND user_id=?"
  ).run(name, walletId, isLiquid, notes, id, userId)
  redirect(`/investasi/aset/${id}`)
}

export async function deleteInvestment(id: string, year: string) {
  const userId = await requireWritableUserId()
  const sellRow = await db.prepare(
    "SELECT COUNT(*) AS cnt FROM investment_transactions WHERE investment_id=? AND type='SELL'"
  ).get(id) as { cnt: number }
  if (sellRow.cnt > 0) throw new Error("Tidak bisa hapus aset yang sudah punya transaksi SELL")
  await db.prepare(
    "UPDATE investments SET is_active=0, updated_at=datetime('now') WHERE id=? AND user_id=?"
  ).run(id, userId)
  redirect(`/rekap/${year}?tab=investasi`)
}

export async function deleteInvestmentDirect(id: string) {
  const userId = await requireWritableUserId()
  const sellRow = await db.prepare(
    "SELECT COUNT(*) AS cnt FROM investment_transactions WHERE investment_id=? AND type='SELL'"
  ).get(id) as { cnt: number }
  if (sellRow.cnt > 0) throw new Error("Tidak bisa hapus aset yang sudah punya transaksi SELL")
  await db.prepare(
    "UPDATE investments SET is_active=0, updated_at=datetime('now') WHERE id=? AND user_id=?"
  ).run(id, userId)
  redirect("/investasi")
}

export async function closeInvestmentDirect(id: string) {
  const userId = await requireWritableUserId()
  await db.prepare(
    "UPDATE investments SET is_closed=1, closed_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND user_id=?"
  ).run(id, userId)
  redirect(`/investasi/aset/${id}`)
}

export async function reopenInvestmentDirect(id: string) {
  const userId = await requireWritableUserId()
  await db.prepare(
    "UPDATE investments SET is_closed=0, closed_at=NULL, updated_at=datetime('now') WHERE id=? AND user_id=?"
  ).run(id, userId)
  redirect(`/investasi/aset/${id}`)
}

// ── Transaction helpers ───────────────────────────────────────────────────────

async function execAddInvestmentTransaction(investmentId: string, userId: string, formData: FormData) {
  const type         = formData.get("type") as string
  const goalId       = (formData.get("goal_id") as string) || null
  const quantity     = (formData.get("quantity") as string)?.trim() || "1"
  const totalAmount  = parseFloat(formData.get("total_amount") as string)
  const date         = formData.get("date") as string
  const fromWalletId = (formData.get("from_wallet_id") as string) || null
  const toWalletId   = (formData.get("to_wallet_id")   as string) || null
  const notes        = (formData.get("notes") as string)?.trim() || null
  const isInitial    = formData.get("is_initial") === "true"

  await financeService.createInvestmentTransaction(userId, investmentId, {
    type: type as "BUY" | "SELL" | "DIVIDEND",
    quantity,
    totalAmount,
    date,
    goalId,
    fromWalletId,
    toWalletId,
    notes,
    isInitial,
  })
}

async function execDeleteInvestmentTransaction(id: string, userId: string) {
  await db.transaction(async () => {
    const row = await db.prepare(`
      SELECT it.id FROM investment_transactions it
      JOIN investments i ON i.id = it.investment_id
      WHERE it.id=? AND i.user_id=?
    `).get(id, userId)
    if (!row) throw new Error("Transaksi tidak ditemukan")

    await db.prepare("DELETE FROM investment_transactions WHERE id=?").run(id)
  })
}

export async function addInvestmentTransaction(investmentId: string, year: string, formData: FormData) {
  const userId = await requireWritableUserId()
  await execAddInvestmentTransaction(investmentId, userId, formData)
  revalidatePath("/dompet")
  revalidatePath("/investasi")
  revalidatePath("/dashboard")
  redirect(`/rekap/${year}/investasi/${investmentId}`)
}

export async function addInvestmentTransactionDirect(
  investmentId: string,
  _prevState: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string } | null> {
  const userId = await requireWritableUserId()
  try {
    await execAddInvestmentTransaction(investmentId, userId, formData)
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath("/dompet")
  revalidatePath("/investasi")
  revalidatePath("/dashboard")
  redirect(`/investasi/aset/${investmentId}`)
}

export async function deleteInvestmentTransaction(id: string, investmentId: string, year: string) {
  const userId = await requireWritableUserId()
  await execDeleteInvestmentTransaction(id, userId)
  revalidatePath(`/rekap/${year}/investasi/${investmentId}`)
  revalidatePath("/dompet")
  revalidatePath("/investasi")
  revalidatePath("/dashboard")
}

export async function deleteInvestmentTransactionDirect(id: string, investmentId: string) {
  const userId = await requireWritableUserId()
  await execDeleteInvestmentTransaction(id, userId)
  revalidatePath(`/investasi/aset/${investmentId}`)
  revalidatePath("/dompet")
  revalidatePath("/investasi")
  revalidatePath("/dashboard")
  refresh()
}
