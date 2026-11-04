import type { AllocationItem, Flow, NavPoint, Rebalance, RiskMetrics } from "./types"
import { addMonths, fillMonthly, monthDiff, monthEnd, monthKey, simpleReturns } from "./returns"
import { computeMetrics } from "./metrics"
import { unitSeries } from "./portfolio"

export type SimAsset = { investmentId: string; name: string; prices: NavPoint[] }

export type SimulationParams = {
  assets: SimAsset[]
  allocation: AllocationItem[]
  initialCapital: number
  monthlyContribution: number
  years: number
  rebalance: Rebalance
  /** Toleransi selisih bobot (desimal) sebelum rebalance dijalankan. */
  rebalanceBand?: number
  /** Biaya transaksi per sisi (desimal). Default 0,15%. */
  transactionCost?: number
  benchmark?: NavPoint[]
  riskFreeAnnual?: number
}

export type SimulationSeriesPoint = {
  date: string
  portfolio: number
  benchmark: number | null
  contributions: number
}

export type SimulationResult = {
  series: SimulationSeriesPoint[]
  nav: NavPoint[]
  flows: Flow[]
  metrics: RiskMetrics
  benchmarkMetrics: RiskMetrics | null
  perAsset: { investmentId: string; name: string; value: number; weight: number; metrics: RiskMetrics }[]
  assumptions: { startDate: string; endDate: string; months: number; requestedMonths: number; missingData: string[] }
  /** Return bulanan historis per aset pada jendela yang sama (dipakai Monte Carlo). */
  assetReturns: Record<string, number[]>
}

export const DEFAULT_COST = 0.0015

const PERIOD: Record<Rebalance, number> = { NONE: 0, MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 }

/** Normalisasi bobot agar total = 1. Bobot ≤ 0 dibuang. */
export function normalizeAllocation(alloc: AllocationItem[]): AllocationItem[] {
  const pos = alloc.filter((a) => a.weight > 0)
  const total = pos.reduce((s, a) => s + a.weight, 0)
  return total > 0 ? pos.map((a) => ({ ...a, weight: a.weight / total })) : []
}

/**
 * Jendela harga bulanan bersama: semua aset diisi (carry-forward), dipotong ke
 * irisan tanggal (mulai = awal terakhir, akhir = akhir paling awal), lalu diambil
 * `years*12` bulan terakhir.
 */
export function commonWindow(
  priceMap: Record<string, NavPoint[]>,
  years: number,
): { months: string[]; prices: Record<string, number[]>; requestedMonths: number } {
  const filled: Record<string, NavPoint[]> = {}
  for (const [k, v] of Object.entries(priceMap)) filled[k] = fillMonthly(v)
  const keys = Object.keys(filled).filter((k) => filled[k].length > 0)
  const requestedMonths = Math.round(years * 12)
  if (!keys.length) return { months: [], prices: {}, requestedMonths }
  const start = keys.map((k) => monthKey(filled[k][0].date)).reduce((a, b) => (monthDiff(a, b) > 0 ? b : a))
  const end = keys.map((k) => monthKey(filled[k][filled[k].length - 1].date)).reduce((a, b) => (monthDiff(a, b) < 0 ? b : a))
  if (monthDiff(start, end) < 1) return { months: [], prices: {}, requestedMonths }
  const from = monthDiff(start, end) > requestedMonths ? addMonths(end, -requestedMonths) : start
  const months: string[] = []
  for (let k = from; monthDiff(k, end) >= 0; k = addMonths(k, 1)) months.push(k)
  const prices: Record<string, number[]> = {}
  for (const k of keys) {
    const map = new Map(filled[k].map((p) => [monthKey(p.date), p.value]))
    prices[k] = months.map((m) => map.get(m)!)
  }
  return { months, prices, requestedMonths }
}

type RunOut = { values: number[]; contributions: number[]; flows: Flow[]; assetValues: number[][] }

/** Jalankan satu portofolio bobot tetap atas deret harga (sejajar `months`). */
export function runBacktest(
  months: string[],
  prices: number[][],
  weights: number[],
  initialCapital: number,
  monthlyContribution: number,
  rebalance: Rebalance,
  cost: number,
  band = 0,
): RunOut {
  const n = weights.length
  const period = PERIOD[rebalance]
  const holdings = new Array<number>(n).fill(0) // nilai per aset
  const values: number[] = []
  const contributions: number[] = []
  const flows: Flow[] = []
  const assetValues: number[][] = []
  let contributed = 0

  const invest = (amount: number) => {
    for (let i = 0; i < n; i++) holdings[i] += amount * weights[i] * (1 - cost)
  }
  invest(initialCapital)
  contributed += initialCapital

  for (let t = 0; t < months.length; t++) {
    if (t > 0) {
      for (let i = 0; i < n; i++) holdings[i] *= prices[i][t - 1] > 0 ? prices[i][t] / prices[i][t - 1] : 1
      if (monthlyContribution > 0) {
        invest(monthlyContribution)
        contributed += monthlyContribution
        flows.push({ date: monthEnd(months[t]), amount: monthlyContribution })
      }
      if (period > 0 && t % period === 0) {
        const total = holdings.reduce((s, h) => s + h, 0)
        if (total > 0) {
          const dev = Math.max(...holdings.map((h, i) => Math.abs(h / total - weights[i])))
          if (dev > band) {
            let traded = 0
            for (let i = 0; i < n; i++) traded += Math.abs(total * weights[i] - holdings[i])
            const net = total - traded * cost
            for (let i = 0; i < n; i++) holdings[i] = net * weights[i]
          }
        }
      }
    }
    values.push(holdings.reduce((s, h) => s + h, 0))
    contributions.push(contributed)
    assetValues.push([...holdings])
  }
  return { values, contributions, flows, assetValues }
}

export function simulateAllocation(p: SimulationParams): SimulationResult {
  const alloc = normalizeAllocation(p.allocation)
  const missingData: string[] = []
  const usable = alloc.filter((a) => {
    const asset = p.assets.find((x) => x.investmentId === a.investmentId)
    if (!asset || asset.prices.length < 2) {
      missingData.push(`${asset?.name ?? a.investmentId}: data harga kurang dari 2 titik — dilewati`)
      return false
    }
    return true
  })
  const empty: SimulationResult = {
    series: [], nav: [], flows: [], metrics: computeMetrics([]), benchmarkMetrics: null, perAsset: [],
    assumptions: { startDate: "", endDate: "", months: 0, requestedMonths: Math.round(p.years * 12), missingData },
    assetReturns: {},
  }
  if (!usable.length) return empty
  const weights = normalizeAllocation(usable)

  const priceMap: Record<string, NavPoint[]> = {}
  for (const a of weights) priceMap[a.investmentId] = p.assets.find((x) => x.investmentId === a.investmentId)!.prices
  if (p.benchmark && p.benchmark.length >= 2) priceMap.__bench = p.benchmark
  const win = commonWindow(priceMap, p.years)
  if (win.months.length < 2) {
    missingData.push("Rentang harga bersama antar aset kurang dari 2 bulan")
    return { ...empty, assumptions: { ...empty.assumptions, missingData } }
  }

  const cost = p.transactionCost ?? DEFAULT_COST
  const ids = weights.map((a) => a.investmentId)
  const w = weights.map((a) => a.weight)
  const px = ids.map((id) => win.prices[id])
  const run = runBacktest(win.months, px, w, p.initialCapital, p.monthlyContribution, p.rebalance, cost, p.rebalanceBand ?? 0)

  const nav: NavPoint[] = win.months.map((m, i) => ({ date: monthEnd(m), value: run.values[i] }))
  const metricOpts = { riskFreeAnnual: p.riskFreeAnnual ?? 0 }

  let benchValues: number[] | null = null
  let benchmarkMetrics: RiskMetrics | null = null
  let benchUnit: NavPoint[] | undefined
  if (win.prices.__bench) {
    const b = runBacktest(win.months, [win.prices.__bench], [1], p.initialCapital, p.monthlyContribution, "NONE", cost)
    benchValues = b.values
    const bn = win.months.map((m, i) => ({ date: monthEnd(m), value: b.values[i] }))
    benchUnit = unitSeries(bn, b.flows)
    benchmarkMetrics = computeMetrics(benchUnit, metricOpts)
  }

  const unit = unitSeries(nav, run.flows)
  const metrics = computeMetrics(unit, { ...metricOpts, benchmark: benchUnit })

  const last = run.assetValues[run.assetValues.length - 1]
  const lastTotal = last.reduce((s, x) => s + x, 0)
  const assetReturns: Record<string, number[]> = {}
  const perAsset = ids.map((id, i) => {
    const series = win.months.map((m, t) => ({ date: monthEnd(m), value: px[i][t] }))
    assetReturns[id] = simpleReturns(px[i])
    return {
      investmentId: id,
      name: p.assets.find((x) => x.investmentId === id)!.name,
      value: last[i],
      weight: lastTotal > 0 ? last[i] / lastTotal : 0,
      metrics: computeMetrics(series, { ...metricOpts, benchmark: benchUnit }),
    }
  })

  return {
    series: win.months.map((m, i) => ({
      date: monthEnd(m),
      portfolio: run.values[i],
      benchmark: benchValues ? benchValues[i] : null,
      contributions: run.contributions[i],
    })),
    nav,
    flows: run.flows,
    metrics,
    benchmarkMetrics,
    perAsset,
    assumptions: {
      startDate: monthEnd(win.months[0]),
      endDate: monthEnd(win.months[win.months.length - 1]),
      months: win.months.length - 1,
      requestedMonths: win.requestedMonths,
      missingData,
    },
    assetReturns,
  }
}
