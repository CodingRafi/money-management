import { type Scale, scale, interpolate, safeDiv, clamp } from "./scoring"
import type {
  InfraAnalysisResult, InfraCategoryKey, InfraDerived, InfraInput, InfraRatio, InfraSubsector,
} from "./infra-types"

// ── Konfigurasi ──────────────────────────────────────────────────────────────

export const INFRA_CATEGORY_WEIGHTS: Record<InfraCategoryKey, number> = {
  profitability: 0.25,
  leverage:      0.20,
  efficiency:    0.15,
  valuation:     0.15,
  liquidity:     0.15,
  growth:        0.10,
}

export const INFRA_CATEGORY_LABELS: Record<InfraCategoryKey, string> = {
  profitability: "Profitabilitas",
  leverage:      "Leverage",
  efficiency:    "Efisiensi & Arus Kas",
  valuation:     "Valuasi",
  liquidity:     "Likuiditas",
  growth:        "Pertumbuhan",
}

export const INFRA_SUBSECTOR_LABELS: Record<InfraSubsector, string> = {
  TOL:        "Jalan Tol, Pelabuhan & Bandara",
  KONSTRUKSI: "Konstruksi (Kontraktor)",
  UTILITAS:   "Utilitas & Menara Telekomunikasi",
}

/** Label, satuan, dan hint input metrik operasional per sub-sektor. */
export const INFRA_OPERATIONAL: Record<InfraSubsector, { label: string; unit: string; ratioKey: string }> = {
  TOL:        { label: "Pertumbuhan Lalu Lintas (LHR)", unit: "% per tahun (cth. 5)", ratioKey: "trafficGrowth" },
  KONSTRUKSI: { label: "Order Book (Backlog)",          unit: "juta IDR",             ratioKey: "orderBookCover" },
  UTILITAS:   { label: "Kapasitas / Okupansi Terpakai", unit: "% (cth. 75)",          ratioKey: "capacityUse" },
}

type PerSub = Record<InfraSubsector, Scale>

const OPERATING_MARGIN: PerSub = {
  TOL:        scale("higher", [0.15, 0.30, 0.45, 0.60]),
  KONSTRUKSI: scale("higher", [0.02, 0.05, 0.08, 0.12]),
  UTILITAS:   scale("higher", [0.15, 0.25, 0.35, 0.45]),
}
const EBITDA_MARGIN: PerSub = {
  TOL:        scale("higher", [0.30, 0.45, 0.60, 0.72]),
  KONSTRUKSI: scale("higher", [0.04, 0.08, 0.12, 0.17]),
  UTILITAS:   scale("higher", [0.30, 0.45, 0.60, 0.75]),
}
const ASSET_TURNOVER: PerSub = {
  TOL:        scale("higher", [0.05, 0.10, 0.18, 0.25]),
  KONSTRUKSI: scale("higher", [0.30, 0.50, 0.80, 1.10]),
  UTILITAS:   scale("higher", [0.08, 0.15, 0.25, 0.35]),
}
const DER: PerSub = {
  TOL:        scale("lower", [4.0, 2.5, 1.5, 0.8]),
  KONSTRUKSI: scale("lower", [3.0, 2.0, 1.2, 0.6]),
  UTILITAS:   scale("lower", [4.0, 2.5, 1.5, 0.8]),
}
const NET_DEBT_EBITDA: PerSub = {
  TOL:        scale("lower", [8, 6, 4, 2.5]),
  KONSTRUKSI: scale("lower", [6, 4, 2.5, 1]),
  UTILITAS:   scale("lower", [7, 5, 3.5, 2]),
}
const PBV: PerSub = {
  TOL:        scale("lower", [4.0, 2.8, 1.8, 1.0]),
  KONSTRUKSI: scale("lower", [3.0, 2.0, 1.2, 0.7]),
  UTILITAS:   scale("lower", [5.0, 3.5, 2.2, 1.3]),
}
const PER: PerSub = {
  TOL:        scale("lower", [30, 22, 15, 9]),
  KONSTRUKSI: scale("lower", [25, 16, 10, 6]),
  UTILITAS:   scale("lower", [35, 25, 17, 11]),
}
const EV_EBITDA: PerSub = {
  TOL:        scale("lower", [14, 11, 8, 6]),
  KONSTRUKSI: scale("lower", [10, 7, 5, 3]),
  UTILITAS:   scale("lower", [14, 11, 8, 6]),
}
const OPERATIONAL: Record<InfraSubsector, Scale> = {
  TOL:        scale("higher", [-0.02, 0.02, 0.05, 0.08]),  // pertumbuhan LHR
  KONSTRUKSI: scale("higher", [0.8, 1.5, 2.5, 3.5]),        // order book ÷ pendapatan (×)
  UTILITAS:   scale("higher", [0.50, 0.65, 0.78, 0.88]),    // kapasitas terpakai
}

const STATIC = {
  netMargin:        scale("higher", [0.00, 0.04, 0.09, 0.15]),
  roe:              scale("higher", [0.03, 0.07, 0.12, 0.18]),
  roa:              scale("higher", [0.005, 0.02, 0.04, 0.07]),
  interestCoverage: scale("higher", [1.2, 2.0, 3.5, 6.0]),
  cashConversion:   scale("higher", [0.0, 0.5, 0.9, 1.3]),   // arus kas operasi ÷ laba bersih
  currentRatio:     scale("higher", [0.6, 0.9, 1.2, 1.6]),
  cashRatio:        scale("higher", [0.10, 0.20, 0.40, 0.80]),
  revenueGrowth:    scale("higher", [0.00, 0.05, 0.10, 0.18]),
  netIncomeGrowth:  scale("higher", [-0.05, 0.05, 0.12, 0.25]),
  dividendYield:    scale("higher", [0.00, 0.01, 0.025, 0.045]),
}

export const INFRA_SCORE_LABELS = [
  { min: 80, label: "Sangat Sehat", className: "bg-emerald-100 text-emerald-800" },
  { min: 65, label: "Sehat",        className: "bg-blue-100 text-blue-800" },
  { min: 50, label: "Cukup Sehat",  className: "bg-yellow-100 text-yellow-800" },
  { min: 35, label: "Kurang Sehat", className: "bg-orange-100 text-orange-800" },
  { min: 0,  label: "Tidak Sehat",  className: "bg-red-100 text-red-800" },
] as const

export function getInfraLabel(score: number) {
  return INFRA_SCORE_LABELS.find((l) => score >= l.min)?.label ?? "Tidak Sehat"
}
export function getInfraLabelClass(score: number) {
  return INFRA_SCORE_LABELS.find((l) => score >= l.min)?.className ?? "bg-red-100 text-red-800"
}

export type RatioFormat = "pct" | "x"
export const INFRA_RATIO_META: Record<string, { label: string; format: RatioFormat; note?: string }> = {
  operatingMargin:  { label: "Operating Margin (EBIT)", format: "pct" },
  ebitdaMargin:     { label: "EBITDA Margin",           format: "pct" },
  netMargin:        { label: "Net Profit Margin",       format: "pct" },
  roe:              { label: "ROE",                     format: "pct" },
  roa:              { label: "ROA",                     format: "pct" },
  der:              { label: "Debt to Equity",          format: "x" },
  interestCoverage: { label: "Interest Coverage",       format: "x" },
  netDebtEbitda:    { label: "Net Debt / EBITDA",       format: "x" },
  assetTurnover:    { label: "Asset Turnover",          format: "x", note: "pendapatan ÷ total aset" },
  cashConversion:   { label: "Konversi Kas",            format: "x", note: "arus kas operasi ÷ laba bersih" },
  trafficGrowth:    { label: "Pertumbuhan Lalu Lintas", format: "pct" },
  orderBookCover:   { label: "Order Book ÷ Pendapatan", format: "x" },
  capacityUse:      { label: "Kapasitas Terpakai",      format: "pct" },
  revenueGrowth:    { label: "Pertumbuhan Pendapatan",  format: "pct" },
  netIncomeGrowth:  { label: "Pertumbuhan Laba Bersih", format: "pct" },
  pbv:              { label: "PBV",                     format: "x" },
  per:              { label: "PER",                     format: "x" },
  evEbitda:         { label: "EV / EBITDA",             format: "x" },
  dividendYield:    { label: "Dividend Yield",          format: "pct" },
  currentRatio:     { label: "Current Ratio",           format: "x" },
  cashRatio:        { label: "Cash Ratio",              format: "x" },
}

export const INFRA_RATIO_SECTIONS: Record<InfraCategoryKey, string[]> = {
  profitability: ["operatingMargin", "ebitdaMargin", "netMargin", "roe", "roa"],
  leverage:      ["der", "interestCoverage", "netDebtEbitda"],
  efficiency:    ["assetTurnover", "cashConversion", "trafficGrowth", "orderBookCover", "capacityUse"],
  valuation:     ["pbv", "per", "evEbitda", "dividendYield"],
  liquidity:     ["currentRatio", "cashRatio"],
  growth:        ["revenueGrowth", "netIncomeGrowth"],
}

// ── Analyzer ─────────────────────────────────────────────────────────────────

export class InfraAnalyzer {
  analyze(input: InfraInput): InfraAnalysisResult {
    const sub = input.subsector
    const r = (value: number, s: Scale): InfraRatio => ({ value, score: clamp(interpolate(value, s)) })

    // juta IDR ÷ juta lembar = IDR per lembar
    const eps  = safeDiv(input.netIncome, input.sharesOutstanding)
    const bvps = safeDiv(input.totalEquity, input.sharesOutstanding)
    const marketCap = input.stockPrice * input.sharesOutstanding
    const ev = marketCap + input.totalDebt - input.cash

    const ratios: Record<string, InfraRatio> = {}

    ratios.operatingMargin = r(safeDiv(input.operatingIncome, input.revenue), OPERATING_MARGIN[sub])
    ratios.ebitdaMargin    = r(safeDiv(input.ebitda, input.revenue), EBITDA_MARGIN[sub])
    ratios.netMargin       = r(safeDiv(input.netIncome, input.revenue), STATIC.netMargin)
    ratios.roe             = r(safeDiv(input.netIncome, input.totalEquity), STATIC.roe)
    ratios.roa             = r(safeDiv(input.netIncome, input.totalAssets), STATIC.roa)

    ratios.der = input.totalEquity > 0
      ? r(input.totalDebt / input.totalEquity, DER[sub])
      : { value: 0, score: 0 } // ekuitas negatif
    ratios.interestCoverage = r(input.interestExpense > 0 ? input.operatingIncome / input.interestExpense : 15, STATIC.interestCoverage)
    ratios.netDebtEbitda = input.ebitda > 0
      ? r(Math.max(0, (input.totalDebt - input.cash) / input.ebitda), NET_DEBT_EBITDA[sub])
      : { value: 0, score: 0 }

    ratios.assetTurnover  = r(safeDiv(input.revenue, input.totalAssets), ASSET_TURNOVER[sub])
    ratios.cashConversion = input.netIncome > 0
      ? r(input.operatingCashFlow / input.netIncome, STATIC.cashConversion)
      : { value: 0, score: input.operatingCashFlow > 0 ? 50 : 0 }
    if (input.operational !== null) {
      const key = INFRA_OPERATIONAL[sub].ratioKey
      const value = sub === "KONSTRUKSI" ? safeDiv(input.operational, input.revenue) : input.operational
      ratios[key] = r(value, OPERATIONAL[sub])
    }

    ratios.revenueGrowth = input.prevRevenue > 0
      ? r(input.revenue / input.prevRevenue - 1, STATIC.revenueGrowth)
      : { value: 0, score: 50 }
    ratios.netIncomeGrowth = input.prevNetIncome > 0
      ? r(input.netIncome / input.prevNetIncome - 1, STATIC.netIncomeGrowth)
      : { value: 0, score: 50 }

    ratios.pbv           = bvps > 0 ? r(input.stockPrice / bvps, PBV[sub]) : { value: 0, score: 0 }
    ratios.per           = eps > 0 ? r(input.stockPrice / eps, PER[sub]) : { value: 0, score: 0 }
    ratios.evEbitda      = input.ebitda > 0 ? r(ev / input.ebitda, EV_EBITDA[sub]) : { value: 0, score: 0 }
    ratios.dividendYield = r(safeDiv(input.dividendPerShare, input.stockPrice), STATIC.dividendYield)

    ratios.currentRatio = r(safeDiv(input.currentAssets, input.currentLiabilities, 1), STATIC.currentRatio)
    ratios.cashRatio    = r(safeDiv(input.cash, input.currentLiabilities), STATIC.cashRatio)

    const categoryScores = {} as InfraAnalysisResult["categoryScores"]
    let composite = 0
    for (const key of Object.keys(INFRA_CATEGORY_WEIGHTS) as InfraCategoryKey[]) {
      const present = INFRA_RATIO_SECTIONS[key].filter((k) => ratios[k])
      const score = present.length ? present.reduce((s, k) => s + ratios[k].score, 0) / present.length : 50
      categoryScores[key] = { score, weight: INFRA_CATEGORY_WEIGHTS[key] }
      composite += score * INFRA_CATEGORY_WEIGHTS[key]
    }

    // Justified PBV (Gordon Growth): (ROE − g) / (Ke − g)
    const roe = safeDiv(input.netIncome, input.totalEquity)
    const ke  = input.costOfEquity
    const g   = Math.min(input.growthRate, ke - 0.01)
    const justifiedPbv = ke > g ? Math.max(0, (roe - g) / (ke - g)) : 0
    const derived: InfraDerived = {
      eps, bvps, marketCap, enterpriseValue: ev,
      justifiedPbv,
      fairPrice: justifiedPbv * bvps,
      marginOfSafety: justifiedPbv > 0 ? (justifiedPbv - ratios.pbv.value) / justifiedPbv : 0,
      payoutRatio: eps > 0 ? input.dividendPerShare / eps : 0,
    }

    return {
      input, ratios, derivedValues: derived, categoryScores,
      compositeScore: composite, label: getInfraLabel(composite),
    }
  }
}
