"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { requireWritableUserId } from "@/lib/scope"
import { financeService } from "@/services/finance.service"

export async function addTransfer(formData: FormData) {
  const userId       = await requireWritableUserId()
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

  await financeService.createTransfer(userId, {
    fromWalletId,
    toWalletId,
    amount,
    date,
    notes,
    month,
    year,
    isInitial: isInitial === 1,
  })

  revalidatePath("/dashboard")
  redirect(`/rekap/${year}?bulan=${month}&tab=transfer`)
}

export async function deleteTransfer(id: string, year: string, month: string) {
  const userId = await requireWritableUserId()
  await db.prepare("DELETE FROM transfers WHERE id=? AND user_id=?").run(id, userId)

  revalidatePath(`/rekap/${year}`)
  revalidatePath("/dompet")
  revalidatePath("/dashboard")
}
