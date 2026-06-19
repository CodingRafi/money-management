import { RatioValues, BankRatios, RatioResult } from './types'
import { BANK_CONFIG, LinearRatioConfig, LdrRatioConfig } from './bank-config'

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
    if (value >= t75)  return lerp(75, 100, (value - t75) / (t100 - t75))
    if (value >= t50)  return lerp(50, 75,  (value - t50) / (t75  - t50))
    if (value >= t25)  return lerp(25, 50,  (value - t25) / (t50  - t25))
    return Math.max(0, lerp(25, 0, (t25 - value) / (t50 - t25)))
  } else {
    if (value <= t100) return 100
    if (value <= t75)  return lerp(100, 75, (value - t100) / (t75  - t100))
    if (value <= t50)  return lerp(75,  50, (value - t75)  / (t50  - t75))
    if (value <= t25)  return lerp(50,  25, (value - t50)  / (t25  - t50))
    return Math.max(0, lerp(25, 0, (value - t25) / (t25 - t50)))
  }
}

function scoreLdr(value: number, cfg: LdrRatioConfig): number {
  const [floor, poorLow, fairLow, goodLow] = cfg.lowerBounds  // 0.60, 0.70, 0.75, 0.80
  const [goodHigh, fairHigh, poorHigh]     = cfg.upperBounds  // 0.90, 0.94, 1.00
  if (value < floor)    return 0
  if (value > poorHigh) return 25
  if (value >= goodLow && value <= goodHigh) return 100
  if ((value >= fairLow && value < goodLow) || (value > goodHigh && value <= fairHigh)) return 75
  if ((value >= poorLow && value < fairLow) || (value > fairHigh && value <= poorHigh)) return 50
  return 25
}

function r(value: number, score: number): RatioResult {
  return { value, score: round1(score) }
}

export function scoreBankRatios(values: RatioValues): BankRatios {
  const cfg = BANK_CONFIG.ratios
  return {
    nim:           r(values.nim,           scoreLinear(values.nim, cfg.nim)),
    roa:           r(values.roa,           scoreLinear(values.roa, cfg.roa)),
    roe:           r(values.roe,           scoreLinear(values.roe, cfg.roe)),
    bopo:          r(values.bopo,          scoreLinear(values.bopo, cfg.bopo)),
    nplGross:      r(values.nplGross,      scoreLinear(values.nplGross, cfg.nplGross)),
    nplNet:        r(values.nplNet,        scoreLinear(values.nplNet, cfg.nplNet)),
    coverageRatio: r(values.coverageRatio, scoreLinear(values.coverageRatio, cfg.coverageRatio)),
    car:           r(values.car,           scoreLinear(values.car, cfg.car)),
    ldr:           r(values.ldr,           scoreLdr(values.ldr, cfg.ldr)),
    casaRatio:     r(values.casaRatio,     scoreLinear(values.casaRatio, cfg.casaRatio)),
    // Skor PBV berdasarkan margin of safety vs justified PBV
    pbv:           r(values.pbv,           scoreLinear(values.marginOfSafety, cfg.mos)),
    per:           r(values.per,           0),  // PER hanya informatif
  }
}
