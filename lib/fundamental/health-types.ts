export type HealthSubsector = "RS" | "FARMASI" | "ALKES"

export interface HealthInput {
  stockCode: string
  period: string
  subsector: HealthSubsector
  // Neraca (juta IDR)
  totalAssets: number
  totalEquity: number
  currentAssets: number
  currentLiabilities: number
  cash: number
  totalDebt: number
  // Laba Rugi (juta IDR)
  revenue: number
  grossProfit: number
  operatingIncome: number
  ebitda: number
  netIncome: number
  interestExpense: number
  // Periode pembanding (tahun sebelumnya, juta IDR)
  prevRevenue: number
  prevNetIncome: number
  // Operasional (opsional)
  bor: number | null          // Bed Occupancy Rate, desimal (0.65 = 65%) — rumah sakit
  rdExpense: number | null    // Beban R&D (juta IDR) — farmasi / alkes
  // Saham & valuasi
  stockPrice: number          // IDR per lembar
  sharesOutstanding: number   // juta lembar
  dividendPerShare: number    // IDR per lembar
  // Asumsi
  growthRate: number          // desimal
  costOfEquity: number        // desimal
}

export interface HealthRatio {
  value: number
  score: number
}

export type HealthCategoryKey = "profitability" | "leverage" | "liquidity" | "growth" | "valuation"

export interface HealthDerived {
  eps: number
  bvps: number
  marketCap: number       // juta IDR
  enterpriseValue: number // juta IDR
  justifiedPbv: number
  fairPrice: number       // IDR per lembar
  marginOfSafety: number
  payoutRatio: number
}

export interface HealthAnalysisResult {
  input: HealthInput
  ratios: Record<string, HealthRatio>
  derivedValues: HealthDerived
  categoryScores: Record<HealthCategoryKey, { score: number; weight: number }>
  compositeScore: number
  label: string
}
