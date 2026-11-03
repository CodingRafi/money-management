import type { Flow, NavPoint } from "./types"
import { addMonths, monthDiff, monthEnd, monthKey } from "./returns"

/**
 * Unitized NAV: ubah (nilai portofolio, arus kas) menjadi NAV per unit yang
 * bersih dari setoran/penarikan. Dasar semua TWR/Sharpe/MaxDD — kontribusi
 * kas TIDAK dihitung sebagai performa.
 *
 * Konvensi: `nav.value` adalah nilai portofolio AKHIR tanggal tsb, sudah
 * termasuk arus kas pada tanggal itu. Arus kas yang tanggalnya tidak punya titik
 * NAV diterapkan di titik NAV berikutnya.
 */
export function unitizeNav(
  nav: NavPoint[],
  flows: Flow[],
): { date: string; navPerUnit: number; units: number }[] {
  const pts = [...nav].sort((a, b) => a.date.localeCompare(b.date))
  const fl = [...flows].sort((a, b) => a.date.localeCompare(b.date))
  const out: { date: string; navPerUnit: number; units: number }[] = []
  let fi = 0
  let units = 0
  let price = 100

  for (let i = 0; i < pts.length; i++) {
    let flow = 0
    while (fi < fl.length && fl[fi].date <= pts[i].date) {
      flow += fl[fi].amount
      fi++
    }
    const v = pts[i].value
    if (i === 0) {
      // Arus kas sebelum/di titik pertama sudah tercermin di nilai awal.
      units = v > 0 ? v / price : 0
    } else if (units > 0) {
      // Harga per unit sebelum arus kas hari ini.
      price = Math.max(0, (v - flow) / units)
      if (price > 0) units = Math.max(0, units + flow / price)
    } else if (v > 0) {
      // Portofolio mulai lagi dari nol → unit baru pada harga terakhir.
      if (price <= 0) price = 100
      units = v / price
    }
    out.push({ date: pts[i].date, navPerUnit: price, units })
  }
  return out
}

/** Deret NAV per unit sebagai NavPoint (siap masuk computeMetrics). */
export function unitSeries(nav: NavPoint[], flows: Flow[]): NavPoint[] {
  return unitizeNav(nav, flows).map((u) => ({ date: u.date, value: u.navPerUnit }))
}

/**
 * Modified Dietz untuk satu periode — pembanding/fallback TWR.
 * Arus kas di dalam (start, end]; bobot = sisa hari periode / total hari.
 */
export function modifiedDietz(
  startValue: number,
  endValue: number,
  startDate: string,
  endDate: string,
  flows: Flow[],
): number | null {
  const total = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000
  if (total <= 0) return null
  let net = 0
  let weighted = 0
  for (const f of flows) {
    if (f.date <= startDate || f.date > endDate) continue
    const w = (Date.parse(endDate) - Date.parse(f.date)) / 86_400_000 / total
    net += f.amount
    weighted += f.amount * w
  }
  const denom = startValue + weighted
  return denom > 0 ? (endValue - startValue - net) / denom : null
}

// ── Rekonstruksi portofolio dari transaksi + harga ───────────────────────────

export type HoldingTx = {
  investmentId: string
  date: string
  type: "BUY" | "SELL" | "DIVIDEND"
  quantity: number
  pricePerUnit: number
  totalAmount: number
}

export type AssetInput = {
  investmentId: string
  name: string
  /** unit null (deposito, dll.) → dinilai sebesar modal bersih, tanpa harga pasar. */
  hasUnit: boolean
  prices: NavPoint[]
}

export type Reconstruction = {
  nav: NavPoint[]
  flows: Flow[]
  /** Nilai per aset per bulan (key = investmentId). */
  perAsset: Record<string, NavPoint[]>
  missingData: string[]
}

/**
 * Susun NAV bulanan portofolio dari transaksi. Harga: close terakhir ≤ akhir
 * bulan dari `prices`; bila tak ada → harga transaksi terakhir (ditandai missingData).
 * Dividen dihitung sebagai kas yang tetap berada di portofolio.
 */
export function reconstructPortfolio(txs: HoldingTx[], assets: AssetInput[], endDate: string): Reconstruction {
  const missing: string[] = []
  if (!txs.length) return { nav: [], flows: [], perAsset: {}, missingData: [] }
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date))
  const firstKey = monthKey(sorted[0].date)
  const endKey = monthKey(endDate)
  const months: string[] = []
  for (let i = 0; monthDiff(firstKey, endKey) - i >= 0; i++) months.push(addMonths(firstKey, i))

  const perAsset: Record<string, NavPoint[]> = {}
  const flows: Flow[] = []
  const totals = months.map(() => 0)
  const dividendByMonth = months.map(() => 0)

  for (const t of sorted) {
    const k = monthKey(t.date)
    const mi = months.indexOf(k)
    if (mi < 0) continue
    if (t.type === "BUY") flows.push({ date: monthEnd(k), amount: t.totalAmount })
    else if (t.type === "SELL") flows.push({ date: monthEnd(k), amount: -t.totalAmount })
    else dividendByMonth[mi] += t.totalAmount
  }

  for (const a of assets) {
    const atx = sorted.filter((t) => t.investmentId === a.investmentId)
    if (!atx.length) continue
    const priced = a.hasUnit && a.prices.length > 0
    if (a.hasUnit && !priced) missing.push(`${a.name}: belum ada harga pasar (dinilai dari harga transaksi terakhir)`)
    const prices = [...a.prices].sort((x, y) => x.date.localeCompare(y.date))
    const series: NavPoint[] = []
    months.forEach((k, mi) => {
      const end = monthEnd(k)
      let qty = 0
      let net = 0
      let lastPx = 0
      for (const t of atx) {
        if (t.date > end) break
        if (t.type === "BUY") { qty += t.quantity; net += t.totalAmount; lastPx = t.pricePerUnit }
        else if (t.type === "SELL") { qty -= t.quantity; net -= t.totalAmount; lastPx = t.pricePerUnit }
      }
      let value: number
      if (!a.hasUnit) {
        value = Math.max(0, net)
      } else {
        let px = lastPx
        if (priced) for (const p of prices) { if (p.date <= end) px = p.value; else break }
        value = Math.max(0, qty) * px
      }
      series.push({ date: end, value })
      totals[mi] += value
    })
    perAsset[a.investmentId] = series
  }

  let dividendCash = 0
  for (let i = 0; i < months.length; i++) {
    dividendCash += dividendByMonth[i]
    totals[i] += dividendCash
  }
  const nav = months.map((k, i) => ({ date: monthEnd(k), value: totals[i] }))
  return { nav, flows, perAsset, missingData: missing }
}
