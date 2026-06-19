export type TechSubsector = 'general' | 'saas' | 'ecommerce'

export const TECH_SUBSECTOR_LABELS: Record<TechSubsector, string> = {
  general:   'Tech Umum',
  saas:      'SaaS / Software',
  ecommerce: 'E-Commerce',
}

export interface TechInput {
  stockCode:  string
  subsector:  TechSubsector
  period:     string  // periode ini, e.g. "FY 2024"
  prevPeriod: string  // periode lalu, e.g. "FY 2023"

  // Laba Rugi – Periode Ini (juta IDR)
  revenue:            number
  cogs:               number
  operatingIncome:    number  // EBIT – bisa negatif
  netIncome:          number  // bisa negatif
  operatingCashFlow:  number
  capex:              number
  da:                 number | null  // Depreciation & Amortization (opsional)

  // Laba Rugi – Periode Lalu (juta IDR)
  prevRevenue:   number
  prevNetIncome: number

  // Neraca (juta IDR)
  totalAssets:         number
  totalEquity:         number
  totalDebt:           number
  currentAssets:       number
  currentLiabilities:  number
  interestExpense:     number
  cashAndEquivalents:  number

  // Valuasi
  stockPrice:        number           // IDR per saham
  sharesOutstanding: number           // juta lembar
  epsOverride:       number | null    // IDR per saham
  bvpsOverride:      number | null
  growthRate:        number           // desimal
  costOfEquity:      number           // desimal

  // SaaS-specific (juta IDR)
  arr:     number | null
  prevArr: number | null

  // E-commerce-specific (juta IDR)
  gmv:     number | null
  prevGmv: number | null
}

export interface TechRatioValues {
  // Profitabilitas
  grossMargin:     number
  operatingMargin: number
  netMargin:       number
  roe:             number

  // Pertumbuhan
  revenueGrowth: number
  epsGrowth:     number | null  // null jika EPS salah satu periode ≤ 0

  // Arus Kas
  fcf:        number
  fcfMargin:  number
  opCfMargin: number

  // Kesehatan Neraca
  debtToEquity:      number
  currentRatio:      number
  interestCoverage:  number | null  // null jika interestExpense = 0

  // Valuasi
  eps:       number
  bvps:      number
  pe:        number | null  // null jika EPS ≤ 0
  pb:        number
  ps:        number
  peg:       number | null  // null jika P/E null atau growth ≤ 0
  marketCap: number         // juta IDR
  ev:        number         // juta IDR
  evRevenue: number
  ebitda:    number
  evEbitda:  number | null  // null jika EBITDA ≤ 0

  // SaaS
  arrGrowth: number | null
  ruleOf40:  number  // revenueGrowth + operatingMargin (desimal)

  // E-commerce
  gmvGrowth: number | null
  takeRate:  number | null
}

export interface TechRatioResult {
  value: number | null
  score: number | null  // null = N/A, tidak masuk scoring
}

export interface TechRatios {
  grossMargin:     TechRatioResult
  operatingMargin: TechRatioResult
  netMargin:       TechRatioResult
  roe:             TechRatioResult
  revenueGrowth:   TechRatioResult
  epsGrowth:       TechRatioResult
  fcfMargin:       TechRatioResult
  opCfMargin:      TechRatioResult
  debtToEquity:    TechRatioResult
  currentRatio:    TechRatioResult
  interestCoverage: TechRatioResult
  pe:       TechRatioResult
  pb:       TechRatioResult
  ps:       TechRatioResult
  peg:      TechRatioResult
  evRevenue: TechRatioResult
  evEbitda:  TechRatioResult
  arrGrowth: TechRatioResult
  ruleOf40:  TechRatioResult
  gmvGrowth: TechRatioResult
  takeRate:  TechRatioResult
}

export interface TechCategoryScore {
  score:      number  // 0 jika semua N/A
  weight:     number
  validCount: number  // rasio yang berhasil dihitung
  totalCount: number  // rasio yang seharusnya ada
}

export interface TechAnalysisResult {
  input:    TechInput
  subsector: TechSubsector
  ratioValues: TechRatioValues
  ratios:   TechRatios
  categoryScores: {
    profitability: TechCategoryScore
    growth:        TechCategoryScore
    cashFlow:      TechCategoryScore
    balanceSheet:  TechCategoryScore
    valuation:     TechCategoryScore
  }
  compositeScore: number
  label:          string
}

export interface SectorAnalyzer<TInput, TResult> {
  analyze(input: TInput): TResult
}
