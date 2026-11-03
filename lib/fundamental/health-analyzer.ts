import type {
  HealthAnalysisResult, HealthCategoryKey, HealthDerived, HealthInput, HealthRatio, HealthSubsector,
} from "./health-types"

// ── Konfigurasi ──────────────────────────────────────────────────────────────

export const HEALTH_CATEGORY_WEIGHTS: Record<HealthCategoryKey, number> = {
  profitability: 0.30,
  growth:        0.20,
  valuation:     0.20,
  leverage:      0.15,
  liquidity:     0.15,
}

export const HEALTH_CATEGORY_LABELS: Record<HealthCategoryKey, string> = {
  profitability: "Profitabilitas",
  growth:        "Pertumbuhan",
  valuation:     "Valuasi",
  leverage:      "Leverage",
  liquidity:     "Likuiditas",
}

export const HEALTH_SUBSECTOR_LABELS: Record<HealthSubsector, string> = {
  RS:      "Rumah Sakit",
  FARMASI: "Farmasi",
  ALKES:   "Alat Kesehatan",
}

/** Skala: nilai batas [buruk, cukup, baik, sangat baik] → skor 0, 35, 65, 95 */
type Scale = { dir: "higher" | "lower"; pts: [number, number, number, number] }

function scale(dir: "higher" | "lower", pts: [number, number, number, number]): Scale {
  return { dir, pts }
}

// Threshold dibedakan per subsektor untuk rasio yang sifat bisnisnya beda
const GROSS_MARGIN: Record<HealthSubsector, Scale> = {
  RS:      scale("higher", [0.20, 0.30, 0.40, 0.50]),
  FARMASI: scale("higher", [0.25, 0.35, 0.45, 0.55]),
  ALKES:   scale("higher", [0.25, 0.35, 0.45, 0.55]),
}
const EBITDA_MARGIN: Record<HealthSubsector, Scale> = {
  RS:      scale("higher", [0.10, 0.18, 0.25, 0.32]),
  FARMASI: scale("higher", [0.08, 0.14, 0.20, 0.28]),
  ALKES:   scale("higher", [0.08, 0.14, 0.20, 0.28]),
}
const PER_SCALE: Record<HealthSubsector, Scale> = {
  RS:      scale("lower", [45, 32, 22, 15]),
  FARMASI: scale("lower", [40, 28, 20, 14]),
  ALKES:   scale("lower", [45, 32, 22, 15]),
}

const STATIC: Record<string, Scale> = {
  netMargin:        scale("higher", [0.02, 0.06, 0.12, 0.18]),
  roe:              scale("higher", [0.04, 0.09, 0.15, 0.22]),
  roa:              scale("higher", [0.01, 0.04, 0.08, 0.12]),
  bor:              scale("higher", [0.40, 0.55, 0.65, 0.75]),
  rdIntensity:      scale("higher", [0.00, 0.01, 0.03, 0.06]),
  der:              scale("lower",  [2.00, 1.20, 0.60, 0.25]),
  interestCoverage: scale("higher", [1.50, 3.00, 6.00, 12.0]),
  netDebtEbitda:    scale("lower",  [4.00, 2.50, 1.20, 0.00]),
  cashRatio:        scale("higher", [0.10, 0.30, 0.60, 1.00]),
  revenueGrowth:    scale("higher", [0.00, 0.05, 0.10, 0.18]),
  netIncomeGrowth:  scale("higher", [-0.05, 0.05, 0.12, 0.25]),
  pbv:              scale("lower",  [5.0, 3.5, 2.2, 1.2]),
  evEbitda:         scale("lower",  [20, 14, 9, 6]),
  dividendYield:    scale("higher", [0.00, 0.01, 0.025, 0.045]),
}

const SCORE_AT = [0, 35, 65, 95] as const

function interpolate(v: number, s: Scale): number {
  const p = s.pts
  if (s.dir === "higher") {
    if (v <= p[0]) return 0
    if (v >= p[3]) return 100
    for (let i = 0; i < 3; i++) {
      if (v <= p[i + 1]) return SCORE_AT[i] + ((v - p[i]) / (p[i + 1] - p[i])) * (SCORE_AT[i + 1] - SCORE_AT[i])
    }
    return 100
  }
  // lower: titik batas menurun (buruk → bagus), makin kecil makin baik
  if (v >= p[0]) return 0
  if (v <= p[3]) return 100
  for (let i = 0; i < 3; i++) {
    if (v >= p[i + 1]) return SCORE_AT[i] + ((p[i] - v) / (p[i] - p[i + 1])) * (SCORE_AT[i + 1] - SCORE_AT[i])
  }
  return 100
}

/** Current ratio ideal di 1.5–2.5; terlalu rendah atau terlalu tinggi sama-sama dikurangi. */
function currentRatioScore(v: number): number {
  if (v >= 1.5 && v <= 2.5) return 100
  if (v < 1.5) return Math.max(0, ((v - 0.5) / 1.0) * 100)
  return Math.max(30, 100 - (v - 2.5) * 20)
}

// ── Label & seksi tampilan ───────────────────────────────────────────────────

export const HEALTH_SCORE_LABELS = [
  { min: 80, label: "Sangat Sehat", className: "bg-emerald-100 text-emerald-800" },
  { min: 65, label: "Sehat",        className: "bg-blue-100 text-blue-800" },
  { min: 50, label: "Cukup Sehat",  className: "bg-yellow-100 text-yellow-800" },
  { min: 35, label: "Kurang Sehat", className: "bg-orange-100 text-orange-800" },
  { min: 0,  label: "Tidak Sehat",  className: "bg-red-100 text-red-800" },
] as const

export function getHealthLabel(score: number) {
  return HEALTH_SCORE_LABELS.find((l) => score >= l.min)?.label ?? "Tidak Sehat"
}
export function getHealthLabelClass(score: number) {
  return HEALTH_SCORE_LABELS.find((l) => score >= l.min)?.className ?? "bg-red-100 text-red-800"
}

export type RatioFormat = "pct" | "x"
export const HEALTH_RATIO_META: Record<string, { label: string; format: RatioFormat; note?: string }> = {
  grossMargin:      { label: "Gross Margin",          format: "pct" },
  ebitdaMargin:     { label: "EBITDA Margin",         format: "pct" },
  netMargin:        { label: "Net Profit Margin",     format: "pct" },
  roe:              { label: "ROE",                   format: "pct" },
  roa:              { label: "ROA",                   format: "pct" },
  bor:              { label: "BOR (Okupansi Tempat Tidur)", format: "pct", note: "ideal 60–85%" },
  rdIntensity:      { label: "R&D / Pendapatan",      format: "pct" },
  revenueGrowth:    { label: "Pertumbuhan Pendapatan", format: "pct" },
  netIncomeGrowth:  { label: "Pertumbuhan Laba Bersih", format: "pct" },
  pbv:              { label: "PBV",                   format: "x" },
  per:              { label: "PER",                   format: "x" },
  evEbitda:         { label: "EV / EBITDA",           format: "x" },
  dividendYield:    { label: "Dividend Yield",        format: "pct" },
  der:              { label: "Debt to Equity",        format: "x", note: "ideal <60%" },
  interestCoverage: { label: "Interest Coverage",     format: "x" },
  netDebtEbitda:    { label: "Net Debt / EBITDA",     format: "x" },
  currentRatio:     { label: "Current Ratio",         format: "x", note: "ideal 1.5–2.5" },
  cashRatio:        { label: "Cash Ratio",            format: "x" },
}

export const HEALTH_RATIO_SECTIONS: Record<HealthCategoryKey, string[]> = {
  profitability: ["grossMargin", "ebitdaMargin", "netMargin", "roe", "roa", "bor", "rdIntensity"],
  growth:        ["revenueGrowth", "netIncomeGrowth"],
  valuation:     ["pbv", "per", "evEbitda", "dividendYield"],
  leverage:      ["der", "interestCoverage", "netDebtEbitda"],
  liquidity:     ["currentRatio", "cashRatio"],
}

// ── Analyzer ─────────────────────────────────────────────────────────────────

const safeDiv = (a: number, b: number, fallback = 0) => (b === 0 || !isFinite(b) || !isFinite(a) ? fallback : a / b)
const clamp = (v: number) => Math.max(0, Math.min(100, v))

export class HealthAnalyzer {
  analyze(input: HealthInput): HealthAnalysisResult {
    const sub = input.subsector
    const r = (value: number, s: Scale): HealthRatio => ({ value, score: clamp(interpolate(value, s)) })

    const eps  = safeDiv(input.netIncome, input.sharesOutstanding)      // juta / juta lembar = IDR/lembar
    const bvps = safeDiv(input.totalEquity, input.sharesOutstanding)
    const marketCap = input.stockPrice * input.sharesOutstanding        // juta IDR
    const ev = marketCap + input.totalDebt - input.cash

    const ratios: Record<string, HealthRatio> = {}

    // Profitabilitas
    ratios.grossMargin  = r(safeDiv(input.grossProfit, input.revenue), GROSS_MARGIN[sub])
    ratios.ebitdaMargin = r(safeDiv(input.ebitda, input.revenue), EBITDA_MARGIN[sub])
    ratios.netMargin    = r(safeDiv(input.netIncome, input.revenue), STATIC.netMargin)
    ratios.roe          = r(safeDiv(input.netIncome, input.totalEquity), STATIC.roe)
    ratios.roa          = r(safeDiv(input.netIncome, input.totalAssets), STATIC.roa)
    if (sub === "RS" && input.bor !== null) {
      // BOR terlalu tinggi (>85%) menandakan kapasitas penuh — tetap dinilai baik tapi tidak melebihi 100
      ratios.bor = r(input.bor, STATIC.bor)
    }
    if (sub !== "RS" && input.rdExpense !== null && input.revenue > 0) {
      ratios.rdIntensity = r(safeDiv(input.rdExpense, input.revenue), STATIC.rdIntensity)
    }

    // Pertumbuhan
    ratios.revenueGrowth   = r(input.prevRevenue > 0 ? input.revenue / input.prevRevenue - 1 : 0, STATIC.revenueGrowth)
    ratios.netIncomeGrowth = r(input.prevNetIncome > 0 ? input.netIncome / input.prevNetIncome - 1 : 0, STATIC.netIncomeGrowth)

    // Valuasi
    ratios.pbv           = r(safeDiv(input.stockPrice, bvps), STATIC.pbv)
    ratios.per           = eps > 0 ? r(input.stockPrice / eps, PER_SCALE[sub]) : { value: 0, score: 0 }
    ratios.evEbitda      = input.ebitda > 0 ? r(ev / input.ebitda, STATIC.evEbitda) : { value: 0, score: 0 }
    ratios.dividendYield = r(safeDiv(input.dividendPerShare, input.stockPrice), STATIC.dividendYield)

    // Leverage
    ratios.der = r(safeDiv(input.totalDebt, input.totalEquity), STATIC.der)
    ratios.interestCoverage = r(input.interestExpense > 0 ? input.operatingIncome / input.interestExpense : 15, STATIC.interestCoverage)
    ratios.netDebtEbitda = input.ebitda > 0
      ? r(Math.max(0, (input.totalDebt - input.cash) / input.ebitda), STATIC.netDebtEbitda)
      : { value: 0, score: 50 }

    // Likuiditas
    const cr = safeDiv(input.currentAssets, input.currentLiabilities, 1)
    ratios.currentRatio = { value: cr, score: clamp(currentRatioScore(cr)) }
    ratios.cashRatio    = r(safeDiv(input.cash, input.currentLiabilities), STATIC.cashRatio)

    // Skor kategori = rata-rata skor rasio yang ada
    const categoryScores = {} as HealthAnalysisResult["categoryScores"]
    let composite = 0
    for (const key of Object.keys(HEALTH_CATEGORY_WEIGHTS) as HealthCategoryKey[]) {
      const present = HEALTH_RATIO_SECTIONS[key].filter((k) => ratios[k])
      const score = present.length ? present.reduce((s, k) => s + ratios[k].score, 0) / present.length : 50
      categoryScores[key] = { score, weight: HEALTH_CATEGORY_WEIGHTS[key] }
      composite += score * HEALTH_CATEGORY_WEIGHTS[key]
    }

    // Justified PBV (Gordon Growth): (ROE − g) / (Ke − g)
    const roe = safeDiv(input.netIncome, input.totalEquity)
    const ke = input.costOfEquity
    const g = Math.min(input.growthRate, ke - 0.01)
    const justifiedPbv = ke > g ? Math.max(0, (roe - g) / (ke - g)) : 0
    const pbvActual = ratios.pbv.value
    const derived: HealthDerived = {
      eps, bvps, marketCap, enterpriseValue: ev,
      justifiedPbv,
      fairPrice: justifiedPbv * bvps,
      marginOfSafety: justifiedPbv > 0 ? (justifiedPbv - pbvActual) / justifiedPbv : 0,
      payoutRatio: eps > 0 ? input.dividendPerShare / eps : 0,
    }

    return {
      input, ratios, derivedValues: derived, categoryScores,
      compositeScore: composite, label: getHealthLabel(composite),
    }
  }
}
