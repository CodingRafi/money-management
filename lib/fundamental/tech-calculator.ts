import type { TechInput, TechRatioValues } from './tech-types'

function safeDiv(num: number, den: number): number {
  return den !== 0 && isFinite(den) ? num / den : 0
}

export function calcTechRatioValues(input: TechInput): TechRatioValues {
  const {
    revenue, cogs, operatingIncome, netIncome,
    operatingCashFlow, capex, da,
    prevRevenue, prevNetIncome,
    totalEquity, totalDebt, currentAssets, currentLiabilities,
    interestExpense, cashAndEquivalents,
    stockPrice, sharesOutstanding,
    epsOverride, bvpsOverride, growthRate, costOfEquity,
    arr, prevArr, gmv, prevGmv,
  } = input

  const eps  = epsOverride  != null ? epsOverride  : safeDiv(netIncome,  sharesOutstanding)
  const bvps = bvpsOverride != null ? bvpsOverride : safeDiv(totalEquity, sharesOutstanding)

  // Profitabilitas
  const grossMargin     = safeDiv(revenue - cogs, revenue)
  const operatingMargin = safeDiv(operatingIncome, revenue)
  const netMargin       = safeDiv(netIncome, revenue)
  const roe             = safeDiv(netIncome, totalEquity)

  // Pertumbuhan
  const revenueGrowth = safeDiv(revenue - prevRevenue, prevRevenue)
  const epsGrowth: number | null =
    prevNetIncome > 0 && netIncome > 0
      ? safeDiv(netIncome - prevNetIncome, prevNetIncome)
      : null

  // Arus Kas
  const fcf        = operatingCashFlow - capex
  const fcfMargin  = safeDiv(fcf, revenue)
  const opCfMargin = safeDiv(operatingCashFlow, revenue)

  // Kesehatan Neraca
  const debtToEquity     = safeDiv(totalDebt, totalEquity)
  const currentRatio     = safeDiv(currentAssets, currentLiabilities)
  const interestCoverage: number | null =
    interestExpense > 0 ? safeDiv(operatingIncome, interestExpense) : null

  // Valuasi
  const pe: number | null = eps > 0 ? safeDiv(stockPrice, eps) : null
  const pb = bvps > 0 ? safeDiv(stockPrice, bvps) : 0

  const marketCap = stockPrice * sharesOutstanding  // juta IDR
  const ev        = marketCap + totalDebt - cashAndEquivalents
  const ps        = safeDiv(marketCap, revenue)
  const evRevenue = safeDiv(ev, revenue)

  const ebitda   = da != null ? operatingIncome + da : operatingIncome
  const evEbitda: number | null = ebitda > 0 ? safeDiv(ev, ebitda) : null

  const peg: number | null =
    pe != null && revenueGrowth > 0 ? safeDiv(pe, revenueGrowth * 100) : null

  // SaaS
  const arrGrowth: number | null =
    arr != null && prevArr != null && prevArr > 0
      ? safeDiv(arr - prevArr, prevArr)
      : null

  const ruleOf40 = revenueGrowth + operatingMargin  // desimal

  // E-commerce
  const gmvGrowth: number | null =
    gmv != null && prevGmv != null && prevGmv > 0
      ? safeDiv(gmv - prevGmv, prevGmv)
      : null

  const takeRate: number | null =
    gmv != null && gmv > 0 ? safeDiv(revenue, gmv) : null

  return {
    grossMargin, operatingMargin, netMargin, roe,
    revenueGrowth, epsGrowth,
    fcf, fcfMargin, opCfMargin,
    debtToEquity, currentRatio, interestCoverage,
    eps, bvps, pe, pb, ps, peg,
    marketCap, ev, evRevenue, ebitda, evEbitda,
    arrGrowth, ruleOf40,
    gmvGrowth, takeRate,
  }
}
