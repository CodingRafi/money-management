import { addMonths, mean, monthEnd, percentile, stdev } from "./returns"

/** PRNG deterministik: seed sama → urutan sama. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Normal standar via Box–Muller. */
export function normalSampler(rng: () => number): () => number {
  let spare: number | null = null
  return () => {
    if (spare != null) {
      const s = spare
      spare = null
      return s
    }
    let u = 0
    while (u === 0) u = rng()
    const v = rng()
    const mag = Math.sqrt(-2 * Math.log(u))
    spare = mag * Math.sin(2 * Math.PI * v)
    return mag * Math.cos(2 * Math.PI * v)
  }
}

/**
 * Dekomposisi Cholesky (L·Lᵀ = A). Matriks yang hampir singular diberi ridge
 * kecil di diagonal (ε = 1e-6 relatif) sebelum difaktorkan.
 */
export function cholesky(a: number[][]): number[][] {
  const n = a.length
  const L = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = a[i][j]
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k]
      if (i === j) {
        L[i][j] = Math.sqrt(Math.max(sum, 1e-12))
      } else {
        L[i][j] = sum / L[j][j]
      }
    }
  }
  return L
}

export type MonteCarloMethod = "BOOTSTRAP" | "GBM"

export type MonteCarloInput = {
  /** Return bulanan historis per aset (panjang sama, sejajar tanggal). */
  assetReturns: number[][]
  weights: number[]
  initialCapital: number
  monthlyContribution: number
  years: number
  method: MonteCarloMethod
  iterations: number
  seed: number
  targetAmount?: number | null
  /** Bulan awal proyeksi (YYYY-MM). */
  startMonth: string
}

export type MonteCarloResult = {
  percentiles: { date: string; p5: number; p25: number; p50: number; p75: number; p95: number }[]
  finalStats: { p5: number; p50: number; p95: number; mean: number; std: number }
  totalContributed: number
  /** P(nilai akhir < total uang yang disetor). */
  probabilityOfLoss: number
  probabilityOfMissingTarget: number | null
  ruinProbability: number
  maxDrawdownDistribution: { p50: number; p95: number; worst: number }
  histogram: { bucket: string; from: number; to: number; count: number }[]
  seed: number
  iterations: number
  method: MonteCarloMethod
}

export const MAX_ITERATIONS = 5000

export function runMonteCarlo(inp: MonteCarloInput): MonteCarloResult {
  const n = inp.weights.length
  const rows = inp.assetReturns[0]?.length ?? 0
  if (n === 0 || rows < 2) throw new Error("Data return historis tidak cukup untuk Monte Carlo (minimal 3 bulan harga)")
  const iterations = Math.max(1, Math.min(MAX_ITERATIONS, Math.floor(inp.iterations)))
  const steps = Math.max(1, Math.round(inp.years * 12))
  const rng = mulberry32(inp.seed)
  const randn = normalSampler(rng)

  // Parameter GBM dari log-return historis
  let mu: number[] = []
  let sigma: number[]
  let chol: number[][] = []
  if (inp.method === "GBM") {
    const logs = inp.assetReturns.map((r) => r.map((x) => Math.log(Math.max(1 + x, 1e-6))))
    mu = logs.map((l) => mean(l))
    sigma = logs.map((l) => stdev(l) ?? 0)
    const cov = logs.map((a, i) =>
      logs.map((b, j) => {
        if (i === j) return sigma[i] ** 2
        const ma = mean(a), mb = mean(b)
        let s = 0
        for (let k = 0; k < a.length; k++) s += (a[k] - ma) * (b[k] - mb)
        return s / (a.length - 1)
      }),
    )
    chol = cholesky(cov.map((row, i) => row.map((v, j) => (i === j ? v + 1e-6 * (v || 1e-4) : v))))
  }

  const paths = new Float64Array(iterations * (steps + 1))
  const maxDDs = new Float64Array(iterations)
  let ruin = 0
  const z = new Array<number>(n).fill(0)
  const shock = new Array<number>(n).fill(0)

  for (let it = 0; it < iterations; it++) {
    let value = inp.initialCapital
    let unit = 1
    let peak = 1
    let dd = 0
    let ruined = false
    const base = it * (steps + 1)
    paths[base] = value
    for (let t = 1; t <= steps; t++) {
      let rp = 0
      if (inp.method === "BOOTSTRAP") {
        const row = Math.floor(rng() * rows)
        for (let i = 0; i < n; i++) rp += inp.weights[i] * inp.assetReturns[i][row]
      } else {
        for (let i = 0; i < n; i++) z[i] = randn()
        for (let i = 0; i < n; i++) {
          let s = 0
          for (let k = 0; k <= i; k++) s += chol[i][k] * z[k]
          shock[i] = s
        }
        for (let i = 0; i < n; i++) {
          // log-return ~ N(μ_log, σ²) dengan korelasi dari Cholesky (μ_log sudah memuat −σ²/2)
          rp += inp.weights[i] * (Math.exp(mu[i] + shock[i]) - 1)
        }
      }
      rp = Math.max(rp, -1)
      value = value * (1 + rp) + inp.monthlyContribution
      unit *= 1 + rp
      if (unit > peak) peak = unit
      const d = unit / peak - 1
      if (d < dd) dd = d
      if (value <= 0 && !ruined) { ruined = true }
      paths[base + t] = Math.max(0, value)
    }
    if (ruined) ruin++
    maxDDs[it] = dd
  }

  const col = new Array<number>(iterations)
  const percentiles: MonteCarloResult["percentiles"] = []
  for (let t = 0; t <= steps; t++) {
    for (let it = 0; it < iterations; it++) col[it] = paths[it * (steps + 1) + t]
    percentiles.push({
      date: monthEnd(addMonths(inp.startMonth, t)),
      p5: percentile(col, 0.05)!,
      p25: percentile(col, 0.25)!,
      p50: percentile(col, 0.5)!,
      p75: percentile(col, 0.75)!,
      p95: percentile(col, 0.95)!,
    })
  }

  const finals: number[] = []
  for (let it = 0; it < iterations; it++) finals.push(paths[it * (steps + 1) + steps])
  const totalContributed = inp.initialCapital + inp.monthlyContribution * steps
  const lo = Math.min(...finals)
  const hi = Math.max(...finals)
  const buckets = 20
  const width = (hi - lo) / buckets || 1
  const hist = Array.from({ length: buckets }, (_, i) => ({
    bucket: "", from: lo + i * width, to: lo + (i + 1) * width, count: 0,
  }))
  for (const f of finals) hist[Math.min(buckets - 1, Math.floor((f - lo) / width))].count++
  hist.forEach((h) => (h.bucket = `${Math.round(h.from / 1e6)}–${Math.round(h.to / 1e6)} jt`))

  const ddArr = Array.from(maxDDs)
  return {
    percentiles,
    finalStats: {
      p5: percentile(finals, 0.05)!,
      p50: percentile(finals, 0.5)!,
      p95: percentile(finals, 0.95)!,
      mean: mean(finals),
      std: stdev(finals) ?? 0,
    },
    totalContributed,
    probabilityOfLoss: finals.filter((f) => f < totalContributed).length / iterations,
    probabilityOfMissingTarget: inp.targetAmount ? finals.filter((f) => f < inp.targetAmount!).length / iterations : null,
    ruinProbability: ruin / iterations,
    // maxDD negatif: p50 = median, p95 = persentil terburuk 5%, worst = minimum
    maxDrawdownDistribution: {
      p50: percentile(ddArr, 0.5)!,
      p95: percentile(ddArr, 0.05)!,
      worst: Math.min(...ddArr),
    },
    histogram: hist,
    seed: inp.seed,
    iterations,
    method: inp.method,
  }
}
