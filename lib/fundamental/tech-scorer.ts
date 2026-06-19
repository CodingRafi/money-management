import type { TechRatioValues, TechRatios, TechRatioResult } from './tech-types'
import type { TechConfig } from './tech-config'
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
    const span = t50 - t25 !== 0 ? t50 - t25 : 1
    return Math.max(0, lerp(25, 0, (t25 - value) / span))
  } else {
    if (value <= t100) return 100
    if (value <= t75)  return lerp(100, 75, (value - t100) / (t75  - t100))
    if (value <= t50)  return lerp(75,  50, (value - t75)  / (t50  - t75))
    if (value <= t25)  return lerp(50,  25, (value - t50)  / (t25  - t50))
    const span = t25 - t50 !== 0 ? t25 - t50 : 1
    return Math.max(0, lerp(25, 0, (value - t25) / span))
  }
}

function r(value: number | null, cfg: LinearRatioConfig | null | undefined): TechRatioResult {
  if (value === null || !isFinite(value as number) || cfg === null || cfg === undefined) {
    return { value, score: null }
  }
  return { value, score: round1(scoreLinear(value, cfg)) }
}

export function scoreTechRatios(values: TechRatioValues, config: TechConfig): TechRatios {
  const c = config.ratios
  return {
    grossMargin:     r(values.grossMargin,     c.grossMargin),
    operatingMargin: r(values.operatingMargin, c.operatingMargin),
    netMargin:       r(values.netMargin,       c.netMargin),
    roe:             r(values.roe,             c.roe),
    revenueGrowth:   r(values.revenueGrowth,   c.revenueGrowth),
    epsGrowth:       r(values.epsGrowth,       c.epsGrowth),
    fcfMargin:       r(values.fcfMargin,       c.fcfMargin),
    opCfMargin:      r(values.opCfMargin,      c.opCfMargin),
    debtToEquity:    r(values.debtToEquity,    c.debtToEquity),
    currentRatio:    r(values.currentRatio,    c.currentRatio),
    interestCoverage: r(values.interestCoverage, c.interestCoverage),
    pe:       r(values.pe,       null),   // informatif
    pb:       r(values.pb,       null),   // informatif
    ps:       r(values.ps,       c.ps),
    peg:      r(values.peg,      c.peg),
    evRevenue: r(values.evRevenue, c.evRevenue),
    evEbitda:  r(values.evEbitda,  null),  // informatif
    arrGrowth: r(values.arrGrowth, c.arrGrowth),
    ruleOf40:  r(values.ruleOf40,  c.ruleOf40),
    gmvGrowth: r(values.gmvGrowth, c.gmvGrowth),
    takeRate:  r(values.takeRate,  c.takeRate),
  }
}
