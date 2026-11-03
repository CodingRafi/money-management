export type CashTx = { date: string; type: string; amount: number }

export type CashFlow = { date: Date; amount: number }

const DAY_MS = 86_400_000

/** BUY = uang keluar (−), SELL & DIVIDEND = uang masuk (+). */
export function toCashFlows(txs: CashTx[]): CashFlow[] {
  return txs
    .map((t) => ({
      date: new Date(t.date),
      amount: t.type === "BUY" ? -t.amount : t.amount,
    }))
    .filter((c) => !isNaN(c.date.getTime()) && c.amount !== 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

/**
 * XIRR (annualized, desimal: 0.12 = 12%). Mengembalikan null bila tidak bisa
 * dihitung (arus kas tidak punya tanda berbeda, atau rentang < 30 hari).
 */
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null
  const hasNeg = flows.some((f) => f.amount < 0)
  const hasPos = flows.some((f) => f.amount > 0)
  if (!hasNeg || !hasPos) return null

  const t0 = flows[0].date.getTime()
  const span = (flows[flows.length - 1].date.getTime() - t0) / DAY_MS
  if (span < 30) return null

  const npv = (r: number) =>
    flows.reduce((s, f) => s + f.amount / Math.pow(1 + r, (f.date.getTime() - t0) / DAY_MS / 365), 0)

  // Bisection — lebih stabil daripada Newton untuk arus kas tidak beraturan
  let lo = -0.99
  let hi = 10
  let fLo = npv(lo)
  const fHi = npv(hi)
  if (!isFinite(fLo) || !isFinite(fHi) || fLo * fHi > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const fMid = npv(mid)
    if (Math.abs(fMid) < 1e-6) return mid
    if (fLo * fMid < 0) hi = mid
    else { lo = mid; fLo = fMid }
  }
  return (lo + hi) / 2
}

/** CAGR = (akhir / awal)^(1/tahun) − 1 */
export function cagr(start: number, end: number, years: number): number | null {
  if (start <= 0 || end <= 0 || years < 30 / 365) return null
  return Math.pow(end / start, 1 / years) - 1
}

export function yearsBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / DAY_MS / 365
}

export type AssetPerformance = {
  modal: number
  hasil: number
  dividen: number
  returnPct: number | null   // (hasil + dividen − modal) / modal
  cagrPct: number | null
  xirrPct: number | null
  holdingYears: number
}

/** Kinerja terealisasi untuk aset yang sudah ditutup. */
export function realizedPerformance(txs: CashTx[]): AssetPerformance {
  const modal   = txs.filter((t) => t.type === "BUY").reduce((s, t) => s + t.amount, 0)
  const hasil   = txs.filter((t) => t.type === "SELL").reduce((s, t) => s + t.amount, 0)
  const dividen = txs.filter((t) => t.type === "DIVIDEND").reduce((s, t) => s + t.amount, 0)
  const flows   = toCashFlows(txs)
  const holdingYears = flows.length >= 2 ? yearsBetween(flows[0].date, flows[flows.length - 1].date) : 0

  return {
    modal, hasil, dividen,
    returnPct: modal > 0 ? (hasil + dividen - modal) / modal : null,
    cagrPct:   cagr(modal, hasil + dividen, holdingYears),
    xirrPct:   xirr(flows),
    holdingYears,
  }
}

export type GrowthPoint = { label: string; modalAktif: number; dividenKumulatif: number }

/** Modal aktif (BUY − SELL) kumulatif per bulan, dari transaksi pertama sampai bulan ini. */
export function monthlyGrowth(txs: CashTx[]): GrowthPoint[] {
  const valid = txs.filter((t) => !isNaN(new Date(t.date).getTime()))
  if (valid.length === 0) return []

  const byMonth = new Map<string, { net: number; div: number }>()
  for (const t of valid) {
    const key = t.date.slice(0, 7) // YYYY-MM
    const cur = byMonth.get(key) ?? { net: 0, div: 0 }
    if (t.type === "BUY") cur.net += t.amount
    else if (t.type === "SELL") cur.net -= t.amount
    else if (t.type === "DIVIDEND") cur.div += t.amount
    byMonth.set(key, cur)
  }

  const keys = [...byMonth.keys()].sort()
  const [sy, sm] = keys[0].split("-").map(Number)
  const now = new Date()
  const endY = now.getFullYear()
  const endM = now.getMonth() + 1

  const out: GrowthPoint[] = []
  let net = 0
  let div = 0
  for (let y = sy, m = sm; y < endY || (y === endY && m <= endM); ) {
    const key = `${y}-${String(m).padStart(2, "0")}`
    const cur = byMonth.get(key)
    if (cur) { net += cur.net; div += cur.div }
    out.push({ label: key, modalAktif: net, dividenKumulatif: div })
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

/** Proyeksi tahun menuju target FI. Return/inflasi tahunan (desimal), kontribusi bulanan. */
export function projectFI(opts: {
  current: number
  monthlyContribution: number
  annualReturn: number
  annualInflation: number
  target: number
  maxYears?: number
}) {
  const { current, monthlyContribution, annualReturn, annualInflation, target } = opts
  const maxYears = opts.maxYears ?? 60
  // Return riil: target dihitung dalam daya beli hari ini
  const realMonthly = Math.pow((1 + annualReturn) / (1 + annualInflation), 1 / 12) - 1

  const series: { year: number; nilai: number; target: number }[] = [{ year: 0, nilai: current, target }]
  let bal = current
  let reachedMonth: number | null = current >= target ? 0 : null
  for (let m = 1; m <= maxYears * 12; m++) {
    bal = bal * (1 + realMonthly) + monthlyContribution
    if (reachedMonth === null && bal >= target) reachedMonth = m
    if (m % 12 === 0) series.push({ year: m / 12, nilai: bal, target })
    if (reachedMonth !== null && m >= reachedMonth && m % 12 === 0 && series.length > 3) {
      // lanjutkan sedikit lewat titik tercapai agar grafik informatif
      if (m >= reachedMonth + 24) break
    }
  }
  return { series, yearsToFI: reachedMonth === null ? null : reachedMonth / 12 }
}
