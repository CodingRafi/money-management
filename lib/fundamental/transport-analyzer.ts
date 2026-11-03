import { type Scale, scale, interpolate, safeDiv, clamp } from "./scoring"
import type {
  TransportAnalysisResult, TransportCategoryKey, TransportDerived, TransportInput,
  TransportRatio, TransportSubsector,
} from "./transport-types"

// ── Konfigurasi ──────────────────────────────────────────────────────────────

export const TRANSPORT_CATEGORY_WEIGHTS: Record<TransportCategoryKey, number> = {
  profitability: 0.25,
  leverage:      0.20,
  efficiency:    0.15,
  growth:        0.15,
  valuation:     0.15,
  liquidity:     0.10,
}

export const TRANSPORT_CATEGORY_LABELS: Record<TransportCategoryKey, string> = {
  profitability: "Profitabilitas",
  leverage:      "Leverage",
  efficiency:    "Efisiensi Aset",
  growth:        "Pertumbuhan",
  valuation:     "Valuasi",
  liquidity:     "Likuiditas",
}

export const TRANSPORT_SUBSECTOR_LABELS: Record<TransportSubsector, string> = {
  LOGISTIK:    "Logistik & Angkutan Darat",
  PELAYARAN:   "Pelayaran",
  PENERBANGAN: "Penerbangan",
}

export const TRANSPORT_UTILIZATION_LABEL: Record<TransportSubsector, string> = {
  LOGISTIK:    "Utilisasi Armada",
  PELAYARAN:   "Utilisasi Kapal",
  PENERBANGAN: "Load Factor (Seat)",
}

type PerSub = Record<TransportSubsector, Scale>

const OPERATING_MARGIN: PerSub = {
  LOGISTIK:    scale("higher", [0.02, 0.05, 0.09, 0.14]),
  PELAYARAN:   scale("higher", [0.03, 0.10, 0.18, 0.28]),
  PENERBANGAN: scale("higher", [-0.02, 0.03, 0.07, 0.12]),
}
const EBITDA_MARGIN: PerSub = {
  LOGISTIK:    scale("higher", [0.05, 0.09, 0.14, 0.20]),
  PELAYARAN:   scale("higher", [0.10, 0.20, 0.30, 0.42]),
  PENERBANGAN: scale("higher", [0.05, 0.12, 0.18, 0.25]),
}
const ASSET_TURNOVER: PerSub = {
  LOGISTIK:    scale("higher", [0.4, 0.8, 1.2, 1.8]),
  PELAYARAN:   scale("higher", [0.10, 0.20, 0.35, 0.50]),
  PENERBANGAN: scale("higher", [0.30, 0.50, 0.70, 0.90]),
}
const UTILIZATION: PerSub = {
  LOGISTIK:    scale("higher", [0.45, 0.60, 0.70, 0.80]),
  PELAYARAN:   scale("higher", [0.50, 0.65, 0.75, 0.85]),
  PENERBANGAN: scale("higher", [0.60, 0.70, 0.78, 0.85]),
}
const DER: PerSub = {
  LOGISTIK:    scale("lower", [2.0, 1.3, 0.8, 0.4]),
  PELAYARAN:   scale("lower", [2.5, 1.5, 1.0, 0.5]),
  PENERBANGAN: scale("lower", [4.0, 2.5, 1.5, 0.8]),
}
const NET_DEBT_EBITDA: PerSub = {
  LOGISTIK:    scale("lower", [4.0, 2.5, 1.2, 0.0]),
  PELAYARAN:   scale("lower", [6.0, 4.0, 2.5, 1.0]),
  PENERBANGAN: scale("lower", [7.0, 5.0, 3.0, 1.5]),
}
const PBV: PerSub = {
  LOGISTIK:    scale("lower", [4.0, 2.8, 1.8, 1.0]),
  PELAYARAN:   scale("lower", [2.5, 1.6, 1.0, 0.6]),
  PENERBANGAN: scale("lower", [4.0, 2.5, 1.5, 0.8]),
}
const PER: PerSub = {
  LOGISTIK:    scale("lower", [35, 24, 16, 10]),
  PELAYARAN:   scale("lower", [25, 16, 10, 6]),
  PENERBANGAN: scale("lower", [30, 20, 12, 7]),
}
const EV_EBITDA: PerSub = {
  LOGISTIK:    scale("lower", [14, 10, 7, 4.5]),
  PELAYARAN:   scale("lower", [10, 7, 4.5, 3]),
  PENERBANGAN: scale("lower", [10, 7, 5, 3.5]),
}

const STATIC = {
  netMargin:        scale("higher", [0.00, 0.03, 0.07, 0.12]),
  roe:              scale("higher", [0.03, 0.08, 0.14, 0.20]),
  roa:              scale("higher", [0.005, 0.03, 0.06, 0.09]),
  interestCoverage: scale("higher", [1.2, 2.5, 4.5, 8.0]),
  currentRatio:     scale("higher", [0.5, 0.8, 1.1, 1.5]),
  cashRatio:        scale("higher", [0.10, 0.25, 0.50, 0.90]),
  revenueGrowth:    scale("higher", [0.00, 0.05, 0.10, 0.18]),
  netIncomeGrowth:  scale("higher", [-0.05, 0.05, 0.12, 0.25]),
  dividendYield:    scale("higher", [0.00, 0.01, 0.025, 0.045]),
}

export const TRANSPORT_SCORE_LABELS = [
  { min: 80, label: "Sangat Sehat", className: "bg-emerald-100 text-emerald-800" },
  { min: 65, label: "Sehat",        className: "bg-blue-100 text-blue-800" },
  { min: 50, label: "Cukup Sehat",  className: "bg-yellow-100 text-yellow-800" },
  { min: 35, label: "Kurang Sehat", className: "bg-orange-100 text-orange-800" },
  { min: 0,  label: "Tidak Sehat",  className: "bg-red-100 text-red-800" },
] as const

export function getTransportLabel(score: number) {
  return TRANSPORT_SCORE_LABELS.find((l) => score >= l.min)?.label ?? "Tidak Sehat"
}
export function getTransportLabelClass(score: number) {
  return TRANSPORT_SCORE_LABELS.find((l) => score >= l.min)?.className ?? "bg-red-100 text-red-800"
}

export type RatioFormat = "pct" | "x"
export const TRANSPORT_RATIO_META: Record<string, { label: string; format: RatioFormat; note?: string }> = {
  operatingMargin:  { label: "Operating Margin (EBIT)", format: "pct" },
  ebitdaMargin:     { label: "EBITDA Margin",           format: "pct" },
  netMargin:        { label: "Net Profit Margin",       format: "pct" },
  roe:              { label: "ROE",                     format: "pct" },
  roa:              { label: "ROA",                     format: "pct" },
  assetTurnover:    { label: "Asset Turnover",          format: "x", note: "pendapatan ÷ total aset" },
  utilization:      { label: "Utilisasi / Load Factor", format: "pct" },
  revenueGrowth:    { label: "Pertumbuhan Pendapatan",  format: "pct" },
  netIncomeGrowth:  { label: "Pertumbuhan Laba Bersih", format: "pct" },
  der:              { label: "Debt to Equity",          format: "x" },
  interestCoverage: { label: "Interest Coverage",       format: "x" },
  netDebtEbitda:    { label: "Net Debt / EBITDA",       format: "x" },
  currentRatio:     { label: "Current Ratio",           format: "x" },
  cashRatio:        { label: "Cash Ratio",              format: "x" },
  pbv:              { label: "PBV",                     format: "x" },
  per:              { label: "PER",                     format: "x" },
  evEbitda:         { label: "EV / EBITDA",             format: "x" },
  dividendYield:    { label: "Dividend Yield",          format: "pct" },
}

export const TRANSPORT_RATIO_SECTIONS: Record<TransportCategoryKey, string[]> = {
  profitability: ["operatingMargin", "ebitdaMargin", "netMargin", "roe", "roa"],
  leverage:      ["der", "interestCoverage", "netDebtEbitda"],
  efficiency:    ["assetTurnover", "utilization"],
  growth:        ["revenueGrowth", "netIncomeGrowth"],
  valuation:     ["pbv", "per", "evEbitda", "dividendYield"],
  liquidity:     ["currentRatio", "cashRatio"],
}

// ── Analyzer ─────────────────────────────────────────────────────────────────

export class TransportAnalyzer {
  analyze(input: TransportInput): TransportAnalysisResult {
    const sub = input.subsector
    const r = (value: number, s: Scale): TransportRatio => ({ value, score: clamp(interpolate(value, s)) })

    // juta IDR ÷ juta lembar = IDR per lembar
    const eps  = safeDiv(input.netIncome, input.sharesOutstanding)
    const bvps = safeDiv(input.totalEquity, input.sharesOutstanding)
    const marketCap = input.stockPrice * input.sharesOutstanding
    const ev = marketCap + input.totalDebt - input.cash

    const ratios: Record<string, TransportRatio> = {}

    ratios.operatingMargin = r(safeDiv(input.operatingIncome, input.revenue), OPERATING_MARGIN[sub])
    ratios.ebitdaMargin    = r(safeDiv(input.ebitda, input.revenue), EBITDA_MARGIN[sub])
    ratios.netMargin       = r(safeDiv(input.netIncome, input.revenue), STATIC.netMargin)
    ratios.roe             = r(safeDiv(input.netIncome, input.totalEquity), STATIC.roe)
    ratios.roa             = r(safeDiv(input.netIncome, input.totalAssets), STATIC.roa)

    ratios.assetTurnover = r(safeDiv(input.revenue, input.totalAssets), ASSET_TURNOVER[sub])
    if (input.utilization !== null) ratios.utilization = r(input.utilization, UTILIZATION[sub])

    ratios.revenueGrowth = input.prevRevenue > 0
      ? r(input.revenue / input.prevRevenue - 1, STATIC.revenueGrowth)
      : { value: 0, score: 50 }
    ratios.netIncomeGrowth = input.prevNetIncome > 0
      ? r(input.netIncome / input.prevNetIncome - 1, STATIC.netIncomeGrowth)
      : { value: 0, score: 50 }

    ratios.der = input.totalEquity > 0
      ? r(input.totalDebt / input.totalEquity, DER[sub])
      : { value: 0, score: 0 } // ekuitas negatif
    ratios.interestCoverage = r(input.interestExpense > 0 ? input.operatingIncome / input.interestExpense : 15, STATIC.interestCoverage)
    ratios.netDebtEbitda = input.ebitda > 0
      ? r(Math.max(0, (input.totalDebt - input.cash) / input.ebitda), NET_DEBT_EBITDA[sub])
      : { value: 0, score: 0 }

    ratios.currentRatio = r(safeDiv(input.currentAssets, input.currentLiabilities, 1), STATIC.currentRatio)
    ratios.cashRatio    = r(safeDiv(input.cash, input.currentLiabilities), STATIC.cashRatio)

    ratios.pbv           = bvps > 0 ? r(input.stockPrice / bvps, PBV[sub]) : { value: 0, score: 0 }
    ratios.per           = eps > 0 ? r(input.stockPrice / eps, PER[sub]) : { value: 0, score: 0 }
    ratios.evEbitda      = input.ebitda > 0 ? r(ev / input.ebitda, EV_EBITDA[sub]) : { value: 0, score: 0 }
    ratios.dividendYield = r(safeDiv(input.dividendPerShare, input.stockPrice), STATIC.dividendYield)

    const categoryScores = {} as TransportAnalysisResult["categoryScores"]
    let composite = 0
    for (const key of Object.keys(TRANSPORT_CATEGORY_WEIGHTS) as TransportCategoryKey[]) {
      const present = TRANSPORT_RATIO_SECTIONS[key].filter((k) => ratios[k])
      const score = present.length ? present.reduce((s, k) => s + ratios[k].score, 0) / present.length : 50
      categoryScores[key] = { score, weight: TRANSPORT_CATEGORY_WEIGHTS[key] }
      composite += score * TRANSPORT_CATEGORY_WEIGHTS[key]
    }

    // Justified PBV (Gordon Growth): (ROE − g) / (Ke − g)
    const roe = safeDiv(input.netIncome, input.totalEquity)
    const ke  = input.costOfEquity
    const g   = Math.min(input.growthRate, ke - 0.01)
    const justifiedPbv = ke > g ? Math.max(0, (roe - g) / (ke - g)) : 0
    const derived: TransportDerived = {
      eps, bvps, marketCap, enterpriseValue: ev,
      justifiedPbv,
      fairPrice: justifiedPbv * bvps,
      marginOfSafety: justifiedPbv > 0 ? (justifiedPbv - ratios.pbv.value) / justifiedPbv : 0,
      payoutRatio: eps > 0 ? input.dividendPerShare / eps : 0,
    }

    return {
      input, ratios, derivedValues: derived, categoryScores,
      compositeScore: composite, label: getTransportLabel(composite),
    }
  }
}
