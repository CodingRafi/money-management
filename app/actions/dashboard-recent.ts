"use server"

import { LOCAL_USER_ID } from "@/lib/auth-simple"
import { getRecentCashflowTx, getRecentInvestmentTx, getRecentLoanTx } from "@/lib/dashboard"

export async function fetchRecentCashflow(days: number) {
  return await getRecentCashflowTx(LOCAL_USER_ID, days)
}

export async function fetchRecentInvestment(days: number) {
  return await getRecentInvestmentTx(LOCAL_USER_ID, days)
}

export async function fetchRecentLoan(days: number) {
  return await getRecentLoanTx(LOCAL_USER_ID, days)
}
