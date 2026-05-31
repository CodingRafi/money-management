export type InvestmentTx = { type: string; total_amount: string }

export function calcProfitLoss(transactions: InvestmentTx[]) {
  const totalModal = transactions
    .filter((t) => t.type === "BUY")
    .reduce((sum, t) => sum + Number(t.total_amount), 0)

  const totalHasil = transactions
    .filter((t) => t.type === "SELL")
    .reduce((sum, t) => sum + Number(t.total_amount), 0)

  const profitLoss = totalHasil - totalModal

  const status =
    totalHasil === 0 ? "HOLDING" :
    profitLoss > 0   ? "PROFIT"  :
    profitLoss < 0   ? "LOSS"    : "BREAK_EVEN"

  return { totalModal, totalHasil, profitLoss, status }
}
