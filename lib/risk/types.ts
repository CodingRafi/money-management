/**
 * Tipe bersama engine risiko. Semua rasio/persentase di lapisan lib adalah
 * DESIMAL (0.12 = 12%), konsisten dengan lib/investment-metrics.ts.
 * Tampilan (UI) yang mengalikan 100.
 */

export type NavPoint = { date: string; value: number }

/** Arus kas pengguna ke portofolio: amount > 0 = setoran, < 0 = penarikan. */
export type Flow = { date: string; amount: number }

export type RiskMetrics = {
  // Return
  cagr: number | null
  twr: number | null
  totalReturn: number | null
  // Volatilitas & risk-adjusted
  volatility: number | null
  sharpe: number | null
  sortino: number | null
  calmar: number | null
  // Drawdown (maxDrawdown negatif, mis. -0.5)
  maxDrawdown: number | null
  maxDrawdownDurationDays: number | null
  currentDrawdown: number | null
  // Risiko tail — dinyatakan sebagai besaran kerugian POSITIF (bulanan, historikal)
  var95: number | null
  cvar95: number | null
  // Relatif terhadap benchmark
  beta: number | null
  alpha: number | null
  correlation: number | null
  trackingError: number | null
  informationRatio: number | null
  // Statistik
  bestMonth: number | null
  worstMonth: number | null
  positiveMonths: number | null
  months: number
}

export type AllocationItem = { investmentId: string; weight: number }

export type Rebalance = "NONE" | "MONTHLY" | "QUARTERLY" | "ANNUAL"
