export type InfraSubsector = "TOL" | "KONSTRUKSI" | "UTILITAS"

export interface InfraInput {
  stockCode: string
  period: string
  subsector: InfraSubsector
  // Neraca (juta IDR)
  totalAssets: number
  totalEquity: number
  currentAssets: number
  currentLiabilities: number
  cash: number
  totalDebt: number
  // Laba Rugi & arus kas (juta IDR)
  revenue: number
  operatingIncome: number    // EBIT
  ebitda: number
  netIncome: number
  interestExpense: number
  operatingCashFlow: number
  // Periode pembanding (juta IDR)
  prevRevenue: number
  prevNetIncome: number
  /**
   * Metrik operasional opsional, maknanya tergantung sub-sektor:
   * TOL → pertumbuhan lalu lintas (desimal), KONSTRUKSI → order book (juta IDR),
   * UTILITAS → kapasitas/okupansi terpakai (desimal).
   */
  operational: number | null
  // Saham & valuasi
  stockPrice: number         // IDR per lembar
  sharesOutstanding: number  // juta lembar
  dividendPerShare: number   // IDR per lembar
  // Asumsi
  growthRate: number         // desimal
  costOfEquity: number       // desimal
}

export interface InfraRatio {
  value: number
  score: number
}

export type InfraCategoryKey =
  | "profitability" | "leverage" | "efficiency" | "growth" | "valuation" | "liquidity"

export interface InfraDerived {
  eps: number
  bvps: number
  marketCap: number
  enterpriseValue: number
  justifiedPbv: number
  fairPrice: number
  marginOfSafety: number
  payoutRatio: number
}

export interface InfraAnalysisResult {
  input: InfraInput
  ratios: Record<string, InfraRatio>
  derivedValues: InfraDerived
  categoryScores: Record<InfraCategoryKey, { score: number; weight: number }>
  compositeScore: number
  label: string
}
