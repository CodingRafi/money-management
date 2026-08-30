import type { PropertyRatios, RatioResult } from "./property-types"
import { PROPERTY_CATEGORY_WEIGHTS } from "./property-config"

/**
 * Get ratio value by key from PropertyRatios
 */
function getRatio(ratios: PropertyRatios, key: keyof PropertyRatios): RatioResult {
  return ratios[key] as RatioResult
}

/**
 * Calculate category score from ratio scores
 */
function calculateCategoryScore(ratioKeys: (keyof PropertyRatios)[], ratios: PropertyRatios): number {
  if (ratioKeys.length === 0) return 50

  const totalScore = ratioKeys.reduce((sum, key) => {
    const ratio = getRatio(ratios, key)
    return sum + ratio.score
  }, 0)

  return totalScore / ratioKeys.length
}

/**
 * Calculate all category scores for property analysis
 */
export function calculateCategoryScores(ratios: PropertyRatios) {
  // Profitability ratios
  const profitabilityScore = calculateCategoryScore(
    ["gpm", "npm", "roa", "roe"],
    ratios
  )

  // Leverage ratios
  const leverageScore = calculateCategoryScore(
    ["der", "debtToAsset", "interestCoverage"],
    ratios
  )

  // Liquidity ratios
  const liquidityScore = calculateCategoryScore(
    ["currentRatio", "quickRatio"],
    ratios
  )

  // Valuation ratios
  const valuationScore = calculateCategoryScore(
    ["pbv", "per", "dividendYield"],
    ratios
  )

  // Growth ratios
  const growthScore = calculateCategoryScore(
    ["assetGrowth", "equityGrowth"],
    ratios
  )

  return {
    profitability: {
      score: profitabilityScore,
      weight: PROPERTY_CATEGORY_WEIGHTS.profitability,
    },
    leverage: {
      score: leverageScore,
      weight: PROPERTY_CATEGORY_WEIGHTS.leverage,
    },
    liquidity: {
      score: liquidityScore,
      weight: PROPERTY_CATEGORY_WEIGHTS.liquidity,
    },
    valuation: {
      score: valuationScore,
      weight: PROPERTY_CATEGORY_WEIGHTS.valuation,
    },
    growth: {
      score: growthScore,
      weight: PROPERTY_CATEGORY_WEIGHTS.growth,
    },
  }
}

/**
 * Calculate composite score from category scores
 */
export function calculateCompositeScore(categoryScores: ReturnType<typeof calculateCategoryScores>): number {
  const { profitability, leverage, liquidity, valuation, growth } = categoryScores

  const weightedSum =
    profitability.score * profitability.weight +
    leverage.score * leverage.weight +
    liquidity.score * liquidity.weight +
    valuation.score * valuation.weight +
    growth.score * growth.weight

  return weightedSum
}
