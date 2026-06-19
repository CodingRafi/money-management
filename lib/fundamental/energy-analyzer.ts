import type { EnergyInput, EnergyAnalysisResult, EnergyCategoryScore } from './energy-types'
import type { EnergyRatioKey } from './energy-config'
import { getEnergyConfig } from './energy-config'
import { calcEnergyRatioValues } from './energy-calculator'
import { scoreEnergyRatios } from './energy-scorer'

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function categoryScore(
  ratios: ReturnType<typeof scoreEnergyRatios>,
  keys: EnergyRatioKey[],
  weight: number,
): EnergyCategoryScore {
  const scores = keys.map((k) => ratios[k].score).filter((s): s is number => s !== null)
  const score  = scores.length > 0 ? round1(scores.reduce((s, n) => s + n, 0) / scores.length) : 0
  return { score, weight, validCount: scores.length, totalCount: keys.length }
}

function getLabel(score: number): string {
  if (score >= 80) return 'Sangat Baik'
  if (score >= 65) return 'Baik'
  if (score >= 50) return 'Cukup Baik'
  if (score >= 35) return 'Perlu Perhatian'
  return 'Berisiko Tinggi'
}

export class EnergyAnalyzer {
  analyze(input: EnergyInput): EnergyAnalysisResult {
    const config      = getEnergyConfig(input.subsector)
    const ratioValues = calcEnergyRatioValues(input)
    const ratios      = scoreEnergyRatios(ratioValues, config)
    const cr          = config.categoryRatios
    const w           = config.categoryWeights

    const profitability = categoryScore(ratios, cr.profitability, w.profitability)
    const operations    = categoryScore(ratios, cr.operations,    w.operations)
    const cashFlow      = categoryScore(ratios, cr.cashFlow,      w.cashFlow)
    const leverage      = categoryScore(ratios, cr.leverage,      w.leverage)
    const valuation     = categoryScore(ratios, cr.valuation,     w.valuation)

    const compositeScore = round1(
      profitability.score * w.profitability +
      operations.score    * w.operations    +
      cashFlow.score      * w.cashFlow      +
      leverage.score      * w.leverage      +
      valuation.score     * w.valuation,
    )

    const ebitda = input.ebitda ?? (input.operatingIncome + (input.da ?? 0))

    return {
      input,
      subsector: input.subsector,
      ratioValues,
      ratios,
      derivedValues: {
        eps:       ratioValues.eps,
        bvps:      ratioValues.bvps,
        ebitda,
        marketCap: ratioValues.marketCap,
        ev:        ratioValues.ev,
        fcf:       ratioValues.fcf,
      },
      categoryScores: { profitability, operations, cashFlow, leverage, valuation },
      compositeScore,
      label: getLabel(compositeScore),
    }
  }
}
