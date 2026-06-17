"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { requireUserIdAction } from "@/lib/session"
import crypto from "crypto"

function uuid() { return crypto.randomUUID() }
function formatRupiah(n: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n) }

export async function addTransfer(formData: FormData) {
  const userId       = await requireUserIdAction()
  const fromWalletId = formData.get("from_wallet_id") as string
  const toWalletId   = formData.get("to_wallet_id")   as string
  const amount       = parseFloat(formData.get("amount") as string)
  const date         = formData.get("date") as string
  const notes        = (formData.get("notes") as string)?.trim() || null
  const month        = parseInt(formData.get("month") as string)
  const year         = parseInt(formData.get("year")  as string)
  const isInitial    = formData.get("is_initial") === "true" ? 1 : 0

  if (!fromWalletId || !toWalletId || !date)     throw new Error("Data tidak valid")
  if (isNaN(amount) || amount <= 0)              throw new Error("Jumlah transfer harus lebih dari 0")
  if (fromWalletId === toWalletId)               throw new Error("Dompet asal dan tujuan tidak boleh sama")

  db.transaction(() => {
    const fromWallet = db.prepare(
      "SELECT id, balance FROM wallets WHERE id = ? AND user_id = ? AND is_active = 1"
    ).get(fromWalletId, userId) as { id: string; balance: number } | undefined
    const toWallet = db.prepare(
      "SELECT id FROM wallets WHERE id = ? AND user_id = ? AND is_active = 1"
    ).get(toWalletId, userId) as { id: string } | undefined

    if (!fromWallet || !toWallet) throw new Error("Dompet tidak valid")

    if (!isInitial && fromWallet.balance < amount) {
      throw new Error(`Saldo tidak mencukupi. Tersedia: ${formatRupiah(fromWallet.balance)}`)
    }

    db.prepare(
      "INSERT INTO transfers (id, user_id, from_wallet_id, to_wallet_id, amount, date, month, year, notes, is_initial) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(uuid(), userId, fromWalletId, toWalletId, amount, date, month, year, notes, isInitial)

    if (!isInitial) {
      db.prepare("UPDATE wallets SET balance = balance - ? WHERE id = ?").run(amount, fromWalletId)
      db.prepare("UPDATE wallets SET balance = balance + ? WHERE id = ?").run(amount, toWalletId)
    }
  })()

  revalidatePath("/dashboard")
  redirect(`/rekap/${year}?bulan=${month}&tab=transfer`)
}

export async function deleteTransfer(id: string, year: string, month: string) {
  const userId = await requireUserIdAction()

  db.transaction(() => {
    const row = db.prepare(
      "SELECT from_wallet_id, to_wallet_id, amount, is_initial FROM transfers WHERE id=? AND user_id=?"
    ).get(id, userId) as { from_wallet_id: string; to_wallet_id: string; amount: number; is_initial: number } | undefined
    if (!row) throw new Error("Transfer tidak ditemukan")

    db.prepare("DELETE FROM transfers WHERE id=? AND user_id=?").run(id, userId)
    if (!row.is_initial) {
      db.prepare("UPDATE wallets SET balance = balance + ? WHERE id = ?").run(row.amount, row.from_wallet_id)
      db.prepare("UPDATE wallets SET balance = balance - ? WHERE id = ?").run(row.amount, row.to_wallet_id)
    }
  })()

  revalidatePath(`/rekap/${year}`)
  revalidatePath("/dompet")
  revalidatePath("/dashboard")
}
