"use server"

import { z } from "zod"
import { requireUserIdAction } from "@/lib/session"
import { getRecentCashflowTx, getRecentInvestmentTx, getRecentLoanTx } from "@/lib/dashboard"

const daysSchema = z.number().int().min(1).max(365)

export async function fetchRecentCashflow(days: number) {
  return await getRecentCashflowTx(await requireUserIdAction(), daysSchema.parse(days))
}

export async function fetchRecentInvestment(days: number) {
  return await getRecentInvestmentTx(await requireUserIdAction(), daysSchema.parse(days))
}

export async function fetchRecentLoan(days: number) {
  return await getRecentLoanTx(await requireUserIdAction(), daysSchema.parse(days))
}
