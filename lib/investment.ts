export type InvestmentTx = { type: string; quantity: string; total_amount: string }

export function calcProfitLoss(transactions: InvestmentTx[]) {
  const buyTxs  = transactions.filter((t) => t.type === "BUY")
  const sellTxs = transactions.filter((t) => t.type === "SELL")

  const totalModal   = buyTxs.reduce((s, t) => s + Number(t.total_amount), 0)
  const totalHasil   = sellTxs.reduce((s, t) => s + Number(t.total_amount), 0)
  const totalBuyQty  = buyTxs.reduce((s, t) => s + Number(t.quantity), 0)
  const totalSellQty = sellTxs.reduce((s, t) => s + Number(t.quantity), 0)

  // Average cost basis: cost assigned to sold units only
  const avgCost         = totalBuyQty > 0 ? totalModal / totalBuyQty : 0
  const costOfSoldUnits = avgCost * totalSellQty
  const profitLoss      = totalHasil - costOfSoldUnits

  const status =
    totalHasil === 0 ? "HOLDING" :
    profitLoss > 0   ? "PROFIT"  :
    profitLoss < 0   ? "LOSS"    : "BREAK_EVEN"

  return { totalModal, totalHasil, profitLoss, status }
}
