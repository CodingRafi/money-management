export type InvestmentTx = { type: string; quantity: string; total_amount: string }

export const CATEGORY_UNIT: Record<string, string | null> = {
  "SAHAM":          "lot",
  "REKSA DANA":     "unit",
  "EMAS":           "gram",
  "KRIPTO":         "koin",
  "DEPOSITO":       null,
  "PASAR UANG":     null,
  "OBLIGASI / SBN": "lembar",
  "LAINNYA":        null,
}

const INTEGER_UNITS = new Set(["lot", "lembar"])

export function isIntegerUnit(unit: string | null | undefined): boolean {
  return !!unit && INTEGER_UNITS.has(unit)
}

export function showQuantityField(unit: string | null | undefined): boolean {
  return !!unit
}

export function calcProfitLoss(transactions: InvestmentTx[]) {
  const buyTxs      = transactions.filter((t) => t.type === "BUY")
  const sellTxs     = transactions.filter((t) => t.type === "SELL")
  const dividendTxs = transactions.filter((t) => t.type === "DIVIDEND")

  const totalModal   = buyTxs.reduce((s, t) => s + Number(t.total_amount), 0)
  const totalHasil   = sellTxs.reduce((s, t) => s + Number(t.total_amount), 0)
  const totalDividen = dividendTxs.reduce((s, t) => s + Number(t.total_amount), 0)
  const totalBuyQty  = buyTxs.reduce((s, t) => s + (parseFloat(t.quantity) || 0), 0)
  const totalSellQty = sellTxs.reduce((s, t) => s + (parseFloat(t.quantity) || 0), 0)

  // Average cost basis: cost assigned to sold units only
  const avgCostPerUnit  = totalBuyQty > 0 ? totalModal / totalBuyQty : 0
  const costOfSoldUnits = avgCostPerUnit * totalSellQty
  const profitLoss      = totalHasil - costOfSoldUnits
  const totalReturn     = profitLoss + totalDividen
  const buyCount        = buyTxs.length

  const status =
    totalHasil === 0 ? "HOLDING" :
    profitLoss > 0   ? "PROFIT"  :
    profitLoss < 0   ? "LOSS"    : "BREAK_EVEN"

  return { totalModal, totalHasil, totalDividen, profitLoss, totalReturn, status, avgCostPerUnit, buyCount, totalBuyQty, totalSellQty }
}
