export type EnergySubsector = 'migas' | 'batubara' | 'ebt'

export const ENERGY_SUBSECTOR_LABELS: Record<EnergySubsector, string> = {
  migas:    'Minyak & Gas (Migas)',
  batubara: 'Batu Bara',
  ebt:      'Energi Baru Terbarukan',
}

export interface EnergyInput {
  stockCode:  string
  subsector:  EnergySubsector
  period:     string   // e.g. "FY 2024"
  prevPeriod: string   // e.g. "FY 2023"

  // Laba Rugi – Periode Ini (juta IDR)
  revenue:           number
  cogs:              number
  ebitda:            number | null  // opsional; dihitung dari operatingIncome + da jika null
  operatingIncome:   number         // EBIT — bisa negatif
  netIncome:         number         // bisa negatif
  operatingCashFlow: number
  capex:             number
  da:                number | null  // D&A (juta IDR)
  interestExpense:   number

  // Laba Rugi – Periode Lalu (juta IDR)
  prevRevenue: number

  // Neraca (juta IDR)
  totalAssets:        number
  totalEquity:        number
  totalDebt:          number
  currentAssets:      number
  currentLiabilities: number
  cashAndEquivalents: number

  // Valuasi
  stockPrice:        number
  sharesOutstanding: number        // juta lembar
  epsOverride:       number | null
  bvpsOverride:      number | null

  // Migas-specific
  totalReserves:        number | null  // MMBOE
  annualProduction:     number | null  // MMBOE/tahun
  prevAnnualProduction: number | null  // MMBOE/tahun

  // Batubara-specific
  productionVolume:     number | null  // juta ton
  prevProductionVolume: number | null  // juta ton
  avgSellingPrice:      number | null  // USD/ton
  cashCostPerTon:       number | null  // USD/ton

  // EBT-specific
  installedCapacity:   number | null  // MW
  energyGenerated:     number | null  // GWh/tahun
  prevEnergyGenerated: number | null  // GWh/tahun
}

export interface EnergyRatioValues {
  // Profitabilitas
  ebitdaMargin:  number
  netMargin:     number
  roe:           number
  roa:           number

  // Arus Kas
  fcf:            number
  fcfMargin:      number
  opCfMargin:     number
  capexToRevenue: number

  // Leverage
  debtToEbitda:     number | null  // null jika EBITDA ≤ 0
  interestCoverage: number | null  // null jika interestExpense = 0
  debtToEquity:     number
  currentRatio:     number

  // Valuasi
  eps:        number
  bvps:       number
  per:        number | null
  pbv:        number
  marketCap:  number
  ev:         number
  evToEbitda: number | null  // null jika EBITDA ≤ 0

  // Migas
  rli:              number | null  // Reserve Life Index (tahun)
  productionGrowth: number | null  // YoY

  // Batubara
  coalProductionGrowth: number | null  // YoY
  aspToCostRatio:       number | null  // ASP / Cash Cost

  // EBT
  capacityFactor:   number | null  // 0–1
  generationGrowth: number | null  // YoY
  revenuePerMw:     number | null  // IDR juta per MW
}

export interface EnergyRatioResult {
  value: number | null
  score: number | null  // null = N/A, tidak masuk scoring
}

export interface EnergyRatios {
  ebitdaMargin:     EnergyRatioResult
  netMargin:        EnergyRatioResult
  roe:              EnergyRatioResult
  roa:              EnergyRatioResult
  fcfMargin:        EnergyRatioResult
  opCfMargin:       EnergyRatioResult
  capexToRevenue:   EnergyRatioResult
  debtToEbitda:     EnergyRatioResult
  interestCoverage: EnergyRatioResult
  debtToEquity:     EnergyRatioResult
  currentRatio:     EnergyRatioResult
  pbv:              EnergyRatioResult
  per:              EnergyRatioResult       // informatif only
  evToEbitda:       EnergyRatioResult
  // Migas
  rli:              EnergyRatioResult
  productionGrowth: EnergyRatioResult
  // Batubara
  coalProductionGrowth: EnergyRatioResult
  aspToCostRatio:       EnergyRatioResult
  // EBT
  capacityFactor:   EnergyRatioResult
  generationGrowth: EnergyRatioResult
  revenuePerMw:     EnergyRatioResult
}

export interface EnergyCategoryScore {
  score:      number
  weight:     number
  validCount: number
  totalCount: number
}

export interface EnergyAnalysisResult {
  input:       EnergyInput
  subsector:   EnergySubsector
  ratioValues: EnergyRatioValues
  ratios:      EnergyRatios
  derivedValues: {
    eps:      number
    bvps:     number
    ebitda:   number
    marketCap: number
    ev:       number
    fcf:      number
  }
  categoryScores: {
    profitability: EnergyCategoryScore
    operations:   EnergyCategoryScore   // cadangan / produksi / kapasitas
    cashFlow:     EnergyCategoryScore
    leverage:     EnergyCategoryScore
    valuation:    EnergyCategoryScore
  }
  compositeScore: number
  label:          string
}
