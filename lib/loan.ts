export type LoanStatus = "ONGOING" | "LUNAS" | "TERLAMBAT"
export type InterestType = "FLAT" | "REDUCING"
export type PaymentLikelihood = "LANCAR" | "MERAGUKAN" | "MACET"

export type LoanPaymentRow = {
  principal_paid: string
  interest_paid: string
  total_paid: string
}

export type LoanRow = {
  principal_amount: string
  interest_rate: string
  interest_type: InterestType
  due_date: string | null
  status: LoanStatus
}

export function calcLoanSummary(loan: LoanRow, payments: LoanPaymentRow[]) {
  const totalPrincipalPaid = payments.reduce((s, p) => s + Number(p.principal_paid), 0)
  const totalInterestPaid  = payments.reduce((s, p) => s + Number(p.interest_paid), 0)
  const totalPaid          = payments.reduce((s, p) => s + Number(p.total_paid), 0)
  const remainingPrincipal = Number(loan.principal_amount) - totalPrincipalPaid

  return {
    principalAmount:    Number(loan.principal_amount),
    totalPrincipalPaid,
    totalInterestPaid,
    totalPaid,
    remainingPrincipal,
    isLunas: remainingPrincipal <= 0,
  }
}

export function calcNextInterest(
  principalAmount: number,
  interestRate: number,
  interestType: InterestType,
  remainingPrincipal: number,
): number {
  if (interestRate === 0) return 0
  if (interestType === "FLAT") {
    return principalAmount * (interestRate / 100)
  }
  return remainingPrincipal * (interestRate / 100)
}

export function calcLoanStatus(dueDate: string | null, remainingPrincipal: number): LoanStatus {
  if (remainingPrincipal <= 0) return "LUNAS"
  if (dueDate && new Date() > new Date(dueDate)) return "TERLAMBAT"
  return "ONGOING"
}
