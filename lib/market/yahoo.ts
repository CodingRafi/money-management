import { TICKER_RE, type MarketDataSource, type PricePoint } from "./types"

const toUnix = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000)

/**
 * Adapter endpoint chart publik Yahoo Finance. TIDAK resmi: bisa diblokir atau
 * rate-limited kapan saja → pemanggil wajib menangani error dan tidak boleh
 * menjadikannya dependensi halaman.
 */
export const yahooSource: MarketDataSource = {
  name: "yahoo",
  async fetchHistory(ticker, from, to): Promise<PricePoint[]> {
    if (!TICKER_RE.test(ticker)) throw new Error(`Ticker tidak valid: ${ticker}`)
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
      `?period1=${toUnix(from)}&period2=${toUnix(to) + 86_400}&interval=1d&events=history`
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; money-management)" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`Yahoo ${res.status} untuk ${ticker}`)
    const json = (await res.json()) as {
      chart?: {
        result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[]
        error?: { description?: string } | null
      }
    }
    const result = json.chart?.result?.[0]
    if (!result?.timestamp) throw new Error(json.chart?.error?.description ?? `Tidak ada data untuk ${ticker}`)
    const closes = result.indicators?.quote?.[0]?.close ?? []
    const out: PricePoint[] = []
    result.timestamp.forEach((ts, i) => {
      const c = closes[i]
      if (typeof c === "number" && Number.isFinite(c) && c > 0) {
        out.push({ date: new Date(ts * 1000).toISOString().slice(0, 10), close: c })
      }
    })
    return out
  },
}
