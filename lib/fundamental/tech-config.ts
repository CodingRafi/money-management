import type { LinearRatioConfig } from './bank-config'
import type { TechSubsector, TechRatios } from './tech-types'

export type TechRatioKey = keyof TechRatios

export interface TechConfig {
  subsector: TechSubsector
  ratios: Partial<Record<TechRatioKey, LinearRatioConfig | null>>
  categoryRatios: {
    profitability: TechRatioKey[]
    growth:        TechRatioKey[]
    cashFlow:      TechRatioKey[]
    balanceSheet:  TechRatioKey[]
    valuation:     TechRatioKey[]
  }
  categoryWeights: {
    profitability: number
    growth:        number
    cashFlow:      number
    balanceSheet:  number
    valuation:     number
  }
  compositeThresholds: {
    sangatBaik: number
    baik:       number
    cukupBaik:  number
    perhatian:  number
  }
}

// ── Shared thresholds ──────────────────────────────────────────────────────────

const D_E:   LinearRatioConfig = { direction: 'lower_better',  thresholds: [0.20, 0.50, 1.00, 2.00] }
const CR:    LinearRatioConfig = { direction: 'higher_better', thresholds: [3.00, 2.00, 1.50, 1.00] }
const IC:    LinearRatioConfig = { direction: 'higher_better', thresholds: [10.0, 5.00, 3.00, 1.50] }

// ── Tech Umum ─────────────────────────────────────────────────────────────────

export const TECH_GENERAL_CONFIG: TechConfig = {
  subsector: 'general',
  ratios: {
    grossMargin:     { direction: 'higher_better', thresholds: [0.60, 0.40, 0.20, 0.10] },
    operatingMargin: { direction: 'higher_better', thresholds: [0.20, 0.10, 0.05, 0.00] },
    netMargin:       { direction: 'higher_better', thresholds: [0.15, 0.10, 0.05, 0.00] },
    roe:             { direction: 'higher_better', thresholds: [0.20, 0.15, 0.10, 0.05] },
    revenueGrowth:   { direction: 'higher_better', thresholds: [0.30, 0.20, 0.10, 0.05] },
    epsGrowth:       { direction: 'higher_better', thresholds: [0.25, 0.15, 0.08, 0.00] },
    fcfMargin:       { direction: 'higher_better', thresholds: [0.20, 0.15, 0.08, 0.00] },
    opCfMargin:      { direction: 'higher_better', thresholds: [0.20, 0.12, 0.05, 0.00] },
    debtToEquity: D_E, currentRatio: CR, interestCoverage: IC,
    ps:  { direction: 'lower_better', thresholds: [2.00, 5.00, 10.0, 20.0] },
    peg: { direction: 'lower_better', thresholds: [0.50, 1.00, 1.50, 2.00] },
  },
  categoryRatios: {
    profitability: ['grossMargin', 'operatingMargin', 'netMargin', 'roe'],
    growth:        ['revenueGrowth', 'epsGrowth'],
    cashFlow:      ['fcfMargin', 'opCfMargin'],
    balanceSheet:  ['debtToEquity', 'currentRatio', 'interestCoverage'],
    valuation:     ['peg', 'ps'],
  },
  categoryWeights: { profitability: 0.25, growth: 0.25, cashFlow: 0.20, balanceSheet: 0.15, valuation: 0.15 },
  compositeThresholds: { sangatBaik: 80, baik: 65, cukupBaik: 50, perhatian: 35 },
}

// ── SaaS / Software ───────────────────────────────────────────────────────────

export const TECH_SAAS_CONFIG: TechConfig = {
  subsector: 'saas',
  ratios: {
    grossMargin:     { direction: 'higher_better', thresholds: [0.70, 0.60, 0.50, 0.40] },
    operatingMargin: { direction: 'higher_better', thresholds: [0.15, 0.05, -0.05, -0.15] },
    netMargin:       { direction: 'higher_better', thresholds: [0.12, 0.05, -0.05, -0.15] },
    roe:             { direction: 'higher_better', thresholds: [0.20, 0.12, 0.05, 0.00] },
    revenueGrowth:   { direction: 'higher_better', thresholds: [0.40, 0.25, 0.15, 0.08] },
    epsGrowth:       { direction: 'higher_better', thresholds: [0.30, 0.20, 0.10, 0.00] },
    fcfMargin:       { direction: 'higher_better', thresholds: [0.25, 0.15, 0.05, -0.05] },
    opCfMargin:      { direction: 'higher_better', thresholds: [0.20, 0.10, 0.00, -0.10] },
    debtToEquity: D_E, currentRatio: CR,
    ps:       { direction: 'lower_better', thresholds: [5.00, 12.0, 20.0, 30.0] },
    evRevenue: { direction: 'lower_better', thresholds: [5.00, 10.0, 20.0, 30.0] },
    arrGrowth: { direction: 'higher_better', thresholds: [0.50, 0.30, 0.20, 0.10] },
    ruleOf40:  { direction: 'higher_better', thresholds: [0.60, 0.40, 0.30, 0.20] },
  },
  categoryRatios: {
    profitability: ['grossMargin', 'operatingMargin'],
    growth:        ['revenueGrowth', 'arrGrowth', 'ruleOf40'],
    cashFlow:      ['fcfMargin'],
    balanceSheet:  ['debtToEquity', 'currentRatio'],
    valuation:     ['evRevenue', 'ps'],
  },
  categoryWeights: { profitability: 0.25, growth: 0.30, cashFlow: 0.15, balanceSheet: 0.15, valuation: 0.15 },
  compositeThresholds: { sangatBaik: 80, baik: 65, cukupBaik: 50, perhatian: 35 },
}

// ── E-Commerce / Platform ─────────────────────────────────────────────────────

export const TECH_ECOMMERCE_CONFIG: TechConfig = {
  subsector: 'ecommerce',
  ratios: {
    grossMargin:     { direction: 'higher_better', thresholds: [0.40, 0.25, 0.15, 0.05] },
    operatingMargin: { direction: 'higher_better', thresholds: [0.10, 0.05, 0.00, -0.10] },
    netMargin:       { direction: 'higher_better', thresholds: [0.08, 0.03, 0.00, -0.10] },
    roe:             { direction: 'higher_better', thresholds: [0.15, 0.10, 0.05, 0.00] },
    revenueGrowth:   { direction: 'higher_better', thresholds: [0.25, 0.15, 0.08, 0.03] },
    epsGrowth:       { direction: 'higher_better', thresholds: [0.25, 0.15, 0.08, 0.00] },
    fcfMargin:       { direction: 'higher_better', thresholds: [0.10, 0.05, 0.00, -0.10] },
    opCfMargin:      { direction: 'higher_better', thresholds: [0.12, 0.05, 0.00, -0.08] },
    debtToEquity: D_E, currentRatio: CR,
    ps:       { direction: 'lower_better', thresholds: [1.50, 4.00, 8.00, 15.0] },
    evRevenue: { direction: 'lower_better', thresholds: [2.00, 5.00, 10.0, 15.0] },
    gmvGrowth: { direction: 'higher_better', thresholds: [0.30, 0.20, 0.10, 0.05] },
    takeRate:  { direction: 'higher_better', thresholds: [0.10, 0.07, 0.04, 0.02] },
  },
  categoryRatios: {
    profitability: ['grossMargin', 'operatingMargin', 'takeRate'],
    growth:        ['gmvGrowth', 'revenueGrowth'],
    cashFlow:      ['fcfMargin'],
    balanceSheet:  ['debtToEquity', 'currentRatio'],
    valuation:     ['evRevenue', 'ps'],
  },
  categoryWeights: { profitability: 0.25, growth: 0.30, cashFlow: 0.20, balanceSheet: 0.15, valuation: 0.10 },
  compositeThresholds: { sangatBaik: 80, baik: 65, cukupBaik: 50, perhatian: 35 },
}

export function getTechConfig(subsector: TechSubsector): TechConfig {
  if (subsector === 'saas')      return TECH_SAAS_CONFIG
  if (subsector === 'ecommerce') return TECH_ECOMMERCE_CONFIG
  return TECH_GENERAL_CONFIG
}
