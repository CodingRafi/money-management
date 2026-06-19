export interface LinearRatioConfig {
  direction: 'higher_better' | 'lower_better'
  // higher_better: [min_untuk_100, min_untuk_75, min_untuk_50, min_untuk_25]
  // lower_better:  [max_untuk_100, max_untuk_75, max_untuk_50, max_untuk_25]
  thresholds: [number, number, number, number]
}

export interface LdrRatioConfig {
  direction: 'optimal_range'
  // lowerBounds: [floor, poor_lower, fair_lower, good_lower] = [0.60, 0.70, 0.75, 0.80]
  lowerBounds: [number, number, number, number]
  // upperBounds: [good_upper, fair_upper, poor_upper] = [0.90, 0.94, 1.00]
  upperBounds: [number, number, number]
}

export interface CategoryWeightConfig {
  assetQuality: number
  profitability: number
  capital: number
  liquidity: number
  valuation: number
}

export interface BankConfig {
  ratios: {
    nim: LinearRatioConfig
    roa: LinearRatioConfig
    roe: LinearRatioConfig
    bopo: LinearRatioConfig
    nplGross: LinearRatioConfig
    nplNet: LinearRatioConfig
    coverageRatio: LinearRatioConfig
    car: LinearRatioConfig
    ldr: LdrRatioConfig
    casaRatio: LinearRatioConfig
    // Skor PBV dihitung dari margin of safety (justifiedPBV vs actualPBV)
    mos: LinearRatioConfig
  }
  categoryWeights: CategoryWeightConfig
  compositeThresholds: {
    sangatSehat: number
    sehat: number
    cukupSehat: number
    kurangSehat: number
  }
}

export const BANK_CONFIG: BankConfig = {
  ratios: {
    nim: {
      direction: 'higher_better',
      thresholds: [0.06, 0.045, 0.03, 0.015],
    },
    roa: {
      direction: 'higher_better',
      thresholds: [0.025, 0.015, 0.01, 0.005],
    },
    roe: {
      direction: 'higher_better',
      thresholds: [0.18, 0.12, 0.08, 0.04],
    },
    bopo: {
      direction: 'lower_better',
      thresholds: [0.70, 0.80, 0.90, 0.95],
    },
    nplGross: {
      direction: 'lower_better',
      thresholds: [0.01, 0.02, 0.05, 0.08],
    },
    nplNet: {
      direction: 'lower_better',
      thresholds: [0.005, 0.01, 0.03, 0.05],
    },
    coverageRatio: {
      direction: 'higher_better',
      thresholds: [1.50, 1.00, 0.70, 0.40],
    },
    car: {
      direction: 'higher_better',
      thresholds: [0.20, 0.16, 0.12, 0.08],
    },
    ldr: {
      direction: 'optimal_range',
      lowerBounds: [0.60, 0.70, 0.75, 0.80],
      upperBounds: [0.90, 0.94, 1.00],
    },
    casaRatio: {
      direction: 'higher_better',
      thresholds: [0.65, 0.50, 0.35, 0.20],
    },
    mos: {
      direction: 'higher_better',
      thresholds: [0.30, 0.15, 0.00, -0.20],
    },
  },
  categoryWeights: {
    assetQuality: 0.30,
    profitability: 0.25,
    capital: 0.20,
    liquidity: 0.15,
    valuation: 0.10,
  },
  compositeThresholds: {
    sangatSehat: 80,
    sehat: 65,
    cukupSehat: 50,
    kurangSehat: 35,
  },
}
