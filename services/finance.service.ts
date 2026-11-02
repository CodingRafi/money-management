import crypto from "crypto"
import { db } from "@/lib/db"
import { calcNextInterest, calcLoanStatus, type InterestType } from "@/lib/loan"

export class FinanceError extends Error {}

function uuid() {
  return crypto.randomUUID()
}

export function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n)
}

export const financeService = {
  // ── Pinjaman ───────────────────────────────────────────────────────────────

  async createLoan(
    userId: string,
    v: {
      type: "PIUTANG" | "HUTANG"
      name: string
      description?: string | null
      principalAmount: number
      interestRate?: number
      interestType?: InterestType
      startDate: string
      dueDate?: string | null
      walletId: string
      isInitial?: boolean
      paymentLikelihood?: "LANCAR" | "MERAGUKAN" | "MACET" | null
    },
  ): Promise<string> {
    if (!["PIUTANG", "HUTANG"].includes(v.type)) throw new FinanceError("Tipe tidak valid")
    if (!v.name) throw new FinanceError("Nama wajib diisi")
    if (!Number.isFinite(v.principalAmount) || v.principalAmount <= 0) throw new FinanceError("Pokok tidak valid")
    if ((v.interestRate ?? 0) < 0) throw new FinanceError("Bunga tidak boleh negatif")
    if (!v.startDate) throw new FinanceError("Tanggal mulai wajib diisi")
    if (!v.walletId) throw new FinanceError("Dompet wajib dipilih")

    const id = uuid()
    await db.transaction(async () => {
      const wallet = await db.prepare(
        "SELECT user_id FROM wallets WHERE id=? AND is_active=1"
      ).get(v.walletId) as { user_id: string } | undefined
      if (!wallet || wallet.user_id !== userId) throw new FinanceError("Dompet tidak ditemukan")

      await db.prepare(
        `INSERT INTO loans (id, user_id, recorded_by, type, name, description, principal_amount, interest_rate, interest_type, start_date, due_date, wallet_id, is_initial, payment_likelihood)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, userId, userId, v.type, v.name, v.description ?? null, v.principalAmount,
        v.interestRate ?? 0, v.interestType ?? "FLAT", v.startDate, v.dueDate ?? null,
        v.walletId, v.isInitial ? 1 : 0,
        v.type === "PIUTANG" ? v.paymentLikelihood ?? null : null,
      )
    })
    return id
  },

  async addLoanPayment(
    userId: string,
    loanId: string,
    v: { principalPaid: number; date: string; notes?: string | null; isInitial?: boolean },
  ): Promise<string> {
    if (!Number.isFinite(v.principalPaid) || v.principalPaid <= 0) throw new FinanceError("Jumlah pokok tidak valid")
    if (!v.date) throw new FinanceError("Tanggal wajib diisi")

    await db.transaction(async () => {
      const loan = await db.prepare(
        "SELECT type, principal_amount, interest_rate, interest_type, due_date, wallet_id, user_id FROM loans WHERE id=? AND is_active=1"
      ).get(loanId) as {
        type: string; principal_amount: number; interest_rate: number
        interest_type: InterestType; due_date: string | null; wallet_id: string; user_id: string
      } | undefined
      if (!loan || loan.user_id !== userId) throw new FinanceError("Pinjaman tidak ditemukan")

      const paidRow = await db.prepare(
        "SELECT COALESCE(SUM(principal_paid), 0) AS total_pp FROM loan_payments WHERE loan_id=?"
      ).get(loanId) as { total_pp: number }
      const remainingPrincipal = loan.principal_amount - paidRow.total_pp

      if (v.principalPaid > remainingPrincipal) {
        throw new FinanceError(`Melebihi sisa pokok. Sisa: ${formatRupiah(remainingPrincipal)}`)
      }

      const interestPaid = calcNextInterest(
        loan.principal_amount, loan.interest_rate, loan.interest_type, remainingPrincipal,
      )
      const totalPaid = v.principalPaid + interestPaid

      const paymentId = uuid()
      await db.prepare(
        "INSERT INTO loan_payments (id, loan_id, principal_paid, interest_paid, total_paid, date, notes, is_initial) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(paymentId, loanId, v.principalPaid, interestPaid, totalPaid, v.date, v.notes ?? null, v.isInitial ? 1 : 0)

      const newRemaining = remainingPrincipal - v.principalPaid
      const newStatus = calcLoanStatus(loan.due_date, newRemaining)
      await db.prepare("UPDATE loans SET status=?, updated_at=NOW() WHERE id=?").run(newStatus, loanId)
      return paymentId
    })
    throw new FinanceError("Gagal menyimpan cicilan")
  },

  // ── Investasi ─────────────────────────────────────────────────────────────

  async createInvestment(
    userId: string,
    v: {
      name: string
      categoryId: string
      walletId?: string | null
      isLiquid?: boolean
      unit?: string | null
      notes?: string | null
    },
  ): Promise<string> {
    if (!v.name || !v.categoryId) throw new FinanceError("Data tidak valid")

    const id = uuid()
    await db.prepare(
      `INSERT INTO investments (id, user_id, recorded_by, category_id, name, wallet_id, is_liquid, unit, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, userId, v.categoryId, v.name, v.walletId ?? null, v.isLiquid ? 1 : 0, v.unit ?? null, v.notes ?? null)
    return id
  },

  async createInvestmentTransaction(
    userId: string,
    investmentId: string,
    v: {
      type: "BUY" | "SELL" | "DIVIDEND"
      quantity?: string
      totalAmount: number
      date: string
      goalId?: string | null
      fromWalletId?: string | null
      toWalletId?: string | null
      notes?: string | null
      isInitial?: boolean
    },
  ): Promise<string> {
    const inv = await db.prepare(
      "SELECT id, unit FROM investments WHERE id=? AND user_id=? AND is_active=1 AND is_closed=0"
    ).get(investmentId, userId) as { id: string; unit: string | null } | undefined
    if (!inv) throw new FinanceError("Aset tidak ditemukan atau sudah ditutup")

    const quantity = v.quantity?.trim() || "1"
    const numericQty = parseFloat(quantity) || 1
    const totalAmount = v.totalAmount
    const pricePerUnit = totalAmount / numericQty
    const isInitial = v.isInitial ? 1 : 0

    if (!["BUY", "SELL", "DIVIDEND"].includes(v.type)) throw new FinanceError("Tipe tidak valid")
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) throw new FinanceError("Harga transaksi tidak valid")
    if (!v.date) throw new FinanceError("Tanggal wajib diisi")
    if (v.type === "BUY" && !v.fromWalletId) throw new FinanceError("Dompet asal wajib diisi untuk BUY")
    if (v.type === "SELL" && !v.toWalletId) throw new FinanceError("Dompet tujuan wajib diisi untuk SELL")
    if (v.type === "DIVIDEND" && !v.toWalletId) throw new FinanceError("Dompet tujuan wajib diisi untuk DIVIDEND")
    if (v.type === "BUY" && !v.goalId) throw new FinanceError("Kantong wajib dipilih untuk transaksi BUY")

    const INTEGER_UNITS = new Set(["lot", "lembar"])
    if (inv.unit && INTEGER_UNITS.has(inv.unit) && v.type !== "DIVIDEND" && numericQty !== Math.floor(numericQty)) {
      throw new FinanceError(`Jumlah ${inv.unit} harus bilangan bulat`)
    }

    if (v.goalId) {
      const goal = await db.prepare(
        "SELECT id FROM investment_goals WHERE id=? AND user_id=? AND is_active=1"
      ).get(v.goalId, userId)
      if (!goal) throw new FinanceError("Kantong tidak ditemukan")
    }

    const txYear = new Date(v.date).getFullYear()
    const id = uuid()

    await db.transaction(async () => {
      if (v.type === "BUY" && v.fromWalletId) {
        const w = await db.prepare("SELECT user_id FROM wallets WHERE id=? AND is_active=1").get(v.fromWalletId) as { user_id: string } | undefined
        if (!w || w.user_id !== userId) throw new FinanceError("Dompet tidak ditemukan")
      }
      if ((v.type === "SELL" || v.type === "DIVIDEND") && v.toWalletId) {
        const w = await db.prepare("SELECT user_id FROM wallets WHERE id=? AND is_active=1").get(v.toWalletId) as { user_id: string } | undefined
        if (!w || w.user_id !== userId) throw new FinanceError("Dompet tujuan tidak ditemukan")
      }
      await db.prepare(
        `INSERT INTO investment_transactions (id, investment_id, goal_id, type, quantity, price_per_unit, total_amount, from_wallet_id, to_wallet_id, date, year, notes, is_initial)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, investmentId, v.goalId ?? null, v.type, quantity, pricePerUnit, totalAmount,
        v.fromWalletId ?? null, v.toWalletId ?? null, v.date, txYear, v.notes ?? null, isInitial)
    })
    return id
  },
}
