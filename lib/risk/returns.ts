import type { NavPoint } from "./types"

// ── Statistik dasar ──────────────────────────────────────────────────────────

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0
}

/** Standar deviasi sampel (n−1). null bila data < 2. */
export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}

export function covariance(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length)
  if (n < 2) return null
  const ma = mean(a.slice(0, n))
  const mb = mean(b.slice(0, n))
  let s = 0
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb)
  return s / (n - 1)
}

export function correlation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length)
  const c = covariance(a, b)
  const sa = stdev(a.slice(0, n))
  const sb = stdev(b.slice(0, n))
  if (c == null || !sa || !sb) return null
  return Math.max(-1, Math.min(1, c / (sa * sb)))
}

/** Persentil dengan interpolasi linear, p dalam 0..1. */
export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((x, y) => x - y)
  const idx = Math.min(1, Math.max(0, p)) * (s.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return s[lo] + (s[hi] - s[lo]) * (idx - lo)
}

// ── Tanggal & periode ────────────────────────────────────────────────────────

export const monthKey = (date: string) => date.slice(0, 7)

export function monthEnd(key: string): string {
  const [y, m] = key.split("-").map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${key}-${String(last).padStart(2, "0")}`
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number)
  const idx = y * 12 + (m - 1) + n
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`
}

export function monthDiff(a: string, b: string): number {
  const [ya, ma] = a.split("-").map(Number)
  const [yb, mb] = b.split("-").map(Number)
  return (yb - ya) * 12 + (mb - ma)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
}

/** Ambil nilai terakhir tiap bulan (harian → bulanan). Tanggal diset ke akhir bulan. */
export function toMonthly(points: NavPoint[]): NavPoint[] {
  const byMonth = new Map<string, NavPoint>()
  for (const p of [...points].sort((x, y) => x.date.localeCompare(y.date))) {
    byMonth.set(monthKey(p.date), p)
  }
  return [...byMonth.entries()].map(([k, p]) => ({ date: monthEnd(k), value: p.value }))
}

// ── Return ───────────────────────────────────────────────────────────────────

/** r_t = (V_t − V_{t−1}) / V_{t−1}. Pembagi ≤ 0 → return 0. */
export function simpleReturns(values: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < values.length; i++) {
    out.push(values[i - 1] > 0 ? values[i] / values[i - 1] - 1 : 0)
  }
  return out
}

export function logReturns(values: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < values.length; i++) {
    out.push(values[i - 1] > 0 && values[i] > 0 ? Math.log(values[i] / values[i - 1]) : 0)
  }
  return out
}

/** Sejajarkan dua deret pada tanggal yang sama. */
export function alignSeries(a: NavPoint[], b: NavPoint[]): { a: NavPoint[]; b: NavPoint[] } {
  const mb = new Map(b.map((p) => [p.date, p]))
  const ra: NavPoint[] = []
  const rb: NavPoint[] = []
  for (const p of a) {
    const q = mb.get(p.date)
    if (q) {
      ra.push(p)
      rb.push(q)
    }
  }
  return { a: ra, b: rb }
}

/**
 * Isi deret bulanan agar tidak bolong: bulan tanpa data memakai nilai terakhir
 * yang diketahui (carry-forward). Berakhir di `endKey` bila diberikan.
 */
export function fillMonthly(points: NavPoint[], endKey?: string): NavPoint[] {
  if (!points.length) return []
  const m = toMonthly(points)
  const first = monthKey(m[0].date)
  const last = endKey ?? monthKey(m[m.length - 1].date)
  const map = new Map(m.map((p) => [monthKey(p.date), p.value]))
  const out: NavPoint[] = []
  let cur = m[0].value
  for (let k = first; monthDiff(k, last) >= 0; k = addMonths(k, 1)) {
    if (map.has(k)) cur = map.get(k)!
    out.push({ date: monthEnd(k), value: cur })
  }
  return out
}

/** Simple moving average; titik sebelum jendela penuh bernilai null. */
export function movingAverage(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= window) sum -= values[i - window]
    out.push(i >= window - 1 ? sum / window : null)
  }
  return out
}
