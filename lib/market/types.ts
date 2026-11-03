export type PricePoint = { date: string; close: number }

export type PriceSourceName = "manual" | "yahoo" | "import" | "seed"

export interface MarketDataSource {
  readonly name: PriceSourceName
  /** Ambil harga penutupan harian dari `from` s.d. `to` (YYYY-MM-DD). */
  fetchHistory(ticker: string, from: string, to: string): Promise<PricePoint[]>
}

/** Ticker aman: huruf/angka plus . - = ^ (format Yahoo, mis. BBRI.JK, ^JKSE, GC=F). */
export const TICKER_RE = /^[A-Za-z0-9.\-=^]{1,20}$/

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
