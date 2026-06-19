import { BankInput, RatioValues } from './types'

function safeDiv(num: number, den: number): number {
  return den !== 0 ? num / den : 0
}

export function calcRatioValues(input: BankInput): RatioValues {
  const eps  = input.epsOverride  != null ? input.epsOverride  : safeDiv(input.netIncome,   input.sharesOutstanding)
  const bvps = input.bvpsOverride != null ? input.bvpsOverride : safeDiv(input.totalEquity, input.sharesOutstanding)

  // Profitabilitas
  const nim   = safeDiv(input.interestIncome - input.interestExpense, input.avgEarningAssets)
  const roa   = safeDiv(input.netIncome,  input.totalAssets)
  const roe   = safeDiv(input.netIncome,  input.totalEquity)
  const bopo  = safeDiv(input.operatingExpense, input.operatingIncome)

  // Kualitas Aset
  const nplGross     = safeDiv(input.nplGrossNominal, input.grossLoans)
  const nplNetNom    = Math.max(0, input.nplGrossNominal - input.ckpn)
  const nplNet       = safeDiv(nplNetNom, input.grossLoans)
  const coverageRatio = safeDiv(input.ckpn, input.nplGrossNominal)

  // Permodalan
  const car = safeDiv(input.tier1Capital + input.tier2Capital, input.rwa)

  // Likuiditas
  const ldr       = safeDiv(input.grossLoans, input.totalDpk)
  const casaRatio = safeDiv(input.currentAccount + input.savings, input.totalDpk)

  // Valuasi
  const pbv = bvps > 0 ? input.stockPrice / bvps : 0
  const per = eps  > 0 ? input.stockPrice / eps  : 0

  // Justified PBV: (ROE - g) / (CoE - g)
  const g   = input.growthRate
  const coe = input.costOfEquity
  const den = coe - g
  const justifiedPbv = den > 0 && roe > 0 ? (roe - g) / den : 0

  const marginOfSafety =
    justifiedPbv > 0 && pbv > 0 ? (justifiedPbv - pbv) / justifiedPbv : 0

  return {
    nim, roa, roe, bopo,
    nplGross, nplNet, coverageRatio,
    car, ldr, casaRatio,
    pbv, per,
    eps, bvps, justifiedPbv, marginOfSafety,
  }
}
