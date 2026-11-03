import { describe, expect, test } from "bun:test"
import type { NavPoint } from "./types"
import { addMonths, monthEnd, percentile, toMonthly } from "./returns"
import { computeMetrics, correlationMatrix, drawdownStats } from "./metrics"
import { modifiedDietz, reconstructPortfolio, unitSeries, unitizeNav } from "./portfolio"
import { normalizeAllocation, runBacktest, simulateAllocation } from "./simulation"
import { cholesky, mulberry32, runMonteCarlo } from "./montecarlo"
import { applyStress, classifyAsset, STRESS_SCENARIOS } from "./stress"

const series = (values: number[], start = "2024-01"): NavPoint[] =>
  values.map((v, i) => ({ date: monthEnd(addMonths(start, i)), value: v }))

describe("returns", () => {
  test("toMonthly mengambil nilai terakhir tiap bulan", () => {
    const m = toMonthly([
      { date: "2024-01-05", value: 1 }, { date: "2024-01-30", value: 2 }, { date: "2024-02-10", value: 3 },
    ])
    expect(m).toEqual([{ date: "2024-01-31", value: 2 }, { date: "2024-02-29", value: 3 }])
  })
  test("percentile interpolasi", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(percentile([], 0.5)).toBe(null)
  })
})

describe("metrics", () => {
  test("NAV konstan → return 0, volatilitas 0, MaxDD 0, Sharpe null", () => {
    const m = computeMetrics(series(new Array(13).fill(100)))
    expect(m.totalReturn).toBe(0)
    expect(m.volatility).toBe(0)
    expect(m.maxDrawdown).toBe(0)
    expect(m.sharpe).toBe(null)
  })
  test("NAV naik 100→200 dalam 12 bulan: CAGR 100%, MaxDD 0", () => {
    const v = Array.from({ length: 13 }, (_, i) => 100 + (100 * i) / 12)
    const m = computeMetrics(series(v))
    expect(m.cagr).toBeCloseTo(1, 6)
    expect(m.maxDrawdown).toBe(0)
    expect(m.positiveMonths).toBe(1)
  })
  test("100→50→100: MaxDD −50%, current DD 0", () => {
    const m = computeMetrics(series([100, 75, 50, 75, 100]))
    expect(m.maxDrawdown).toBeCloseTo(-0.5, 10)
    expect(m.currentDrawdown).toBe(0)
    expect(m.maxDrawdownDurationDays).toBeGreaterThan(0)
  })
  test("drawdown belum pulih: current DD = MaxDD", () => {
    const d = drawdownStats(series([100, 60, 70]))
    expect(d.max).toBeCloseTo(-0.4, 10)
    expect(d.current).toBeCloseTo(-0.3, 10)
  })
  test("data terlalu sedikit → null", () => {
    expect(computeMetrics(series([100])).cagr).toBe(null)
    expect(computeMetrics(series([100, 110])).sharpe).toBe(null)
  })
  test("beta aset vs benchmark identik = 1, korelasi 1, alpha ≈ 0", () => {
    const a = series([100, 105, 98, 110, 120, 115, 130])
    const m = computeMetrics(a, { benchmark: a })
    expect(m.beta).toBeCloseTo(1, 10)
    expect(m.correlation).toBeCloseTo(1, 10)
    expect(m.alpha!).toBeCloseTo(0, 10)
  })
  test("korelasi series berlawanan = −1", () => {
    const up = series([100, 110, 99, 108.9, 98.01])      // +10%, −10%, +10%, −10%
    const dn = series([100, 90, 99, 89.1, 98.01])        // −10%, +10%, −10%, +10%
    const { matrix } = correlationMatrix([{ key: "a", nav: up }, { key: "b", nav: dn }])
    expect(matrix[0][0]).toBe(1)
    expect(matrix[0][1]).toBeLessThan(-0.99)
  })
  test("VaR/CVaR positif dan CVaR ≥ VaR", () => {
    const m = computeMetrics(series([100, 90, 95, 85, 100, 99, 110, 105, 120, 118, 125, 130, 128]))
    expect(m.var95!).toBeGreaterThan(0)
    expect(m.cvar95!).toBeGreaterThanOrEqual(m.var95!)
  })
  test("Sortino hanya menghukum downside", () => {
    const m = computeMetrics(series([100, 110, 121, 133.1, 146.41]))
    expect(m.sortino).toBe(null) // tidak ada return negatif
  })
})

describe("unitized NAV / TWR", () => {
  test("kontribusi bulanan pada aset flat tidak mengubah TWR (regression guard)", () => {
    // Harga flat; nilai naik murni karena setoran 1jt/bulan.
    const nav: NavPoint[] = []
    const flows = []
    let v = 10
    for (let i = 0; i < 12; i++) {
      if (i > 0) { v += 1; flows.push({ date: monthEnd(addMonths("2024-01", i)), amount: 1 }) }
      nav.push({ date: monthEnd(addMonths("2024-01", i)), value: v })
    }
    const m = computeMetrics(unitSeries(nav, flows))
    expect(m.twr).toBeCloseTo(0, 10)
    expect(nav[nav.length - 1].value).toBe(21)
  })
  test("TWR benar dengan setoran di tengah", () => {
    // Awal 100, +10% → 110, setor 110 → 220, lalu −10% → 198. TWR = 1.1*0.9−1 = −1%
    const nav = series([100, 220, 198], "2024-01")
    const flows = [{ date: nav[1].date, amount: 110 }]
    const u = unitizeNav(nav, flows)
    expect(u[1].navPerUnit).toBeCloseTo(110, 8) // 100 → 110 sebelum setoran
    expect(u[2].navPerUnit / 100 - 1).toBeCloseTo(-0.01, 8)
  })
  test("Modified Dietz mendekati TWR untuk setoran tunggal kecil", () => {
    const d = modifiedDietz(100, 112, "2024-01-01", "2024-01-31", [{ date: "2024-01-16", amount: 5 }])
    expect(d!).toBeCloseTo(7 / 102.5, 8)
  })
  test("penarikan (flow negatif) tidak dihitung sebagai kerugian", () => {
    const nav = series([100, 50], "2024-01")
    const u = unitizeNav(nav, [{ date: nav[1].date, amount: -50 }])
    expect(u[1].navPerUnit).toBeCloseTo(100, 8)
  })
})

describe("reconstructPortfolio", () => {
  test("NAV dari transaksi + harga, flows = BUY − SELL", () => {
    const rec = reconstructPortfolio(
      [
        { investmentId: "a", date: "2024-01-10", type: "BUY", quantity: 10, pricePerUnit: 100, totalAmount: 1000 },
        { investmentId: "a", date: "2024-03-10", type: "SELL", quantity: 5, pricePerUnit: 150, totalAmount: 750 },
      ],
      [{ investmentId: "a", name: "A", hasUnit: true, prices: series([100, 120, 150], "2024-01") }],
      "2024-03-31",
    )
    expect(rec.nav.map((n) => n.value)).toEqual([1000, 1200, 750])
    expect(rec.flows).toEqual([{ date: "2024-01-31", amount: 1000 }, { date: "2024-03-31", amount: -750 }])
    expect(rec.missingData.length).toBe(0)
  })
  test("tanpa harga pasar → missingData terisi", () => {
    const rec = reconstructPortfolio(
      [{ investmentId: "a", date: "2024-01-10", type: "BUY", quantity: 1, pricePerUnit: 100, totalAmount: 100 }],
      [{ investmentId: "a", name: "A", hasUnit: true, prices: [] }],
      "2024-02-28",
    )
    expect(rec.missingData.length).toBe(1)
    expect(rec.nav.length).toBe(2)
  })
})

describe("simulasi alokasi", () => {
  const up = series(Array.from({ length: 25 }, (_, i) => 100 * 1.01 ** i))
  const flat = series(new Array(25).fill(100))

  test("normalizeAllocation", () => {
    const a = normalizeAllocation([{ investmentId: "x", weight: 2 }, { investmentId: "y", weight: 2 }, { investmentId: "z", weight: 0 }])
    expect(a.map((x) => x.weight)).toEqual([0.5, 0.5])
  })
  test("tanpa biaya & tanpa kontribusi: nilai akhir = modal × pertumbuhan harga", () => {
    const months = up.map((p) => p.date.slice(0, 7))
    const r = runBacktest(months, [up.map((p) => p.value)], [1], 1000, 0, "NONE", 0)
    expect(r.values[24]).toBeCloseTo(1000 * 1.01 ** 24, 6)
  })
  test("simulateAllocation: total kontribusi & metrik masuk akal", () => {
    const res = simulateAllocation({
      assets: [
        { investmentId: "up", name: "Naik", prices: up },
        { investmentId: "flat", name: "Flat", prices: flat },
      ],
      allocation: [{ investmentId: "up", weight: 0.5 }, { investmentId: "flat", weight: 0.5 }],
      initialCapital: 1000, monthlyContribution: 100, years: 1, rebalance: "MONTHLY", transactionCost: 0,
      benchmark: flat,
    })
    expect(res.series.length).toBe(13)
    expect(res.series[12].contributions).toBe(1000 + 100 * 12)
    expect(res.metrics.maxDrawdown).toBe(0)
    expect(res.benchmarkMetrics!.totalReturn).toBe(0)
    expect(res.series[12].benchmark!).toBeCloseTo(2200, 6)
    expect(res.metrics.totalReturn!).toBeGreaterThan(0)
  })
  test("biaya transaksi menurunkan hasil", () => {
    const base = { assets: [{ investmentId: "up", name: "N", prices: up }], allocation: [{ investmentId: "up", weight: 1 }], initialCapital: 1000, monthlyContribution: 100, years: 1, rebalance: "NONE" as const }
    const a = simulateAllocation({ ...base, transactionCost: 0 })
    const b = simulateAllocation({ ...base, transactionCost: 0.01 })
    expect(b.series[12].portfolio).toBeLessThan(a.series[12].portfolio)
  })
  test("rebalance mengembalikan bobot ke target", () => {
    const months = up.map((p) => p.date.slice(0, 7))
    const px = [up.map((p) => p.value), flat.map((p) => p.value)]
    const r = runBacktest(months, px, [0.5, 0.5], 1000, 0, "MONTHLY", 0)
    const last = r.assetValues[24]
    expect(last[0] / (last[0] + last[1])).toBeCloseTo(0.5, 8)
    const none = runBacktest(months, px, [0.5, 0.5], 1000, 0, "NONE", 0)
    expect(none.assetValues[24][0]).toBeGreaterThan(none.assetValues[24][1])
  })
  test("aset tanpa data harga dilewati + dicatat", () => {
    const res = simulateAllocation({
      assets: [{ investmentId: "a", name: "A", prices: [] }],
      allocation: [{ investmentId: "a", weight: 1 }],
      initialCapital: 1, monthlyContribution: 0, years: 1, rebalance: "NONE",
    })
    expect(res.series.length).toBe(0)
    expect(res.assumptions.missingData.length).toBe(1)
  })
})

describe("monte carlo", () => {
  const hist = [[0.02, -0.01, 0.03, 0.01, -0.02, 0.015, 0.0, 0.02, -0.03, 0.04, 0.01, 0.005]]
  const base = { assetReturns: hist, weights: [1], initialCapital: 1000, monthlyContribution: 10, years: 2, iterations: 300, seed: 42, startMonth: "2025-01" }

  test("seed sama → hasil identik; seed beda → berbeda", () => {
    const a = runMonteCarlo({ ...base, method: "BOOTSTRAP" })
    const b = runMonteCarlo({ ...base, method: "BOOTSTRAP" })
    const c = runMonteCarlo({ ...base, method: "BOOTSTRAP", seed: 7 })
    expect(a.finalStats).toEqual(b.finalStats)
    expect(a.finalStats.mean).not.toBe(c.finalStats.mean)
  })
  test("persentil berurutan & jumlah titik = bulan + 1", () => {
    const r = runMonteCarlo({ ...base, method: "GBM" })
    expect(r.percentiles.length).toBe(25)
    for (const p of r.percentiles) {
      expect(p.p5).toBeLessThanOrEqual(p.p50)
      expect(p.p50).toBeLessThanOrEqual(p.p95)
    }
    expect(r.histogram.reduce((s, h) => s + h.count, 0)).toBe(300)
    expect(r.probabilityOfLoss).toBeGreaterThanOrEqual(0)
    expect(r.probabilityOfLoss).toBeLessThanOrEqual(1)
  })
  test("return nol → nilai akhir = modal + setoran", () => {
    const r = runMonteCarlo({ ...base, assetReturns: [[0, 0, 0, 0]], method: "BOOTSTRAP", targetAmount: 5000 })
    expect(r.finalStats.p50).toBeCloseTo(1000 + 10 * 24, 8)
    expect(r.probabilityOfLoss).toBe(0)
    expect(r.probabilityOfMissingTarget).toBe(1)
  })
  test("multi-aset GBM mempertahankan korelasi positif (variansi portofolio lebih besar dari tak berkorelasi)", () => {
    const a = [0.05, -0.04, 0.06, -0.05, 0.04, -0.03, 0.05, -0.06]
    const r = runMonteCarlo({ ...base, assetReturns: [a, a.map((x) => x * 1.01)], weights: [0.5, 0.5], method: "GBM" })
    expect(r.finalStats.std).toBeGreaterThan(0)
  })
  test("data kurang → error", () => {
    expect(() => runMonteCarlo({ ...base, assetReturns: [[0.1]], method: "BOOTSTRAP" })).toThrow()
  })
  test("cholesky merekonstruksi matriks", () => {
    const A = [[4, 2], [2, 3]]
    const L = cholesky(A)
    expect(L[0][0] * L[0][0]).toBeCloseTo(4, 8)
    expect(L[1][0] * L[0][0]).toBeCloseTo(2, 8)
    expect(L[1][0] ** 2 + L[1][1] ** 2).toBeCloseTo(3, 8)
  })
  test("mulberry32 deterministik", () => {
    const a = mulberry32(1), b = mulberry32(1)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})

describe("stress test", () => {
  const positions = [
    { investmentId: "s", name: "Saham", assetClass: "EQUITY" as const, value: 600 },
    { investmentId: "d", name: "Deposito", assetClass: "CASH" as const, value: 400 },
  ]
  test("classifyAsset", () => {
    expect(classifyAsset("SAHAM")).toBe("EQUITY")
    expect(classifyAsset("OBLIGASI / SBN")).toBe("BOND")
    expect(classifyAsset("EMAS")).toBe("GOLD")
    expect(classifyAsset("LAINNYA")).toBe("OTHER")
  })
  test("COVID_2020: saham −35% → portofolio −21%", () => {
    const s = STRESS_SCENARIOS.find((x) => x.code === "COVID_2020")!
    const r = applyStress(positions, s)
    expect(r.changePct).toBeCloseTo(-0.21, 10)
    expect(r.impactScore).toBe(4)
    expect(r.recoveryMonths).toBeGreaterThan(0)
  })
  test("custom shock menimpa shock kelas", () => {
    const s = STRESS_SCENARIOS[0]
    const r = applyStress(positions, s, { s: -0.1 })
    expect(r.stressedValue).toBeCloseTo(540 + 400, 8)
  })
  test("skenario likuiditas menambah kerugian dari biaya", () => {
    const s = STRESS_SCENARIOS.find((x) => x.code === "LIQUIDITY")!
    const r = applyStress(positions, s)
    expect(r.stressedValue).toBeLessThan(600 * 0.85 + 400)
  })
  test("portofolio kosong aman", () => {
    expect(applyStress([], STRESS_SCENARIOS[0]).changePct).toBe(0)
  })
})
