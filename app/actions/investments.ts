"use server"

import { revalidatePath, refresh } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { requireUserIdAction } from "@/lib/session"
import crypto from "crypto"

function uuid() { return crypto.randomUUID() }
function formatRupiah(n: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n) }

// ── Asset CRUD ────────────────────────────────────────────────────────────────

export async function createInvestment(year: string, formData: FormData) {
  const userId     = await requireUserIdAction()
  const name       = (formData.get("name") as string)?.trim()
  const categoryId = formData.get("category_id") as string
  const walletId   = (formData.get("wallet_id") as string) || null
  const isLiquid   = formData.get("is_liquid") === "true" ? 1 : 0
  const notes      = (formData.get("notes") as string)?.trim() || null
  if (!name || !categoryId) throw new Error("Data tidak valid")
  db.prepare(
    "INSERT INTO investments (id, user_id, category_id, name, wallet_id, is_liquid, notes) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(uuid(), userId, categoryId, name, walletId, isLiquid, notes)
  redirect(`/rekap/${year}?tab=investasi`)
}

export async function createInvestmentDirect(formData: FormData) {
  const userId     = await requireUserIdAction()
  const name       = (formData.get("name") as string)?.trim()
  const categoryId = formData.get("category_id") as string
  const walletId   = (formData.get("wallet_id") as string) || null
  const isLiquid   = formData.get("is_liquid") === "true" ? 1 : 0
  const notes      = (formData.get("notes") as string)?.trim() || null
  if (!name || !categoryId) throw new Error("Data tidak valid")
  const id = uuid()
  db.prepare(
    "INSERT INTO investments (id, user_id, category_id, name, wallet_id, is_liquid, notes) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, userId, categoryId, name, walletId, isLiquid, notes)
  redirect(`/investasi/aset/${id}`)
}

export async function updateInvestment(id: string, year: string, formData: FormData) {
  const userId   = await requireUserIdAction()
  const name     = (formData.get("name") as string)?.trim()
  const walletId = (formData.get("wallet_id") as string) || null
  const isLiquid = formData.get("is_liquid") === "true" ? 1 : 0
  const notes    = (formData.get("notes") as string)?.trim() || null
  if (!name) throw new Error("Nama tidak boleh kosong")
  db.prepare(
    "UPDATE investments SET name=?, wallet_id=?, is_liquid=?, notes=?, updated_at=datetime('now') WHERE id=? AND user_id=?"
  ).run(name, walletId, isLiquid, notes, id, userId)
  redirect(`/rekap/${year}/investasi/${id}`)
}

export async function updateInvestmentDirect(id: string, formData: FormData) {
  const userId   = await requireUserIdAction()
  const name     = (formData.get("name") as string)?.trim()
  const walletId = (formData.get("wallet_id") as string) || null
  const isLiquid = formData.get("is_liquid") === "true" ? 1 : 0
  const notes    = (formData.get("notes") as string)?.trim() || null
  if (!name) throw new Error("Nama tidak boleh kosong")
  db.prepare(
    "UPDATE investments SET name=?, wallet_id=?, is_liquid=?, notes=?, updated_at=datetime('now') WHERE id=? AND user_id=?"
  ).run(name, walletId, isLiquid, notes, id, userId)
  redirect(`/investasi/aset/${id}`)
}

export async function deleteInvestment(id: string, year: string) {
  const userId = await requireUserIdAction()
  const sellRow = db.prepare(
    "SELECT COUNT(*) AS cnt FROM investment_transactions WHERE investment_id=? AND type='SELL'"
  ).get(id) as { cnt: number }
  if (sellRow.cnt > 0) throw new Error("Tidak bisa hapus aset yang sudah punya transaksi SELL")
  db.prepare(
    "UPDATE investments SET is_active=0, updated_at=datetime('now') WHERE id=? AND user_id=?"
  ).run(id, userId)
  redirect(`/rekap/${year}?tab=investasi`)
}

export async function deleteInvestmentDirect(id: string) {
  const userId = await requireUserIdAction()
  const sellRow = db.prepare(
    "SELECT COUNT(*) AS cnt FROM investment_transactions WHERE investment_id=? AND type='SELL'"
  ).get(id) as { cnt: number }
  if (sellRow.cnt > 0) throw new Error("Tidak bisa hapus aset yang sudah punya transaksi SELL")
  db.prepare(
    "UPDATE investments SET is_active=0, updated_at=datetime('now') WHERE id=? AND user_id=?"
  ).run(id, userId)
  redirect("/investasi")
}

export async function closeInvestmentDirect(id: string) {
  const userId = await requireUserIdAction()
  db.prepare(
    "UPDATE investments SET is_closed=1, closed_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND user_id=?"
  ).run(id, userId)
  redirect(`/investasi/aset/${id}`)
}

export async function reopenInvestmentDirect(id: string) {
  const userId = await requireUserIdAction()
  db.prepare(
    "UPDATE investments SET is_closed=0, closed_at=NULL, updated_at=datetime('now') WHERE id=? AND user_id=?"
  ).run(id, userId)
  redirect(`/investasi/aset/${id}`)
}

// ── Transaction helpers ───────────────────────────────────────────────────────

function execAddInvestmentTransaction(investmentId: string, userId: string, formData: FormData) {
  const inv = db.prepare(
    "SELECT id FROM investments WHERE id=? AND user_id=? AND is_active=1 AND is_closed=0"
  ).get(investmentId, userId)
  if (!inv) throw new Error("Aset tidak ditemukan atau sudah ditutup")

  const type         = formData.get("type") as string
  const goalId       = (formData.get("goal_id") as string) || null
  const quantity     = (formData.get("quantity") as string)?.trim() || "1"
  const numericQty   = parseFloat(quantity) || 1
  const totalAmount  = parseFloat(formData.get("total_amount") as string)
  const pricePerUnit = totalAmount / numericQty
  const date         = formData.get("date") as string
  const fromWalletId = (formData.get("from_wallet_id") as string) || null
  const toWalletId   = (formData.get("to_wallet_id")   as string) || null
  const notes        = (formData.get("notes") as string)?.trim() || null
  const isInitial    = formData.get("is_initial") === "true" ? 1 : 0

  if (!["BUY", "SELL", "DIVIDEND"].includes(type)) throw new Error("Tipe tidak valid")
  if (isNaN(totalAmount) || totalAmount <= 0)       throw new Error("Harga transaksi tidak valid")
  if (!date)                                        throw new Error("Tanggal wajib diisi")
  if (type === "BUY"      && !fromWalletId)         throw new Error("Dompet asal wajib diisi untuk BUY")
  if (type === "SELL"     && !toWalletId)           throw new Error("Dompet tujuan wajib diisi untuk SELL")
  if (type === "DIVIDEND" && !toWalletId)           throw new Error("Dompet tujuan wajib diisi untuk DIVIDEND")
  if (type === "BUY"      && !goalId)               throw new Error("Kantong wajib dipilih untuk transaksi BUY")

  if (goalId) {
    const goal = db.prepare("SELECT id FROM investment_goals WHERE id=? AND user_id=? AND is_active=1").get(goalId, userId)
    if (!goal) throw new Error("Kantong tidak ditemukan")
  }

  const txYear = new Date(date).getFullYear()

  db.transaction(() => {
    if (type === "BUY" && fromWalletId) {
      const w = db.prepare("SELECT balance, user_id FROM wallets WHERE id=? AND is_active=1").get(fromWalletId) as { balance: number; user_id: string } | undefined
      if (!w || w.user_id !== userId) throw new Error("Dompet tidak ditemukan")
      if (!isInitial && w.balance < totalAmount) {
        throw new Error(`Saldo tidak mencukupi. Tersedia: ${formatRupiah(w.balance)}`)
      }
      if (!isInitial) db.prepare("UPDATE wallets SET balance = balance - ? WHERE id = ?").run(totalAmount, fromWalletId)
    }
    if ((type === "SELL" || type === "DIVIDEND") && toWalletId) {
      const w = db.prepare("SELECT user_id FROM wallets WHERE id=? AND is_active=1").get(toWalletId) as { user_id: string } | undefined
      if (!w || w.user_id !== userId) throw new Error("Dompet tujuan tidak ditemukan")
      if (!isInitial) db.prepare("UPDATE wallets SET balance = balance + ? WHERE id = ?").run(totalAmount, toWalletId)
    }
    db.prepare(
      "INSERT INTO investment_transactions (id, investment_id, goal_id, type, quantity, price_per_unit, total_amount, from_wallet_id, to_wallet_id, date, year, notes, is_initial) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(uuid(), investmentId, goalId, type, quantity, pricePerUnit, totalAmount, fromWalletId, toWalletId, date, txYear, notes, isInitial)
  })()
}

function execDeleteInvestmentTransaction(id: string, userId: string) {
  db.transaction(() => {
    const row = db.prepare(`
      SELECT it.type, it.total_amount, it.from_wallet_id, it.to_wallet_id, it.is_initial
      FROM investment_transactions it
      JOIN investments i ON i.id = it.investment_id
      WHERE it.id=? AND i.user_id=?
    `).get(id, userId) as { type: string; total_amount: number; from_wallet_id: string | null; to_wallet_id: string | null; is_initial: number } | undefined
    if (!row) throw new Error("Transaksi tidak ditemukan")

    if (!row.is_initial) {
      if (row.type === "BUY"                             && row.from_wallet_id) db.prepare("UPDATE wallets SET balance = balance + ? WHERE id = ?").run(row.total_amount, row.from_wallet_id)
      if ((row.type === "SELL" || row.type === "DIVIDEND") && row.to_wallet_id)  db.prepare("UPDATE wallets SET balance = balance - ? WHERE id = ?").run(row.total_amount, row.to_wallet_id)
    }
    db.prepare("DELETE FROM investment_transactions WHERE id=?").run(id)
  })()
}

export async function addInvestmentTransaction(investmentId: string, year: string, formData: FormData) {
  const userId = await requireUserIdAction()
  execAddInvestmentTransaction(investmentId, userId, formData)
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
  const userId = await requireUserIdAction()
  try {
    execAddInvestmentTransaction(investmentId, userId, formData)
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath("/dompet")
  revalidatePath("/investasi")
  revalidatePath("/dashboard")
  redirect(`/investasi/aset/${investmentId}`)
}

export async function deleteInvestmentTransaction(id: string, investmentId: string, year: string) {
  const userId = await requireUserIdAction()
  execDeleteInvestmentTransaction(id, userId)
  revalidatePath(`/rekap/${year}/investasi/${investmentId}`)
  revalidatePath("/dompet")
  revalidatePath("/investasi")
  revalidatePath("/dashboard")
}

export async function deleteInvestmentTransactionDirect(id: string, investmentId: string) {
  const userId = await requireUserIdAction()
  execDeleteInvestmentTransaction(id, userId)
  revalidatePath(`/investasi/aset/${investmentId}`)
  revalidatePath("/dompet")
  revalidatePath("/investasi")
  revalidatePath("/dashboard")
  refresh()
}
