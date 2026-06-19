import { BankInput, BankAnalysisResult, CategoryScore, SectorAnalyzer } from './types'
import { calcRatioValues } from './bank-calculator'
import { scoreBankRatios } from './bank-scorer'
import { BANK_CONFIG } from './bank-config'

function avg(scores: number[]): number {
  return round1(scores.reduce((s, n) => s + n, 0) / scores.length)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function getLabel(score: number): string {
  const t = BANK_CONFIG.compositeThresholds
  if (score >= t.sangatSehat)  return 'Sangat Sehat'
  if (score >= t.sehat)        return 'Sehat'
  if (score >= t.cukupSehat)   return 'Cukup Sehat'
  if (score >= t.kurangSehat)  return 'Kurang Sehat'
  return 'Tidak Sehat'
}

export class BankAnalyzer implements SectorAnalyzer<BankInput, BankAnalysisResult> {
  analyze(input: BankInput): BankAnalysisResult {
    const values = calcRatioValues(input)
    const ratios = scoreBankRatios(values)
    const w      = BANK_CONFIG.categoryWeights

    const assetQuality: CategoryScore = {
      weight: w.assetQuality,
      score:  avg([ratios.nplGross.score, ratios.nplNet.score, ratios.coverageRatio.score]),
    }
    const profitability: CategoryScore = {
      weight: w.profitability,
      score:  avg([ratios.nim.score, ratios.roa.score, ratios.roe.score, ratios.bopo.score]),
    }
    const capital: CategoryScore = {
      weight: w.capital,
      score:  ratios.car.score,
    }
    const liquidity: CategoryScore = {
      weight: w.liquidity,
      score:  avg([ratios.ldr.score, ratios.casaRatio.score]),
    }
    const valuation: CategoryScore = {
      weight: w.valuation,
      score:  ratios.pbv.score,
    }

    const compositeScore = round1(
      assetQuality.score  * w.assetQuality  +
      profitability.score * w.profitability +
      capital.score       * w.capital       +
      liquidity.score     * w.liquidity     +
      valuation.score     * w.valuation,
    )

    return {
      input,
      ratios,
      derivedValues: {
        eps:            values.eps,
        bvps:           values.bvps,
        justifiedPbv:   values.justifiedPbv,
        marginOfSafety: values.marginOfSafety,
      },
      categoryScores: { assetQuality, profitability, capital, liquidity, valuation },
      compositeScore,
      label: getLabel(compositeScore),
    }
  }
}
