/**
 * Util skor & tanggal untuk deteksi transaksi berulang. Pure, tanpa I/O.
 */

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}

export function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** "YYYY-MM-DD" → "YYYY-MM". */
export function monthKey(date: string): string {
  return date.slice(0, 7)
}

/** Indeks bulan absolut (year*12 + month-1) dari "YYYY-MM[-DD]". */
export function monthIndex(date: string): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1
}

export function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10))
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Tanggal jatuh tempo pada bulan tertentu; hari 31 di bulan 30 hari → hari terakhir bulan. */
export function dueDateIn(month: string, day: number): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const d = Math.min(Math.max(1, day), daysInMonth(y, m))
  return `${month}-${String(d).padStart(2, "0")}`
}

export interface ClusterStats {
  occurrences: number
  distinctMonths: number
  /** Panjang jendela pengamatan dalam bulan (dipakai sebagai pembagi cakupan bulan). */
  windowMonths: number
  amounts: number[]
  days: number[]
  /** Proporsi transaksi pada kategori yang paling dominan (0..1). */
  categoryPurity: number
}

export interface ScoreBreakdown {
  total: number
  occurrence: number
  spread: number
  amountStability: number
  dateStability: number
  category: number
}

/** Bobot sinyal — jumlahnya 1. */
const W = { occurrence: 0.35, spread: 0.25, amount: 0.2, date: 0.15, category: 0.05 }

/**
 * Confidence 0..1:
 *  - kemunculan  : min(n/3, 1)
 *  - sebaran     : bulan berbeda / panjang jendela
 *  - nominal     : CV ≤5% → 1, ≤15% → 0.6, selain itu 0
 *  - tanggal     : stdev hari ≤2 → 1, ≤5 → 0.5, selain itu 0
 *  - kategori    : ≥80% satu kategori → 1
 * Hanya 2 kemunculan = bukti tipis → total dikali 0.6 (di bawah ambang default 0.55).
 */
export function scoreCluster(s: ClusterStats): ScoreBreakdown {
  const occurrence = Math.min(s.occurrences / 3, 1)
  const spread = s.windowMonths > 0 ? Math.min(s.distinctMonths / s.windowMonths, 1) : 0

  const m = mean(s.amounts)
  const cv = m > 0 ? stdev(s.amounts) / m : 1
  const amountStability = cv <= 0.05 ? 1 : cv <= 0.15 ? 0.6 : 0

  const sd = stdev(s.days)
  const dateStability = sd <= 2 ? 1 : sd <= 5 ? 0.5 : 0

  const category = s.categoryPurity >= 0.8 ? 1 : 0

  let total =
    W.occurrence * occurrence + W.spread * spread + W.amount * amountStability +
    W.date * dateStability + W.category * category
  if (s.occurrences < 3) total *= 0.6
  return { total: Math.min(1, Math.max(0, total)), occurrence, spread, amountStability, dateStability, category }
}
