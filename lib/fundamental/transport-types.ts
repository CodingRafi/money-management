export type TransportSubsector = "LOGISTIK" | "PELAYARAN" | "PENERBANGAN"

export interface TransportInput {
  stockCode: string
  period: string
  subsector: TransportSubsector
  // Neraca (juta IDR)
  totalAssets: number
  totalEquity: number
  currentAssets: number
  currentLiabilities: number
  cash: number
  totalDebt: number          // termasuk liabilitas sewa (lease)
  // Laba Rugi (juta IDR)
  revenue: number
  operatingIncome: number    // EBIT
  ebitda: number
  netIncome: number
  interestExpense: number
  // Periode pembanding (juta IDR)
  prevRevenue: number
  prevNetIncome: number
  // Operasional (opsional)
  utilization: number | null // desimal: load factor (penerbangan) / utilisasi armada
  // Saham & valuasi
  stockPrice: number         // IDR per lembar
  sharesOutstanding: number  // juta lembar
  dividendPerShare: number   // IDR per lembar
  // Asumsi
  growthRate: number         // desimal
  costOfEquity: number       // desimal
}

export interface TransportRatio {
  value: number
  score: number
}

export type TransportCategoryKey =
  | "profitability" | "efficiency" | "growth" | "leverage" | "liquidity" | "valuation"

export interface TransportDerived {
  eps: number
  bvps: number
  marketCap: number
  enterpriseValue: number
  justifiedPbv: number
  fairPrice: number
  marginOfSafety: number
  payoutRatio: number
}

export interface TransportAnalysisResult {
  input: TransportInput
  ratios: Record<string, TransportRatio>
  derivedValues: TransportDerived
  categoryScores: Record<TransportCategoryKey, { score: number; weight: number }>
  compositeScore: number
  label: string
}
