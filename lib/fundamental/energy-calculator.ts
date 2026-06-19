import type { EnergyInput, EnergyRatioValues } from './energy-types'

function safeDiv(num: number, den: number): number {
  return den !== 0 ? num / den : 0
}

export function calcEnergyRatioValues(input: EnergyInput): EnergyRatioValues {
  const ebitda = input.ebitda ?? (input.operatingIncome + (input.da ?? 0))
  const fcf    = input.operatingCashFlow - input.capex

  const eps       = input.epsOverride  ?? safeDiv(input.netIncome,  input.sharesOutstanding)
  const bvps      = input.bvpsOverride ?? safeDiv(input.totalEquity, input.sharesOutstanding)
  const marketCap = input.stockPrice * input.sharesOutstanding
  const ev        = marketCap + input.totalDebt - input.cashAndEquivalents

  // Profitabilitas
  const ebitdaMargin = safeDiv(ebitda, input.revenue)
  const netMargin    = safeDiv(input.netIncome, input.revenue)
  const roe          = safeDiv(input.netIncome, input.totalEquity)
  const roa          = safeDiv(input.netIncome, input.totalAssets)

  // Arus Kas
  const fcfMargin      = safeDiv(fcf, input.revenue)
  const opCfMargin     = safeDiv(input.operatingCashFlow, input.revenue)
  const capexToRevenue = safeDiv(input.capex, input.revenue)

  // Leverage
  const debtToEbitda     = ebitda > 0 ? input.totalDebt / ebitda : null
  const interestCoverage = input.interestExpense > 0 ? input.operatingIncome / input.interestExpense : null
  const debtToEquity     = safeDiv(input.totalDebt, input.totalEquity)
  const currentRatio     = safeDiv(input.currentAssets, input.currentLiabilities)

  // Valuasi
  const per       = eps  > 0 ? input.stockPrice / eps  : null
  const pbv       = bvps > 0 ? input.stockPrice / bvps : 0
  const evToEbitda = ebitda > 0 ? ev / ebitda : null

  // Migas — Reserve Life Index & Production Growth
  const rli = (input.totalReserves != null && input.annualProduction != null && input.annualProduction > 0)
    ? input.totalReserves / input.annualProduction
    : null

  const productionGrowth = (
    input.annualProduction != null &&
    input.prevAnnualProduction != null &&
    input.prevAnnualProduction > 0
  ) ? (input.annualProduction - input.prevAnnualProduction) / input.prevAnnualProduction : null

  // Batubara — Coal Production Growth & ASP/Cost Ratio
  const coalProductionGrowth = (
    input.productionVolume != null &&
    input.prevProductionVolume != null &&
    input.prevProductionVolume > 0
  ) ? (input.productionVolume - input.prevProductionVolume) / input.prevProductionVolume : null

  const aspToCostRatio = (
    input.avgSellingPrice != null &&
    input.cashCostPerTon != null &&
    input.cashCostPerTon > 0
  ) ? input.avgSellingPrice / input.cashCostPerTon : null

  // EBT — Capacity Factor, Generation Growth, Revenue per MW
  // capacityFactor = GWh generated / (MW * 8.76) where 8.76 = hours in year / 1000
  const capacityFactor = (
    input.installedCapacity != null &&
    input.energyGenerated != null &&
    input.installedCapacity > 0
  ) ? input.energyGenerated / (input.installedCapacity * 8.76) : null

  const generationGrowth = (
    input.energyGenerated != null &&
    input.prevEnergyGenerated != null &&
    input.prevEnergyGenerated > 0
  ) ? (input.energyGenerated - input.prevEnergyGenerated) / input.prevEnergyGenerated : null

  const revenuePerMw = (input.installedCapacity != null && input.installedCapacity > 0)
    ? input.revenue / input.installedCapacity
    : null

  return {
    ebitdaMargin, netMargin, roe, roa,
    fcf, fcfMargin, opCfMargin, capexToRevenue,
    debtToEbitda, interestCoverage, debtToEquity, currentRatio,
    eps, bvps, per, pbv, marketCap, ev, evToEbitda,
    rli, productionGrowth,
    coalProductionGrowth, aspToCostRatio,
    capacityFactor, generationGrowth, revenuePerMw,
  }
}
