export interface BankInput {
  stockCode: string
  period: string
  // Neraca (juta IDR)
  totalAssets: number
  totalEquity: number
  // Laba Rugi (juta IDR)
  netIncome: number
  interestIncome: number
  interestExpense: number
  avgEarningAssets: number
  // Efisiensi (juta IDR)
  operatingExpense: number
  operatingIncome: number
  // Kualitas Kredit (juta IDR)
  grossLoans: number
  nplGrossNominal: number
  ckpn: number
  // Permodalan (juta IDR)
  tier1Capital: number
  tier2Capital: number
  rwa: number
  // Likuiditas & DPK (juta IDR)
  totalDpk: number
  currentAccount: number
  savings: number
  // Valuasi
  stockPrice: number           // IDR per saham
  sharesOutstanding: number    // juta lembar
  epsOverride: number | null   // IDR per saham (jika null → dihitung otomatis)
  bvpsOverride: number | null  // IDR per saham (jika null → dihitung otomatis)
  growthRate: number           // desimal: 0.12 untuk 12%
  costOfEquity: number         // desimal: 0.15 untuk 15%
}

export interface RatioValues {
  nim: number
  roa: number
  roe: number
  bopo: number
  nplGross: number
  nplNet: number
  coverageRatio: number
  car: number
  ldr: number
  casaRatio: number
  pbv: number
  per: number
  // Derived
  eps: number
  bvps: number
  justifiedPbv: number
  marginOfSafety: number
}

export interface RatioResult {
  value: number
  score: number
}

export interface BankRatios {
  nim: RatioResult
  roa: RatioResult
  roe: RatioResult
  bopo: RatioResult
  nplGross: RatioResult
  nplNet: RatioResult
  coverageRatio: RatioResult
  car: RatioResult
  ldr: RatioResult
  casaRatio: RatioResult
  pbv: RatioResult
  per: RatioResult
}

export interface CategoryScore {
  score: number
  weight: number
}

export interface BankAnalysisResult {
  input: BankInput
  ratios: BankRatios
  derivedValues: {
    eps: number
    bvps: number
    justifiedPbv: number
    marginOfSafety: number
  }
  categoryScores: {
    assetQuality: CategoryScore
    profitability: CategoryScore
    capital: CategoryScore
    liquidity: CategoryScore
    valuation: CategoryScore
  }
  compositeScore: number
  label: string
}

export interface SectorAnalyzer<TInput, TResult> {
  analyze(input: TInput): TResult
}
