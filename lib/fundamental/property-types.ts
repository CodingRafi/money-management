export interface PropertyInput {
  stockCode: string
  period: string
  // Neraca (juta IDR)
  totalAssets: number
  totalEquity: number
  currentAssets: number
  currentLiabilities: number
  inventory: number
  totalDebt: number
  // Laba Rugi (juta IDR)
  revenue: number
  grossProfit: number
  operatingIncome: number
  netIncome: number
  interestExpense: number
  // Saham & Valuasi
  stockPrice: number           // IDR per saham
  sharesOutstanding: number    // juta lembar
  dividendPerShare: number     // IDR per saham
  epsOverride: number | null  // IDR per saham (jika null → dihitung otomatis)
  bvpsOverride: number | null // IDR per saham (jika null → dihitung otomatis)
  navpsOverride: number | null // NAV per saham (untuk REITs, opsional)
  // Growth Assumptions
  growthRate: number           // desimal: 0.12 untuk 12%
  costOfEquity: number        // desimal: 0.15 untuk 15%
  // Properti-specific
  propertyValue: number       // Nilai pasar properti (juta IDR) - untuk NAV
  totalLiabilities: number    // Total liabilities untuk analisis
}

export interface PropertyRatios {
  // Profitability
  gpm: RatioResult           // Gross Profit Margin
  npm: RatioResult           // Net Profit Margin
  roa: RatioResult           // Return on Assets
  roe: RatioResult           // Return on Equity
  // Leverage
  der: RatioResult           // Debt to Equity Ratio
  debtToAsset: RatioResult   // Debt to Asset Ratio
  interestCoverage: RatioResult // Interest Coverage Ratio
  // Liquidity
  currentRatio: RatioResult  // Current Ratio
  quickRatio: RatioResult    // Quick Ratio
  // Valuation
  pbv: RatioResult           // Price to Book Value
  per: RatioResult           // Price to Earnings Ratio
  dividendYield: RatioResult  // Dividend Yield
  // Growth & NAV
  navYield: RatioResult      // NAV Yield (untuk REITs)
  assetGrowth: RatioResult   // Asset Growth
  equityGrowth: RatioResult  // Equity Growth
}

export interface RatioResult {
  value: number
  score: number
}

export interface CategoryScore {
  score: number
  weight: number
}

export interface PropertyDerivedValues {
  eps: number              // Earnings per share
  bvps: number             // Book Value per share
  navps: number            // Net Asset Value per share (untuk REITs)
  pvcp: number             // Price to Value ratio (harga/nilai properti)
  justifiedPbv: number     // Justified PBV (Gordon Growth Model)
  marginOfSafety: number   // Margin of Safety
  dividendPerYear: number  // Dividen per tahun (juta IDR)
  pe: number               // Price to Earnings
  ev: number                // Enterprise Value (estimasi)
}

export interface PropertyAnalysisResult {
  input: PropertyInput
  ratios: PropertyRatios
  derivedValues: PropertyDerivedValues
  categoryScores: {
    profitability: CategoryScore
    leverage: CategoryScore
    liquidity: CategoryScore
    valuation: CategoryScore
    growth: CategoryScore
  }
  compositeScore: number
  label: string
}

export interface SectorAnalyzer<TInput, TResult> {
  analyze(input: TInput): TResult
}
