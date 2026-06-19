import type { EnergyRatioValues, EnergyRatios, EnergyRatioResult } from './energy-types'
import type { EnergyConfig } from './energy-config'
import type { LinearRatioConfig } from './bank-config'

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function scoreLinear(value: number, cfg: LinearRatioConfig): number {
  const [t100, t75, t50, t25] = cfg.thresholds
  if (cfg.direction === 'higher_better') {
    if (value >= t100) return 100
    if (value >= t75)  return lerp(75, 100, (value - t75)  / (t100 - t75))
    if (value >= t50)  return lerp(50, 75,  (value - t50)  / (t75  - t50))
    if (value >= t25)  return lerp(25, 50,  (value - t25)  / (t50  - t25))
    return Math.max(0, lerp(25, 0, (t25 - value) / (t50 - t25)))
  } else {
    if (value <= t100) return 100
    if (value <= t75)  return lerp(100, 75, (value - t100) / (t75  - t100))
    if (value <= t50)  return lerp(75,  50, (value - t75)  / (t50  - t75))
    if (value <= t25)  return lerp(50,  25, (value - t50)  / (t25  - t50))
    return Math.max(0, lerp(25, 0, (value - t25) / (t25 - t50)))
  }
}

function r(value: number | null, score: number | null): EnergyRatioResult {
  return { value, score: score !== null ? round1(score) : null }
}

function scoreIf(value: number | null, cfg: LinearRatioConfig | null | undefined): EnergyRatioResult {
  if (value === null || cfg == null) return r(value, null)
  return r(value, scoreLinear(value, cfg))
}

export function scoreEnergyRatios(values: EnergyRatioValues, config: EnergyConfig): EnergyRatios {
  const c = config.ratios
  return {
    ebitdaMargin:     scoreIf(values.ebitdaMargin,    c.ebitdaMargin),
    netMargin:        scoreIf(values.netMargin,        c.netMargin),
    roe:              scoreIf(values.roe,              c.roe),
    roa:              scoreIf(values.roa,              c.roa),
    fcfMargin:        scoreIf(values.fcfMargin,        c.fcfMargin),
    opCfMargin:       scoreIf(values.opCfMargin,       c.opCfMargin),
    capexToRevenue:   scoreIf(values.capexToRevenue,   c.capexToRevenue),
    debtToEbitda:     scoreIf(values.debtToEbitda,     c.debtToEbitda),
    interestCoverage: scoreIf(values.interestCoverage, c.interestCoverage),
    debtToEquity:     scoreIf(values.debtToEquity,     c.debtToEquity),
    currentRatio:     scoreIf(values.currentRatio,     c.currentRatio),
    pbv:              scoreIf(values.pbv,              c.pbv),
    per:              r(values.per, null),   // informatif only
    evToEbitda:       scoreIf(values.evToEbitda,       c.evToEbitda),
    // Migas
    rli:              scoreIf(values.rli,              c.rli),
    productionGrowth: scoreIf(values.productionGrowth, c.productionGrowth),
    // Batubara
    coalProductionGrowth: scoreIf(values.coalProductionGrowth, c.coalProductionGrowth),
    aspToCostRatio:       scoreIf(values.aspToCostRatio,       c.aspToCostRatio),
    // EBT
    capacityFactor:   scoreIf(values.capacityFactor,   c.capacityFactor),
    generationGrowth: scoreIf(values.generationGrowth, c.generationGrowth),
    revenuePerMw:     scoreIf(values.revenuePerMw,     c.revenuePerMw),
  }
}
