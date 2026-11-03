import { priceRepository, type InvestmentRow } from "@/repositories/price.repository"
import { computeMetrics, correlationMatrix } from "@/lib/risk/metrics"
import { reconstructPortfolio, unitSeries, type HoldingTx } from "@/lib/risk/portfolio"
import { alignBenchmark } from "@/lib/risk/benchmark"
import { fillMonthly, monthKey, toMonthly } from "@/lib/risk/returns"
import { simulateAllocation, type SimulationResult } from "@/lib/risk/simulation"
import { runMonteCarlo, type MonteCarloMethod, type MonteCarloResult } from "@/lib/risk/montecarlo"
import { classifyAsset, runAllStress, ASSET_CLASS_LABEL, type StressPosition, type StressResult } from "@/lib/risk/stress"
import type { AllocationItem, NavPoint, Rebalance, RiskMetrics } from "@/lib/risk/types"

export class RiskError extends Error {}

const todayIso = () => new Date().toISOString().slice(0, 10)

async function priceSeriesFor(userIds: string[], ids?: string[]): Promise<Map<string, NavPoint[]>> {
  const rows = await priceRepository.listAssetPrices(userIds, ids)
  const out = new Map<string, NavPoint[]>()
  for (const [id, list] of rows) out.set(id, list.map((r) => ({ date: r.date, value: r.close })))
  return out
}

async function benchmarkSeries(code?: string | null): Promise<NavPoint[]> {
  if (!code) return []
  const rows = await priceRepository.listBenchmark(code)
  return toMonthly(rows.map((r) => ({ date: r.date, value: r.close })))
}

// ── Risiko portofolio aktual ─────────────────────────────────────────────────

export type PortfolioRisk = {
  hasData: boolean
  startDate: string | null
  endDate: string | null
  currentValue: number
  netInvested: number
  nav: NavPoint[]
  drawdown: { date: string; drawdown: number }[]
  metrics: RiskMetrics
  benchmarkCode: string | null
  benchmarkMetrics: RiskMetrics | null
  correlation: { keys: string[]; matrix: (number | null)[][] }
  perAsset: { id: string; name: string; category: string; value: number; weight: number; hasPrices: boolean; metrics: RiskMetrics | null }[]
  concentration: { topAsset: string | null; topAssetPct: number; topCategory: string | null; topCategoryPct: number; warnings: string[] }
  missingData: string[]
}

function toHoldingTx(rows: Awaited<ReturnType<typeof priceRepository.listTransactions>>): HoldingTx[] {
  return rows.map((r) => ({
    investmentId: r.investment_id,
    date: r.date,
    type: r.type,
    quantity: parseFloat(r.quantity) || 0,
    pricePerUnit: Number(r.price_per_unit),
    totalAmount: Number(r.total_amount),
  }))
}

export const riskService = {
  async portfolioRisk(userIds: string[], benchmarkCode: string | null = "IHSG"): Promise<PortfolioRisk> {
    const [invs, txRows, prices, bench] = await Promise.all([
      priceRepository.listInvestments(userIds),
      priceRepository.listTransactions(userIds),
      priceSeriesFor(userIds),
      benchmarkSeries(benchmarkCode),
    ])
    const txs = toHoldingTx(txRows)
    const rec = reconstructPortfolio(
      txs,
      invs.map((i) => ({ investmentId: i.id, name: i.name, hasUnit: !!i.unit, prices: toMonthlyPoints(prices.get(i.id)) })),
      todayIso(),
    )
    const empty: PortfolioRisk = {
      hasData: false, startDate: null, endDate: null, currentValue: 0, netInvested: 0, nav: [], drawdown: [],
      metrics: computeMetrics([]), benchmarkCode, benchmarkMetrics: null,
      correlation: { keys: [], matrix: [] }, perAsset: [],
      concentration: { topAsset: null, topAssetPct: 0, topCategory: null, topCategoryPct: 0, warnings: [] },
      missingData: rec.missingData,
    }
    if (rec.nav.length < 2) return empty

    const unit = unitSeries(rec.nav, rec.flows)
    const benchAligned = alignBenchmark(unit, bench)
    const metrics = computeMetrics(unit, { benchmark: benchAligned.length >= 3 ? benchAligned : undefined })
    const benchmarkMetrics = benchAligned.length >= 2 ? computeMetrics(benchAligned) : null

    let peak = 0
    const drawdown = unit.map((p) => {
      peak = Math.max(peak, p.value)
      return { date: p.date, drawdown: peak > 0 ? p.value / peak - 1 : 0 }
    })

    // Per aset: nilai sekarang, bobot, metrik dari deret harga (bila ada).
    const byId = new Map(invs.map((i) => [i.id, i]))
    const lastVal = (id: string) => rec.perAsset[id]?.[rec.perAsset[id].length - 1]?.value ?? 0
    const total = Object.keys(rec.perAsset).reduce((s, id) => s + lastVal(id), 0)
    const perAsset = Object.keys(rec.perAsset)
      .map((id) => {
        const inv = byId.get(id)!
        const series = toMonthlyPoints(prices.get(id))
        const filled = fillMonthly(series)
        return {
          id, name: inv.name, category: inv.category_name, value: lastVal(id),
          weight: total > 0 ? lastVal(id) / total : 0,
          hasPrices: filled.length >= 3,
          metrics: filled.length >= 3 ? computeMetrics(filled, { benchmark: alignBenchmark(filled, bench).length >= 3 ? alignBenchmark(filled, bench) : undefined }) : null,
        }
      })
      .filter((a) => a.value > 0)
      .sort((a, b) => b.value - a.value)

    const corrInput = perAsset
      .filter((a) => a.hasPrices)
      .slice(0, 8)
      .map((a) => ({ key: a.name, nav: fillMonthly(toMonthlyPoints(prices.get(a.id))) }))
    const correlation = corrInput.length >= 2 ? correlationMatrix(corrInput) : { keys: [], matrix: [] }

    const catTotals = new Map<string, number>()
    for (const a of perAsset) catTotals.set(a.category, (catTotals.get(a.category) ?? 0) + a.value)
    const topCat = [...catTotals.entries()].sort((a, b) => b[1] - a[1])[0]
    const top = perAsset[0]
    const warnings: string[] = []
    if (top && top.weight >= 0.5) warnings.push(`Portofolio kamu ${Math.round(top.weight * 100)}% terkonsentrasi di satu aset (${top.name}).`)
    if (topCat && total > 0 && topCat[1] / total >= 0.7 && perAsset.length > 1) {
      warnings.push(`${Math.round((topCat[1] / total) * 100)}% portofolio berada di kategori ${topCat[0]}.`)
    }
    if (metrics.maxDrawdown != null && metrics.maxDrawdown <= -0.3) {
      warnings.push(`Drawdown maksimum ${Math.round(metrics.maxDrawdown * 100)}% — pastikan toleransi risikomu sesuai.`)
    }

    return {
      hasData: true,
      startDate: rec.nav[0].date,
      endDate: rec.nav[rec.nav.length - 1].date,
      currentValue: rec.nav[rec.nav.length - 1].value,
      netInvested: rec.flows.reduce((s, f) => s + f.amount, 0),
      nav: rec.nav,
      drawdown,
      metrics,
      benchmarkCode,
      benchmarkMetrics,
      correlation,
      perAsset,
      concentration: {
        topAsset: top?.name ?? null, topAssetPct: top?.weight ?? 0,
        topCategory: topCat?.[0] ?? null, topCategoryPct: topCat && total > 0 ? topCat[1] / total : 0,
        warnings,
      },
      missingData: rec.missingData,
    }
  },

  /** Aset yang bisa dipakai di simulasi (punya ≥ 3 titik harga bulanan) + benchmark tersedia. */
  async simulationContext(userIds: string[]) {
    const [invs, prices, benchCodes] = await Promise.all([
      priceRepository.listInvestments(userIds),
      priceSeriesFor(userIds),
      priceRepository.listBenchmarkCodes(),
    ])
    const assets = invs
      .map((i) => ({ id: i.id, name: i.name, category: i.category_name, months: toMonthlyPoints(prices.get(i.id)).length, ticker: i.ticker }))
      .filter((a) => a.months >= 3)
    const withoutPrices = invs.filter((i) => toMonthlyPoints(prices.get(i.id)).length < 3).map((i) => ({ id: i.id, name: i.name }))
    return { assets, withoutPrices, benchmarks: benchCodes.filter((b) => b.n >= 3).map((b) => b.code) }
  },

  async simulate(
    userIds: string[],
    input: {
      initialCapital: number
      monthlyContribution: number
      years: number
      allocation: AllocationItem[]
      benchmarkCode?: string | null
      rebalance: Rebalance
      rebalanceBand?: number
      transactionCost?: number
      monteCarlo?: { method: MonteCarloMethod; iterations: number; seed: number; targetAmount?: number | null }
    },
  ): Promise<{ simulation: SimulationResult; monteCarlo: MonteCarloResult | null; monteCarloError: string | null }> {
    const ids = input.allocation.map((a) => a.investmentId)
    const invs = (await priceRepository.listInvestments(userIds)).filter((i) => ids.includes(i.id))
    // Anti-IDOR: semua aset di alokasi wajib milik scope.
    if (invs.length !== new Set(ids).size) throw new RiskError("Ada aset yang tidak ditemukan")
    const [prices, bench] = await Promise.all([priceSeriesFor(userIds, ids), benchmarkSeries(input.benchmarkCode)])
    const simulation = simulateAllocation({
      assets: invs.map((i) => ({ investmentId: i.id, name: i.name, prices: toMonthlyPoints(prices.get(i.id)) })),
      allocation: input.allocation,
      initialCapital: input.initialCapital,
      monthlyContribution: input.monthlyContribution,
      years: input.years,
      rebalance: input.rebalance,
      rebalanceBand: input.rebalanceBand,
      transactionCost: input.transactionCost,
      benchmark: bench.length >= 2 ? bench : undefined,
    })

    let monteCarlo: MonteCarloResult | null = null
    let monteCarloError: string | null = null
    if (input.monteCarlo && simulation.perAsset.length) {
      try {
        const keys = simulation.perAsset.map((a) => a.investmentId)
        const w = simulation.perAsset.map((a) => input.allocation.find((x) => x.investmentId === a.investmentId)?.weight ?? 0)
        const sum = w.reduce((s, x) => s + x, 0)
        monteCarlo = runMonteCarlo({
          assetReturns: keys.map((k) => simulation.assetReturns[k]),
          weights: w.map((x) => x / sum),
          initialCapital: input.initialCapital,
          monthlyContribution: input.monthlyContribution,
          years: input.years,
          method: input.monteCarlo.method,
          iterations: input.monteCarlo.iterations,
          seed: input.monteCarlo.seed,
          targetAmount: input.monteCarlo.targetAmount ?? null,
          startMonth: monthKey(todayIso()),
        })
      } catch (err) {
        monteCarloError = err instanceof Error ? err.message : "Monte Carlo gagal"
      }
    }
    return { simulation, monteCarlo, monteCarloError }
  },

  /** Posisi aktif saat ini dalam nilai (harga pasar bila ada, selain itu harga transaksi / modal bersih). */
  async currentPositions(userIds: string[]): Promise<StressPosition[]> {
    const [invs, txRows, prices] = await Promise.all([
      priceRepository.listInvestments(userIds),
      priceRepository.listTransactions(userIds),
      priceSeriesFor(userIds),
    ])
    const rec = reconstructPortfolio(
      toHoldingTx(txRows),
      invs.map((i) => ({ investmentId: i.id, name: i.name, hasUnit: !!i.unit, prices: toMonthlyPoints(prices.get(i.id)) })),
      todayIso(),
    )
    const byId = new Map<string, InvestmentRow>(invs.map((i) => [i.id, i]))
    return Object.entries(rec.perAsset)
      .map(([id, s]) => ({
        investmentId: id,
        name: byId.get(id)!.name,
        assetClass: classifyAsset(byId.get(id)!.category_name),
        value: s[s.length - 1]?.value ?? 0,
      }))
      .filter((p) => p.value > 0)
  },

  async stressTest(userIds: string[], customShocks: Record<string, number> = {}): Promise<{
    positions: StressPosition[]
    results: StressResult[]
    byClass: { label: string; value: number }[]
  }> {
    const positions = await riskService.currentPositions(userIds)
    const allowed = new Set(positions.map((p) => p.investmentId))
    const shocks: Record<string, number> = {}
    for (const [k, v] of Object.entries(customShocks)) if (allowed.has(k)) shocks[k] = v
    const results = runAllStress(positions, { shocks })
    const cls = new Map<string, number>()
    for (const p of positions) cls.set(ASSET_CLASS_LABEL[p.assetClass], (cls.get(ASSET_CLASS_LABEL[p.assetClass]) ?? 0) + p.value)
    return { positions, results, byClass: [...cls.entries()].map(([label, value]) => ({ label, value })) }
  },

  async assetMiniMetrics(userIds: string[], investmentId: string, benchmarkCode = "IHSG") {
    const inv = await priceRepository.findInvestment(investmentId, userIds)
    if (!inv) return null
    const [prices, bench] = await Promise.all([priceSeriesFor(userIds, [investmentId]), benchmarkSeries(benchmarkCode)])
    const daily = prices.get(investmentId) ?? []
    const filled = fillMonthly(toMonthlyPoints(daily))
    const aligned = alignBenchmark(filled, bench)
    return {
      pricePoints: daily.length,
      metrics: filled.length >= 3 ? computeMetrics(filled, { benchmark: aligned.length >= 3 ? aligned : undefined }) : null,
      daily: daily.slice(-800),
    }
  },
}

function toMonthlyPoints(series: NavPoint[] | undefined): NavPoint[] {
  return series && series.length ? toMonthly(series) : []
}
