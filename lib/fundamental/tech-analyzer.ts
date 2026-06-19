import type { TechInput, TechAnalysisResult, TechCategoryScore, SectorAnalyzer } from './tech-types'
import type { TechRatioKey } from './tech-config'
import { getTechConfig } from './tech-config'
import { calcTechRatioValues } from './tech-calculator'
import { scoreTechRatios } from './tech-scorer'

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function categoryScore(
  ratios: ReturnType<typeof scoreTechRatios>,
  keys: TechRatioKey[],
  weight: number,
): TechCategoryScore {
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

export class TechAnalyzer implements SectorAnalyzer<TechInput, TechAnalysisResult> {
  analyze(input: TechInput): TechAnalysisResult {
    const config      = getTechConfig(input.subsector)
    const ratioValues = calcTechRatioValues(input)
    const ratios      = scoreTechRatios(ratioValues, config)
    const cr          = config.categoryRatios
    const w           = config.categoryWeights

    const profitability = categoryScore(ratios, cr.profitability, w.profitability)
    const growth        = categoryScore(ratios, cr.growth,        w.growth)
    const cashFlow      = categoryScore(ratios, cr.cashFlow,      w.cashFlow)
    const balanceSheet  = categoryScore(ratios, cr.balanceSheet,  w.balanceSheet)
    const valuation     = categoryScore(ratios, cr.valuation,     w.valuation)

    const compositeScore = round1(
      profitability.score * w.profitability +
      growth.score        * w.growth        +
      cashFlow.score      * w.cashFlow      +
      balanceSheet.score  * w.balanceSheet  +
      valuation.score     * w.valuation,
    )

    return {
      input,
      subsector: input.subsector,
      ratioValues,
      ratios,
      categoryScores: { profitability, growth, cashFlow, balanceSheet, valuation },
      compositeScore,
      label: getLabel(compositeScore),
    }
  }
}
