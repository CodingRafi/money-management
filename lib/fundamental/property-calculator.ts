import type { PropertyInput, PropertyRatios, RatioResult } from "./property-types"
import { PROPERTY_RATIO_THRESHOLDS, ThresholdDefinition } from "./property-config"

/**
 * Calculate score based on threshold type
 */
function calculateScore(value: number, threshold: ThresholdDefinition): number {
  if (threshold.type === "higher") {
    if (value >= threshold.excellent) return 95 + Math.min(5, (value - threshold.excellent) * 2)
    if (value >= threshold.good) return 65 + ((value - threshold.good) / (threshold.excellent - threshold.good)) * 25
    if (value >= threshold.fair) return 35 + ((value - threshold.fair) / (threshold.good - threshold.fair)) * 30
    if (value >= threshold.poor) return Math.max(0, ((value - threshold.poor) / (threshold.fair - threshold.poor)) * 35)
    return Math.max(0, value / threshold.poor * 10)
  }

  if (threshold.type === "lower") {
    if (value <= threshold.excellent) return 95 + Math.max(0, 5 - (threshold.excellent - value) * 2)
    if (value <= threshold.good) return 65 + ((threshold.good - value) / (threshold.good - threshold.excellent)) * 30
    if (value <= threshold.fair) return 35 + ((threshold.fair - value) / (threshold.fair - threshold.good)) * 30
    if (value <= threshold.poor) return Math.max(0, ((threshold.poor - value) / (threshold.poor - threshold.fair)) * 35)
    return 0
  }

  // Optimal range
  const { optimalMin, optimalMax, goodMin, goodMax, fairMin, fairMax, poorBeyond } = threshold
  if (value >= optimalMin && value <= optimalMax) return 100
  if (value >= goodMin && value <= goodMax) {
    const mid = (goodMin + goodMax) / 2
    const range = (goodMax - goodMin) / 2
    return 75 + (1 - Math.abs(value - mid) / range) * 15
  }
  if (value >= fairMin && value <= fairMax) {
    const mid = (fairMin + fairMax) / 2
    const range = (fairMax - fairMin) / 2
    return 45 + (1 - Math.abs(value - mid) / range) * 20
  }
  if (value < fairMin) return Math.max(0, 45 * (value / fairMin))
  if (value > fairMax) return Math.max(0, 45 * (1 - (value - fairMax) / (poorBeyond - fairMax)))
  return 0
}

/**
 * Create a ratio result with value and score
 */
function createRatioResult(value: number, thresholdKey: string): RatioResult {
  const threshold = PROPERTY_RATIO_THRESHOLDS[thresholdKey]
  if (!threshold) {
    return { value, score: 50 }
  }
  return {
    value,
    score: Math.max(0, Math.min(100, calculateScore(value, threshold))),
  }
}

/**
 * Calculate all property ratios from input
 */
export function calculatePropertyRatios(input: PropertyInput): PropertyRatios {
  // Avoid division by zero
  const safeDiv = (a: number, b: number, defaultVal = 0): number => {
    if (b === 0 || !isFinite(b)) return defaultVal
    return a / b
  }

  // Profitability Ratios
  const gpm = createRatioResult(safeDiv(input.grossProfit, input.revenue), "gpm")
  const npm = createRatioResult(safeDiv(input.netIncome, input.revenue), "npm")
  const roa = createRatioResult(safeDiv(input.netIncome, input.totalAssets), "roa")
  const roe = createRatioResult(safeDiv(input.netIncome, input.totalEquity), "roe")

  // Leverage Ratios
  const der = createRatioResult(safeDiv(input.totalDebt, input.totalEquity), "der")
  const debtToAsset = createRatioResult(safeDiv(input.totalDebt, input.totalAssets), "debtToAsset")
  const interestCoverage = createRatioResult(
    input.interestExpense > 0 ? safeDiv(input.operatingIncome, input.interestExpense) : 10,
    "interestCoverage"
  )

  // Liquidity Ratios
  // Current Ratio = currentAssets / currentLiabilities
  const calcCurrentRatio = safeDiv(input.currentAssets, input.currentLiabilities, 1)
  const currentRatioResult = createRatioResult(calcCurrentRatio, "currentRatio")
  // Quick Ratio = (currentAssets - inventory) / currentLiabilities
  const quickAssets = input.currentAssets - input.inventory
  const calcQuickRatio = safeDiv(quickAssets, input.currentLiabilities, 0)
  const quickRatio = createRatioResult(calcQuickRatio, "quickRatio")

  // Valuation Ratios
  const eps = input.epsOverride ?? safeDiv(input.netIncome * 1000000, input.sharesOutstanding)
  const bvps = input.bvpsOverride ?? safeDiv(input.totalEquity * 1000000, input.sharesOutstanding)
  const pbv = createRatioResult(safeDiv(input.stockPrice, bvps), "pbv")
  const pe = createRatioResult(eps > 0 ? safeDiv(input.stockPrice, eps) : 0, "per")
  const dividendYield = createRatioResult(safeDiv(input.dividendPerShare, input.stockPrice), "dividendYield")

  // NAV for REITs
  const navps = input.navpsOverride ?? bvps // Default to BVPS if not specified
  const navYield = createRatioResult(safeDiv(input.stockPrice, navps), "navYield")

  // Growth Metrics (these are calculated from input data)
  // Note: For actual growth calculation, we'd need historical data
  // For now, we use the input growthRate
  const assetGrowth = createRatioResult(input.growthRate, "assetGrowth")
  const equityGrowth = createRatioResult(input.growthRate, "equityGrowth")

  return {
    gpm,
    npm,
    roa,
    roe,
    der,
    debtToAsset,
    interestCoverage,
    currentRatio: currentRatioResult,
    quickRatio,
    pbv,
    per: pe,
    dividendYield,
    navYield,
    assetGrowth,
    equityGrowth,
  }
}

/**
 * Calculate derived values for property analysis
 */
export function calculateDerivedValues(input: PropertyInput, ratios: PropertyRatios) {
  const safeDiv = (a: number, b: number, defaultVal = 0): number => {
    if (b === 0 || !isFinite(b)) return defaultVal
    return a / b
  }

  // EPS (IDR per share)
  const eps = input.epsOverride ?? safeDiv(input.netIncome * 1000000, input.sharesOutstanding)

  // BVPS (IDR per share)
  const bvps = input.bvpsOverride ?? safeDiv(input.totalEquity * 1000000, input.sharesOutstanding)

  // NAVPS - Net Asset Value per Share (important for REITs/property)
  // NAV = Total Assets - Total Liabilities (market value perspective)
  const netAssetValue = input.propertyValue > 0 ? input.propertyValue : input.totalAssets - input.totalLiabilities
  const navps = input.navpsOverride ?? safeDiv(netAssetValue * 1000000, input.sharesOutstanding)

  // PBV
  const pbv = safeDiv(input.stockPrice, bvps)

  // Justified PBV using Gordon Growth Model
  // Justified PBV = (ROE × (1 - g)) / (Ke - g)
  // Where: ROE = net income / equity, g = growth rate, Ke = cost of equity
  const roe = safeDiv(input.netIncome, input.totalEquity)
  const growthRate = Math.min(input.growthRate, input.costOfEquity - 0.01) // Can't be >= Ke
  const retentionRate = 1 - (input.dividendPerShare / eps) // Assuming constant dividend
  const justifiedPbv = (roe * retentionRate) / (input.costOfEquity - growthRate)

  // Margin of Safety
  // Based on PBV vs Justified PBV: (Justified PBV - Actual PBV) / Justified PBV
  const marginOfSafety = justifiedPbv > 0 ? (justifiedPbv - pbv) / justifiedPbv : 0

  // Dividend per year (juta IDR)
  const dividendPerYear = input.dividendPerShare * input.sharesOutstanding / 1000000

  // P/E ratio
  const pe = eps > 0 ? input.stockPrice / eps : 0

  // Enterprise Value (simplified)
  // EV = Market Cap + Total Debt - Cash
  const marketCap = input.stockPrice * input.sharesOutstanding * 1000000 / 1000000 // dalam juta
  const ev = marketCap + input.totalDebt - safeDiv(input.currentAssets, 1, 0)

  return {
    eps,
    bvps,
    navps,
    pvcp: safeDiv(input.stockPrice, safeDiv(navps, 1, input.stockPrice)), // Price to Value ratio
    justifiedPbv: isFinite(justifiedPbv) && justifiedPbv > 0 ? justifiedPbv : 0,
    marginOfSafety: isFinite(marginOfSafety) ? marginOfSafety : 0,
    dividendPerYear,
    pe,
    ev,
  }
}
