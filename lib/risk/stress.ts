/**
 * Stress test: terapkan guncangan (shock) instan per kelas aset pada posisi
 * saat ini. Semua shock berupa desimal (−0.5 = −50%).
 */

export type AssetClass = "EQUITY" | "GOLD" | "BOND" | "CASH" | "CRYPTO" | "OTHER"

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  EQUITY: "Saham & reksa dana",
  GOLD: "Emas",
  BOND: "Obligasi / SBN",
  CASH: "Kas / deposito / pasar uang",
  CRYPTO: "Kripto",
  OTHER: "Lainnya",
}

/** Petakan nama kategori investasi ke kelas aset. */
export function classifyAsset(categoryName: string): AssetClass {
  const c = categoryName.toUpperCase()
  if (c.includes("SAHAM") || c.includes("REKSA")) return "EQUITY"
  if (c.includes("EMAS")) return "GOLD"
  if (c.includes("OBLIGASI") || c.includes("SBN")) return "BOND"
  if (c.includes("DEPOSITO") || c.includes("PASAR UANG")) return "CASH"
  if (c.includes("KRIPTO")) return "CRYPTO"
  return "OTHER"
}

export type StressScenario = {
  code: string
  name: string
  description: string
  shocks: Partial<Record<AssetClass, number>>
  /** Porsi portofolio yang tidak bisa dijual (nilainya tetap, tapi tidak likuid). */
  illiquidFraction?: number
  /** Biaya tambahan (desimal) atas porsi yang dipaksa dijual. */
  fireSaleCost?: number
}

export const STRESS_SCENARIOS: StressScenario[] = [
  {
    code: "GFC_2008",
    name: "Krisis keuangan global 2008",
    description: "Saham anjlok, kripto belum relevan, emas relatif aman.",
    shocks: { EQUITY: -0.5, CRYPTO: -0.5, GOLD: 0.05, BOND: -0.05, CASH: 0 },
  },
  {
    code: "COVID_2020",
    name: "Crash COVID-19 2020",
    description: "Pasar jatuh cepat karena lockdown; obligasi aman naik tipis.",
    shocks: { EQUITY: -0.35, CRYPTO: -0.4, GOLD: -0.03, BOND: 0.03, CASH: 0 },
  },
  {
    code: "RATE_HIKE",
    name: "Kenaikan suku bunga tajam",
    description: "Saham dan obligasi tertekan, deposito justru naik imbal hasil.",
    shocks: { EQUITY: -0.2, CRYPTO: -0.3, GOLD: -0.05, BOND: -0.08, CASH: 0.04 },
  },
  {
    code: "IDR_DEVAL",
    name: "Pelemahan rupiah",
    description: "Aset berdenominasi USD (emas, kripto) naik dalam rupiah; aset lokal tertekan.",
    shocks: { EQUITY: -0.1, CRYPTO: 0.12, GOLD: 0.12, BOND: -0.06, CASH: 0 },
  },
  {
    code: "LIQUIDITY",
    name: "Krisis likuiditas",
    description: "30% portofolio tidak bisa dijual; sisanya dijual paksa dengan biaya tambahan 3%.",
    shocks: { EQUITY: -0.15, CRYPTO: -0.25, GOLD: 0, BOND: -0.03, CASH: 0 },
    illiquidFraction: 0.3,
    fireSaleCost: 0.03,
  },
]

export type StressPosition = { investmentId: string; name: string; assetClass: AssetClass; value: number }

export type StressResult = {
  code: string
  name: string
  description: string
  baseValue: number
  stressedValue: number
  change: number
  changePct: number
  /** Drawdown akibat guncangan (sama dengan changePct bila negatif). */
  newMaxDrawdown: number
  /** Estimasi bulan pemulihan di imbal hasil tahunan yang diasumsikan; null bila tak pulih / tak rugi. */
  recoveryMonths: number | null
  /** 1 (ringan) … 5 (berat). */
  impactScore: 1 | 2 | 3 | 4 | 5
  perAsset: { investmentId: string; name: string; before: number; after: number; shock: number }[]
}

export function impactScore(changePct: number): 1 | 2 | 3 | 4 | 5 {
  const loss = -changePct
  if (loss < 0.05) return 1
  if (loss < 0.1) return 2
  if (loss < 0.2) return 3
  if (loss < 0.35) return 4
  return 5
}

export function applyStress(
  positions: StressPosition[],
  scenario: StressScenario,
  customShocks: Record<string, number> = {},
  expectedAnnualReturn = 0.08,
): StressResult {
  const baseValue = positions.reduce((s, p) => s + p.value, 0)
  const perAsset = positions.map((p) => {
    const shock = customShocks[p.investmentId] ?? scenario.shocks[p.assetClass] ?? 0
    return { investmentId: p.investmentId, name: p.name, before: p.value, after: p.value * (1 + shock), shock }
  })
  let stressed = perAsset.reduce((s, p) => s + p.after, 0)
  if (scenario.illiquidFraction && scenario.fireSaleCost) {
    // Porsi likuid (1 − illiquid) yang dijual paksa dikenai biaya tambahan.
    stressed -= stressed * (1 - scenario.illiquidFraction) * scenario.fireSaleCost
  }
  const change = stressed - baseValue
  const changePct = baseValue > 0 ? change / baseValue : 0
  const recoveryMonths =
    changePct < 0 && expectedAnnualReturn > 0 && stressed > 0
      ? Math.ceil((Math.log(baseValue / stressed) / Math.log(1 + expectedAnnualReturn)) * 12)
      : null
  return {
    code: scenario.code,
    name: scenario.name,
    description: scenario.description,
    baseValue,
    stressedValue: stressed,
    change,
    changePct,
    newMaxDrawdown: Math.min(0, changePct),
    recoveryMonths,
    impactScore: impactScore(changePct),
    perAsset,
  }
}

export function runAllStress(
  positions: StressPosition[],
  custom?: { shocks: Record<string, number> },
  expectedAnnualReturn = 0.08,
): StressResult[] {
  const out = STRESS_SCENARIOS.map((s) => applyStress(positions, s, {}, expectedAnnualReturn))
  if (custom && Object.keys(custom.shocks).length) {
    out.push(
      applyStress(
        positions,
        { code: "CUSTOM", name: "Skenario kustom", description: "Guncangan per aset yang kamu tentukan sendiri.", shocks: {} },
        custom.shocks,
        expectedAnnualReturn,
      ),
    )
  }
  return out
}
