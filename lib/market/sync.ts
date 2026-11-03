import type { MarketDataSource, PricePoint } from "./types"
import { yahooSource } from "./yahoo"

/** Sumber otomatis yang tersedia. Manual/import tidak lewat sini (input user). */
export function resolveSource(): MarketDataSource {
  return yahooSource
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Ambil histori dengan backoff eksponensial. Kegagalan akhir dilempar —
 * pemanggil (service/cron) yang menangkap dan mencatat, tidak pernah memblokir halaman.
 */
export async function fetchWithBackoff(
  source: MarketDataSource,
  ticker: string,
  from: string,
  to: string,
  attempts = 3,
): Promise<PricePoint[]> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await source.fetchHistory(ticker, from, to)
    } catch (err) {
      lastErr = err
      if (i < attempts - 1) await sleep(500 * 2 ** i)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Gagal mengambil harga")
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10)

/** Tanggal n tahun lalu dari hari ini (UTC). */
export function yearsAgo(n: number, from = new Date()): string {
  const d = new Date(from)
  d.setUTCFullYear(d.getUTCFullYear() - n)
  return isoDate(d)
}
