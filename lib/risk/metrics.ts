import type { Flow, NavPoint, RiskMetrics } from "./types"
import {
  alignSeries, correlation, covariance, daysBetween, logReturns, mean, monthDiff, monthKey,
  percentile, simpleReturns, stdev,
} from "./returns"
import { unitSeries } from "./portfolio"

const SQRT12 = Math.sqrt(12)

export type MetricsOptions = {
  /** Suku bunga bebas risiko tahunan (desimal). Default 0. */
  riskFreeAnnual?: number
  /** Minimum acceptable return bulanan untuk Sortino. Default 0. */
  mar?: number
  /** Deret NAV-per-unit benchmark (bulanan). */
  benchmark?: NavPoint[]
}

export function emptyMetrics(): RiskMetrics {
  return {
    cagr: null, twr: null, totalReturn: null,
    volatility: null, sharpe: null, sortino: null, calmar: null,
    maxDrawdown: null, maxDrawdownDurationDays: null, currentDrawdown: null,
    var95: null, cvar95: null,
    beta: null, alpha: null, correlation: null, trackingError: null, informationRatio: null,
    bestMonth: null, worstMonth: null, positiveMonths: null,
    months: 0,
  }
}

/** Drawdown maksimum (negatif) + durasi (hari, puncak → pulih / akhir) + drawdown saat ini. */
export function drawdownStats(nav: NavPoint[]): { max: number; durationDays: number; current: number } {
  let peak = nav[0]?.value ?? 0
  let peakDate = nav[0]?.date ?? ""
  let max = 0
  let durationDays = 0
  let ddPeakDate = peakDate
  let current = 0
  for (const p of nav) {
    if (p.value >= peak) {
      peak = p.value
      peakDate = p.date
    }
    const dd = peak > 0 ? p.value / peak - 1 : 0
    current = dd
    if (dd < max) {
      max = dd
      ddPeakDate = peakDate
    }
  }
  if (max < 0) {
    // Cari tanggal pulih (kembali ke level puncak) setelah titik terendah.
    const peakVal = nav.find((p) => p.date === ddPeakDate)?.value ?? 0
    let troughIdx = 0
    let worst = 0
    nav.forEach((p, i) => {
      if (p.date < ddPeakDate) return
      const dd = peakVal > 0 ? p.value / peakVal - 1 : 0
      if (dd < worst) { worst = dd; troughIdx = i }
    })
    const rec = nav.slice(troughIdx).find((p) => p.value >= peakVal)
    durationDays = daysBetween(ddPeakDate, rec ? rec.date : nav[nav.length - 1].date)
  }
  return { max, durationDays, current }
}

/**
 * Hitung semua metrik dari deret NAV-per-unit BULANAN (sudah bersih kontribusi).
 * Semua rasio berupa desimal. Data tidak cukup → null (bukan 0 palsu).
 */
export function computeMetrics(unitNav: NavPoint[], opts: MetricsOptions = {}): RiskMetrics {
  const m = emptyMetrics()
  if (unitNav.length < 2) return m
  const values = unitNav.map((p) => p.value)
  const r = simpleReturns(values)
  const rf = Math.pow(1 + (opts.riskFreeAnnual ?? 0), 1 / 12) - 1
  const mar = opts.mar ?? 0
  m.months = r.length

  const first = values[0]
  const last = values[values.length - 1]
  if (first > 0) {
    m.totalReturn = last / first - 1
    m.twr = m.totalReturn
    const nMonths = monthDiff(monthKey(unitNav[0].date), monthKey(unitNav[unitNav.length - 1].date)) || r.length
    m.cagr = last > 0 ? Math.pow(last / first, 12 / nMonths) - 1 : -1
  }

  const sd = stdev(r)
  if (sd != null) {
    m.volatility = sd * SQRT12
    if (sd > 1e-12) m.sharpe = ((mean(r) - rf) / sd) * SQRT12
  }
  const downside = Math.sqrt(mean(r.map((x) => Math.min(x - mar, 0) ** 2)))
  if (r.length >= 2 && downside > 1e-12) m.sortino = ((mean(r) - mar) / downside) * SQRT12

  const dd = drawdownStats(unitNav)
  m.maxDrawdown = dd.max
  m.maxDrawdownDurationDays = dd.durationDays
  m.currentDrawdown = dd.current
  if (m.cagr != null && dd.max < 0) m.calmar = m.cagr / Math.abs(dd.max)

  if (r.length >= 2) {
    const p5 = percentile(r, 0.05)!
    m.var95 = Math.max(0, -p5)
    const tail = r.filter((x) => x <= p5)
    m.cvar95 = Math.max(0, -mean(tail))
  }
  m.bestMonth = Math.max(...r)
  m.worstMonth = Math.min(...r)
  m.positiveMonths = r.filter((x) => x > 0).length / r.length

  if (opts.benchmark && opts.benchmark.length >= 3) {
    const { a, b } = alignSeries(unitNav, opts.benchmark)
    if (a.length >= 3) {
      const rp = simpleReturns(a.map((p) => p.value))
      const rb = simpleReturns(b.map((p) => p.value))
      const cv = covariance(rp, rb)
      const vb = stdev(rb)
      if (cv != null && vb && vb > 1e-12) {
        m.beta = cv / (vb * vb)
        m.alpha = (mean(rp) - (rf + m.beta * (mean(rb) - rf))) * 12
      }
      m.correlation = correlation(logReturns(a.map((p) => p.value)), logReturns(b.map((p) => p.value)))
      const active = rp.map((x, i) => x - rb[i])
      const te = stdev(active)
      if (te != null) {
        m.trackingError = te * SQRT12
        if (te > 1e-12) m.informationRatio = (mean(active) * 12) / (te * SQRT12)
      }
    }
  }
  return m
}

/** Pintasan: NAV portofolio absolut + arus kas → metrik (via unitized NAV). */
export function metricsFromNav(
  nav: NavPoint[],
  flows: Flow[],
  opts: MetricsOptions = {},
): RiskMetrics {
  return computeMetrics(unitSeries(nav, flows), opts)
}

/** Matriks korelasi Pearson dari log-return, pada tanggal yang dimiliki semua deret. */
export function correlationMatrix(series: { key: string; nav: NavPoint[] }[]): {
  keys: string[]
  matrix: (number | null)[][]
} {
  const keys = series.map((s) => s.key)
  const dateSets = series.map((s) => new Set(s.nav.map((p) => p.date)))
  const common = series.length
    ? series[0].nav.map((p) => p.date).filter((d) => dateSets.every((set) => set.has(d)))
    : []
  const rets = series.map((s) => {
    const map = new Map(s.nav.map((p) => [p.date, p.value]))
    return logReturns(common.map((d) => map.get(d)!))
  })
  const matrix = rets.map((a, i) => rets.map((b, j) => (i === j ? (a.length >= 2 ? 1 : null) : correlation(a, b))))
  return { keys, matrix }
}
