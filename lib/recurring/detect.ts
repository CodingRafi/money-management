/**
 * Deteksi transaksi berulang dari histori. Pure function (tanpa I/O) → mudah diuji.
 *
 * Pipeline: normalisasi nama → grup (user+jenis+kategori+nama mirip)
 * → cluster nominal (toleransi 15%) → skor → filter.
 *
 * Catatan sumber data: hanya tabel `expenses` & `incomes` yang dibaca, jadi DCA
 * (`investment_transactions`) dan cicilan (`loan_payments`) otomatis tidak ikut
 * terdeteksi sehingga tidak dobel dengan modul masing-masing.
 */
import { dayOfMonth, median, mean, monthIndex, scoreCluster, stdev } from "./score"

export type TxnKind = "EXPENSE" | "INCOME"
export type NeedsType = "PRIMER" | "SEKUNDER" | "TERSIER"

export type TxnLike = {
  id: string
  userId: string
  kind: TxnKind
  name: string
  amount: number
  date: string // YYYY-MM-DD
  categoryId: string | null
  walletId: string | null
  needsType?: NeedsType | null
  isFamilyExpense?: boolean
}

export type DetectedPattern = {
  userId: string
  kind: TxnKind
  name: string
  categoryId: string | null
  walletId: string | null
  needsType: NeedsType
  isFamilyExpense: boolean
  amountAvg: number
  amountMin: number
  amountMax: number
  occurrences: number
  dayOfMonth: number
  confidence: number
  sampleDates: string[]
  lastSeenDate: string
}

export type DetectOptions = {
  /** Bulan referensi "YYYY-MM" (default: bulan transaksi terbaru). */
  asOfMonth?: string
  minConfidence?: number
  minOccurrences?: number
  /** Toleransi selisih nominal dalam satu cluster (default 0.15). */
  amountTolerance?: number
}

const STOP_WORDS = new Set([
  "tagihan", "bayar", "pembayaran", "trx", "transaksi", "bulan", "bulanan", "bln", "rp", "untuk", "ke", "di", "dan",
  "januari", "februari", "maret", "april", "mei", "juni", "juli", "agustus", "september", "oktober", "november", "desember",
  "jan", "feb", "mar", "apr", "jun", "jul", "agu", "agt", "sep", "sept", "okt", "nov", "des",
])
const NUMERIC_TOKEN = /^\d+([.,]\d+)?(rb|k|jt|ribu|juta|x)?$/

/** "Bayar listrik 450rb Nov" → "listrik". */
export function normalizeName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9\s]/g, " ")
  const tokens = cleaned.split(/\s+/).filter((t) => t && !NUMERIC_TOKEN.test(t) && !STOP_WORDS.has(t))
  if (tokens.length) return [...new Set(tokens)].sort().join(" ")
  return cleaned.trim().replace(/\s+/g, " ") || "tanpa nama"
}

function tokenSet(norm: string): Set<string> {
  return new Set(norm.split(" ").filter(Boolean))
}

/** Kemiripan Jaccard (0..1) antar dua nama ternormalisasi. */
export function nameSimilarity(a: string, b: string): number {
  if (a === b) return 1
  const A = tokenSet(a)
  const B = tokenSet(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / (A.size + B.size - inter)
}

/** Jarak token > 0.6 (kemiripan < 0.4) tidak digabung. */
const NAME_MERGE_MIN_SIMILARITY = 0.4

class UnionFind {
  parent: number[]
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]]
      i = this.parent[i]
    }
    return i
  }
  union(a: number, b: number) {
    this.parent[this.find(a)] = this.find(b)
  }
}

/** Kelompokkan transaksi berdasar nama yang mirip (single-linkage). */
function groupByName(txns: TxnLike[]): TxnLike[][] {
  const byNorm = new Map<string, TxnLike[]>()
  for (const t of txns) {
    const n = normalizeName(t.name)
    const arr = byNorm.get(n)
    if (arr) arr.push(t)
    else byNorm.set(n, [t])
  }
  const norms = [...byNorm.keys()]
  const uf = new UnionFind(norms.length)
  for (let i = 0; i < norms.length; i++) {
    for (let j = i + 1; j < norms.length; j++) {
      if (nameSimilarity(norms[i], norms[j]) >= NAME_MERGE_MIN_SIMILARITY) uf.union(i, j)
    }
  }
  const groups = new Map<number, TxnLike[]>()
  norms.forEach((n, i) => {
    const root = uf.find(i)
    const arr = groups.get(root) ?? []
    arr.push(...byNorm.get(n)!)
    groups.set(root, arr)
  })
  return [...groups.values()]
}

/** Cluster nominal: urut naik, pisah bila selisih berurutan > toleransi × nilai lebih besar. */
function clusterByAmount(txns: TxnLike[], tol: number): TxnLike[][] {
  const sorted = [...txns].sort((a, b) => a.amount - b.amount)
  const out: TxnLike[][] = []
  let cur: TxnLike[] = []
  for (const t of sorted) {
    const prev = cur[cur.length - 1]
    if (prev && t.amount - prev.amount > tol * t.amount) {
      out.push(cur)
      cur = []
    }
    cur.push(t)
  }
  if (cur.length) out.push(cur)
  return out
}

function mostCommon<T>(items: T[]): T | undefined {
  const count = new Map<T, number>()
  for (const i of items) count.set(i, (count.get(i) ?? 0) + 1)
  let best: T | undefined
  let bestN = 0
  for (const [k, n] of count) {
    if (n > bestN) {
      best = k
      bestN = n
    }
  }
  return best
}

export function detectRecurring(txns: TxnLike[], opts: DetectOptions = {}): DetectedPattern[] {
  const minConfidence = opts.minConfidence ?? 0.55
  const minOccurrences = opts.minOccurrences ?? 2
  const tol = opts.amountTolerance ?? 0.15
  const valid = txns.filter((t) => t.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.date))
  if (!valid.length) return []

  const latest = valid.reduce((m, t) => (t.date > m ? t.date : m), "")
  const asOfIdx = monthIndex(opts.asOfMonth ? `${opts.asOfMonth}-01` : latest)

  // Grup kasar: pemilik + jenis + kategori
  const coarse = new Map<string, TxnLike[]>()
  for (const t of valid) {
    const k = `${t.userId}|${t.kind}|${t.categoryId ?? "-"}`
    const arr = coarse.get(k)
    if (arr) arr.push(t)
    else coarse.set(k, [t])
  }

  const results: DetectedPattern[] = []
  for (const group of coarse.values()) {
    for (const nameGroup of groupByName(group)) {
      for (const cluster of clusterByAmount(nameGroup, tol)) {
        if (cluster.length < minOccurrences) continue

        const months = cluster.map((t) => monthIndex(t.date))
        const distinctMonths = new Set(months).size
        if (distinctMonths < 2) continue // rentang bulan minimal 2

        // Bukan pola bulanan bila sering muncul berkali-kali dalam sebulan (mis. jajan harian).
        if (cluster.length / distinctMonths > 1.5) continue
        // Sudah lama tidak muncul → kemungkinan berhenti.
        const lastIdx = Math.max(...months)
        if (asOfIdx - lastIdx > 2) continue

        const amounts = cluster.map((t) => t.amount)
        const avg = mean(amounts)
        if (avg > 0 && stdev(amounts) / avg > 0.3) continue // cluster terlalu lebar (rantai nominal)

        const days = cluster.map((t) => dayOfMonth(t.date))
        const firstIdx = Math.min(...months)
        const windowEnd = Math.max(lastIdx, asOfIdx - 1)
        const windowMonths = Math.max(3, windowEnd - firstIdx + 1)

        const topCat = mostCommon(cluster.map((t) => t.categoryId))
        const purity = cluster.filter((t) => t.categoryId === topCat).length / cluster.length

        const { total } = scoreCluster({
          occurrences: cluster.length,
          distinctMonths,
          windowMonths,
          amounts,
          days,
          categoryPurity: purity,
        })
        if (total < minConfidence) continue

        const sortedByDate = [...cluster].sort((a, b) => a.date.localeCompare(b.date))
        const newest = sortedByDate[sortedByDate.length - 1]
        const name = mostCommon(cluster.map((t) => t.name.trim())) ?? newest.name
        const needs = mostCommon(cluster.map((t) => t.needsType).filter((x): x is NeedsType => !!x)) ?? "PRIMER"

        results.push({
          userId: newest.userId,
          kind: newest.kind,
          name,
          categoryId: topCat ?? null,
          walletId: mostCommon(cluster.map((t) => t.walletId)) ?? null,
          needsType: needs,
          isFamilyExpense: cluster.filter((t) => t.isFamilyExpense).length > cluster.length / 2,
          amountAvg: Math.round(avg),
          amountMin: Math.min(...amounts),
          amountMax: Math.max(...amounts),
          occurrences: cluster.length,
          dayOfMonth: Math.max(1, Math.min(31, Math.round(median(days)))),
          confidence: Math.round(total * 100) / 100,
          sampleDates: sortedByDate.slice(-6).map((t) => t.date),
          lastSeenDate: newest.date,
        })
      }
    }
  }
  return results.sort((a, b) => b.confidence - a.confidence || b.occurrences - a.occurrences)
}

// ── Pencocokan pola ↔ transaksi ──────────────────────────────────────────────

export type PatternLike = {
  kind: TxnKind
  name: string
  categoryId: string | null
  amountAvg: number
  amountMin: number
  amountMax: number
}

/** Apakah `t` adalah realisasi dari pola `p` (dipakai untuk "sudah dicatat bulan ini"). */
export function matchesPattern(
  p: PatternLike,
  t: Pick<TxnLike, "kind" | "name" | "amount" | "categoryId">,
): boolean {
  if (t.kind !== p.kind) return false
  if (nameSimilarity(normalizeName(p.name), normalizeName(t.name)) >= 0.5) return true
  if (p.categoryId && t.categoryId === p.categoryId) {
    const lo = Math.min(p.amountMin, p.amountAvg) * 0.85
    const hi = Math.max(p.amountMax, p.amountAvg) * 1.15
    return t.amount >= lo && t.amount <= hi
  }
  return false
}

/** Apakah kandidat deteksi sama dengan pola tersimpan (kandidat disembunyikan bila ya). */
export function isSamePattern(a: PatternLike, b: PatternLike): boolean {
  if (a.kind !== b.kind) return false
  if (nameSimilarity(normalizeName(a.name), normalizeName(b.name)) < NAME_MERGE_MIN_SIMILARITY) return false
  const hi = Math.max(a.amountAvg, b.amountAvg)
  return hi === 0 || Math.abs(a.amountAvg - b.amountAvg) <= 0.2 * hi
}
