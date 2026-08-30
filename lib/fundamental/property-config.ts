import type { PropertyInput } from "./property-types"

// Category weights (total = 100%)
export const PROPERTY_CATEGORY_WEIGHTS = {
  profitability: 0.25, // 25%
  leverage: 0.20,      // 20%
  liquidity: 0.15,     // 15%
  valuation: 0.25,     // 25%
  growth: 0.15,        // 15%
} as const

// Threshold definitions for each ratio
// Each threshold has: excellent, good, fair, poor boundaries
export interface ThresholdConfig {
  excellent: number  // Score 90-100
  good: number      // Score 65-90
  fair: number      // Score 35-65
  poor: number      // Score 0-35
}

// For "higher is better" metrics
export interface HigherIsBetterThresholds {
  type: "higher"
  excellent: number  // Min value for excellent
  good: number      // Min value for good
  fair: number      // Min value for fair
  poor: number      // Below poor = 0
}

// For "lower is better" metrics
export interface LowerIsBetterThresholds {
  type: "lower"
  excellent: number  // Max value for excellent
  good: number        // Max value for good
  fair: number        // Max value for fair
  poor: number        // Above poor = 0
}

// For "optimal range" metrics
export interface OptimalThresholds {
  type: "optimal"
  optimalMin: number  // Best if in this range
  optimalMax: number
  goodMin: number     // Acceptable range
  goodMax: number
  fairMin: number     // Marginal
  fairMax: number
  poorBeyond: number  // Outside this = 0
}

export type ThresholdDefinition = HigherIsBetterThresholds | LowerIsBetterThresholds | OptimalThresholds

// Property-specific thresholds (Indonesian property industry standards)
export const PROPERTY_RATIO_THRESHOLDS: Record<string, ThresholdDefinition> = {
  // Profitability Ratios (higher is better)
  gpm: {
    type: "higher",
    excellent: 0.40,  // >40% = excellent
    good: 0.25,       // 25-40% = good
    fair: 0.15,       // 15-25% = fair
    poor: 0.05,       // <5% = poor
  },
  npm: {
    type: "higher",
    excellent: 0.20,  // >20% = excellent
    good: 0.10,       // 10-20% = good
    fair: 0.05,       // 5-10% = fair
    poor: 0.01,       // <1% = poor
  },
  roa: {
    type: "higher",
    excellent: 0.08,  // >8% = excellent
    good: 0.04,       // 4-8% = good
    fair: 0.02,       // 2-4% = fair
    poor: 0.005,      // <0.5% = poor
  },
  roe: {
    type: "higher",
    excellent: 0.20,  // >20% = excellent
    good: 0.12,       // 12-20% = good
    fair: 0.05,       // 5-12% = fair
    poor: 0.02,       // <2% = poor
  },
  // Leverage Ratios
  der: {
    type: "lower",
    excellent: 0.50,  // <50% = excellent
    good: 1.00,       // 50-100% = good
    fair: 1.50,       // 100-150% = fair
    poor: 2.00,       // >150% = poor
  },
  debtToAsset: {
    type: "lower",
    excellent: 0.30,  // <30% = excellent
    good: 0.50,       // 30-50% = good
    fair: 0.70,       // 50-70% = fair
    poor: 0.85,       // >85% = poor
  },
  interestCoverage: {
    type: "higher",
    excellent: 5.00,  // >5x = excellent
    good: 3.00,       // 3-5x = good
    fair: 1.50,       // 1.5-3x = fair
    poor: 1.00,       // <1x = poor
  },
  // Liquidity Ratios (higher is better)
  currentRatio: {
    type: "optimal",
    optimalMin: 1.50,
    optimalMax: 2.50,
    goodMin: 1.20,
    goodMax: 3.00,
    fairMin: 1.00,
    fairMax: 3.50,
    poorBeyond: 4.00,
  },
  quickRatio: {
    type: "higher",
    excellent: 1.00,  // >1x = excellent
    good: 0.70,       // 0.7-1x = good
    fair: 0.50,       // 0.5-0.7x = fair
    poor: 0.30,       // <0.3x = poor
  },
  // Valuation Ratios (context-dependent)
  pbv: {
    type: "lower",
    excellent: 0.80,  // <0.8x = excellent (undervalued)
    good: 1.20,       // 0.8-1.2x = good (fair value)
    fair: 1.80,       // 1.2-1.8x = fair (slightly overvalued)
    poor: 2.50,       // >2.5x = poor (overvalued)
  },
  per: {
    type: "lower",
    excellent: 10.00, // <10x = excellent
    good: 15.00,      // 10-15x = good
    fair: 22.00,      // 15-22x = fair
    poor: 30.00,      // >30x = poor
  },
  dividendYield: {
    type: "higher",
    excellent: 0.08,  // >8% = excellent
    good: 0.05,       // 5-8% = good
    fair: 0.03,       // 3-5% = fair
    poor: 0.01,       // <1% = poor
  },
  navYield: {
    type: "higher",
    excellent: 0.10,  // >10% = excellent
    good: 0.07,       // 7-10% = good
    fair: 0.04,       // 4-7% = fair
    poor: 0.02,       // <2% = poor
  },
  // Growth Metrics (higher is better)
  assetGrowth: {
    type: "higher",
    excellent: 0.15,  // >15% = excellent
    good: 0.08,       // 8-15% = good
    fair: 0.03,       // 3-8% = fair
    poor: 0.00,       // <0% = poor
  },
  equityGrowth: {
    type: "higher",
    excellent: 0.15,  // >15% = excellent
    good: 0.08,       // 8-15% = good
    fair: 0.03,       // 3-8% = fair
    poor: 0.00,       // <0% = poor
  },
}

// Label definitions based on composite score
export const PROPERTY_SCORE_LABELS = [
  { min: 80, label: "Sangat Sehat", className: "bg-emerald-100 text-emerald-800" },
  { min: 65, label: "Sehat", className: "bg-blue-100 text-blue-800" },
  { min: 50, label: "Cukup Sehat", className: "bg-yellow-100 text-yellow-800" },
  { min: 35, label: "Kurang Sehat", className: "bg-orange-100 text-orange-800" },
  { min: 0,  label: "Tidak Sehat", className: "bg-red-100 text-red-800" },
] as const

export function getPropertyLabel(score: number): string {
  for (const { min, label } of PROPERTY_SCORE_LABELS) {
    if (score >= min) return label
  }
  return "Tidak Sehat"
}

export function getPropertyLabelClass(score: number): string {
  for (const { min, className } of PROPERTY_SCORE_LABELS) {
    if (score >= min) return className
  }
  return "bg-red-100 text-red-800"
}

// Category display labels
export const PROPERTY_CATEGORY_LABELS: Record<string, string> = {
  profitability: "Profitabilitas",
  leverage: "Leverage",
  liquidity: "Likuiditas",
  valuation: "Valuasi",
  growth: "Pertumbuhan",
}

// Ratio display labels and units
export const PROPERTY_RATIO_LABELS: Record<string, { label: string; unit: string; note?: string }> = {
  gpm: { label: "Gross Profit Margin", unit: "%" },
  npm: { label: "Net Profit Margin", unit: "%" },
  roa: { label: "Return on Assets", unit: "%" },
  roe: { label: "Return on Equity", unit: "%" },
  der: { label: "Debt to Equity", unit: "×", note: "ideal <100%" },
  debtToAsset: { label: "Debt to Asset", unit: "%" },
  interestCoverage: { label: "Interest Coverage", unit: "×" },
  currentRatio: { label: "Current Ratio", unit: "×", note: "ideal 1.5-2.5" },
  quickRatio: { label: "Quick Ratio", unit: "×" },
  pbv: { label: "PBV Aktual", unit: "×" },
  per: { label: "PER", unit: "×" },
  dividendYield: { label: "Dividend Yield", unit: "%" },
  navYield: { label: "NAV Yield", unit: "%" },
  assetGrowth: { label: "Pertumbuhan Aset", unit: "%" },
  equityGrowth: { label: "Pertumbuhan Ekuitas", unit: "%" },
}

// Section grouping for UI
export const PROPERTY_RATIO_SECTIONS: Record<string, string[]> = {
  "Profitabilitas (25%)": ["gpm", "npm", "roa", "roe"],
  "Leverage (20%)": ["der", "debtToAsset", "interestCoverage"],
  "Likuiditas (15%)": ["currentRatio", "quickRatio"],
  "Valuasi (25%)": ["pbv", "per", "dividendYield", "navYield"],
  "Pertumbuhan (15%)": ["assetGrowth", "equityGrowth"],
}
