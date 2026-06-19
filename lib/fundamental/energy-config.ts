import type { LinearRatioConfig } from './bank-config'
import type { EnergySubsector, EnergyRatios } from './energy-types'

export type EnergyRatioKey = keyof EnergyRatios

export interface EnergyConfig {
  subsector: EnergySubsector
  ratios: Partial<Record<EnergyRatioKey, LinearRatioConfig | null>>
  categoryRatios: {
    profitability: EnergyRatioKey[]
    operations:   EnergyRatioKey[]
    cashFlow:     EnergyRatioKey[]
    leverage:     EnergyRatioKey[]
    valuation:    EnergyRatioKey[]
  }
  categoryWeights: {
    profitability: number
    operations:   number
    cashFlow:     number
    leverage:     number
    valuation:    number
  }
  compositeThresholds: {
    sangatBaik: number
    baik:       number
    cukupBaik:  number
    perhatian:  number
  }
}

// ── Shared configs ────────────────────────────────────────────────────────────

const IC_ENERGY: LinearRatioConfig = { direction: 'higher_better', thresholds: [8.00, 4.00, 2.50, 1.50] }
const DE_ENERGY: LinearRatioConfig = { direction: 'lower_better',  thresholds: [0.30, 0.70, 1.20, 2.00] }
const CR_ENERGY: LinearRatioConfig = { direction: 'higher_better', thresholds: [2.00, 1.50, 1.20, 1.00] }

// ── Migas (Minyak & Gas) ──────────────────────────────────────────────────────
// Contoh: ELSA, MEDCO, RUIS, ENRG
// Metrik kunci: RLI (Reserve Life Index), Production Growth, EBITDA Margin tinggi, FCF positif

export const ENERGY_MIGAS_CONFIG: EnergyConfig = {
  subsector: 'migas',
  ratios: {
    ebitdaMargin:    { direction: 'higher_better', thresholds: [0.50, 0.35, 0.20, 0.10] },
    netMargin:       { direction: 'higher_better', thresholds: [0.25, 0.15, 0.08, 0.02] },
    roe:             { direction: 'higher_better', thresholds: [0.20, 0.14, 0.08, 0.04] },
    roa:             { direction: 'higher_better', thresholds: [0.12, 0.08, 0.04, 0.02] },
    rli:             { direction: 'higher_better', thresholds: [15.0, 10.0, 7.00, 5.00] }, // tahun
    productionGrowth:{ direction: 'higher_better', thresholds: [0.10, 0.05, 0.00, -0.05] },
    fcfMargin:       { direction: 'higher_better', thresholds: [0.25, 0.15, 0.08, 0.00] },
    opCfMargin:      { direction: 'higher_better', thresholds: [0.35, 0.25, 0.15, 0.05] },
    capexToRevenue:  { direction: 'lower_better',  thresholds: [0.10, 0.20, 0.35, 0.50] },
    debtToEbitda:    { direction: 'lower_better',  thresholds: [0.50, 1.00, 2.00, 3.50] },
    interestCoverage: IC_ENERGY,
    debtToEquity:    DE_ENERGY,
    currentRatio:    CR_ENERGY,
    evToEbitda:      { direction: 'lower_better', thresholds: [3.00, 5.00, 8.00, 12.0] },
    pbv:             { direction: 'lower_better', thresholds: [0.80, 1.50, 2.50, 4.00] },
  },
  categoryRatios: {
    profitability: ['ebitdaMargin', 'netMargin', 'roe', 'roa'],
    operations:   ['rli', 'productionGrowth'],
    cashFlow:     ['fcfMargin', 'opCfMargin', 'capexToRevenue'],
    leverage:     ['debtToEbitda', 'interestCoverage', 'debtToEquity'],
    valuation:    ['evToEbitda', 'pbv'],
  },
  categoryWeights: { profitability: 0.25, operations: 0.30, cashFlow: 0.20, leverage: 0.15, valuation: 0.10 },
  compositeThresholds: { sangatBaik: 80, baik: 65, cukupBaik: 50, perhatian: 35 },
}

// ── Batu Bara ─────────────────────────────────────────────────────────────────
// Contoh: ADRO, ITMG, PTBA, BUMI, HRUM
// Metrik kunci: Production Growth, ASP/Cost Ratio, EBITDA Margin, FCF tinggi

export const ENERGY_BATUBARA_CONFIG: EnergyConfig = {
  subsector: 'batubara',
  ratios: {
    ebitdaMargin:         { direction: 'higher_better', thresholds: [0.40, 0.28, 0.15, 0.08] },
    netMargin:            { direction: 'higher_better', thresholds: [0.25, 0.15, 0.08, 0.02] },
    roe:                  { direction: 'higher_better', thresholds: [0.25, 0.16, 0.10, 0.05] },
    roa:                  { direction: 'higher_better', thresholds: [0.15, 0.10, 0.05, 0.02] },
    coalProductionGrowth: { direction: 'higher_better', thresholds: [0.10, 0.05, 0.00, -0.05] },
    aspToCostRatio:       { direction: 'higher_better', thresholds: [2.50, 1.80, 1.30, 1.10] },
    fcfMargin:            { direction: 'higher_better', thresholds: [0.20, 0.12, 0.05, 0.00] },
    opCfMargin:           { direction: 'higher_better', thresholds: [0.30, 0.20, 0.12, 0.05] },
    capexToRevenue:       { direction: 'lower_better',  thresholds: [0.05, 0.10, 0.20, 0.30] },
    debtToEbitda:         { direction: 'lower_better',  thresholds: [0.30, 0.80, 1.50, 2.50] },
    interestCoverage:     IC_ENERGY,
    debtToEquity:         DE_ENERGY,
    currentRatio:         CR_ENERGY,
    evToEbitda:           { direction: 'lower_better', thresholds: [2.50, 4.00, 6.00, 10.0] },
    pbv:                  { direction: 'lower_better', thresholds: [0.60, 1.20, 2.00, 3.50] },
  },
  categoryRatios: {
    profitability: ['ebitdaMargin', 'netMargin', 'roe', 'roa'],
    operations:   ['coalProductionGrowth', 'aspToCostRatio'],
    cashFlow:     ['fcfMargin', 'opCfMargin', 'capexToRevenue'],
    leverage:     ['debtToEbitda', 'interestCoverage'],
    valuation:    ['evToEbitda', 'pbv'],
  },
  categoryWeights: { profitability: 0.25, operations: 0.30, cashFlow: 0.20, leverage: 0.15, valuation: 0.10 },
  compositeThresholds: { sangatBaik: 80, baik: 65, cukupBaik: 50, perhatian: 35 },
}

// ── EBT — Energi Baru Terbarukan / Ketenagalistrikan ─────────────────────────
// Contoh: PGEO, BREN, POWR, KEEN
// Metrik kunci: Capacity Factor, Generation Growth, EBITDA Margin tinggi
// Leverage lebih toleran karena project finance dengan PPA jangka panjang

export const ENERGY_EBT_CONFIG: EnergyConfig = {
  subsector: 'ebt',
  ratios: {
    ebitdaMargin:    { direction: 'higher_better', thresholds: [0.55, 0.40, 0.28, 0.15] },
    netMargin:       { direction: 'higher_better', thresholds: [0.20, 0.12, 0.05, 0.00] },
    roe:             { direction: 'higher_better', thresholds: [0.15, 0.10, 0.06, 0.03] },
    roa:             { direction: 'higher_better', thresholds: [0.08, 0.05, 0.03, 0.01] },
    capacityFactor:  { direction: 'higher_better', thresholds: [0.80, 0.65, 0.50, 0.35] },
    generationGrowth:{ direction: 'higher_better', thresholds: [0.20, 0.12, 0.06, 0.00] },
    revenuePerMw:    { direction: 'higher_better', thresholds: [8000, 5000, 3000, 1500] }, // IDR juta/MW
    fcfMargin:       { direction: 'higher_better', thresholds: [0.10, 0.05, 0.00, -0.15] },
    opCfMargin:      { direction: 'higher_better', thresholds: [0.45, 0.30, 0.20, 0.10] },
    // Leverage — EBT lebih toleran; proyek dibiayai project finance dengan PPA
    debtToEbitda:    { direction: 'lower_better',  thresholds: [3.00, 5.00, 8.00, 12.0] },
    interestCoverage:{ direction: 'higher_better', thresholds: [3.00, 2.00, 1.50, 1.20] },
    debtToEquity:    { direction: 'lower_better',  thresholds: [1.00, 2.00, 3.50, 5.00] },
    currentRatio:    CR_ENERGY,
    // EBT umumnya diperdagangkan di multiple yang lebih tinggi karena visibility pendapatan
    evToEbitda:      { direction: 'lower_better', thresholds: [6.00, 10.0, 15.0, 22.0] },
    pbv:             { direction: 'lower_better', thresholds: [1.00, 2.00, 3.50, 5.50] },
  },
  categoryRatios: {
    profitability: ['ebitdaMargin', 'netMargin', 'roe', 'roa'],
    operations:   ['capacityFactor', 'generationGrowth', 'revenuePerMw'],
    cashFlow:     ['fcfMargin', 'opCfMargin'],
    leverage:     ['debtToEbitda', 'interestCoverage', 'debtToEquity'],
    valuation:    ['evToEbitda', 'pbv'],
  },
  categoryWeights: { profitability: 0.25, operations: 0.30, cashFlow: 0.15, leverage: 0.20, valuation: 0.10 },
  compositeThresholds: { sangatBaik: 80, baik: 65, cukupBaik: 50, perhatian: 35 },
}

export function getEnergyConfig(subsector: EnergySubsector): EnergyConfig {
  if (subsector === 'batubara') return ENERGY_BATUBARA_CONFIG
  if (subsector === 'ebt')      return ENERGY_EBT_CONFIG
  return ENERGY_MIGAS_CONFIG
}
