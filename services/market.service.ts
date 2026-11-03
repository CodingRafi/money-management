import { priceRepository } from "@/repositories/price.repository"
import { BENCHMARKS } from "@/lib/risk/benchmark"
import { fetchWithBackoff, resolveSource, yearsAgo, isoDate } from "@/lib/market/sync"
import { DATE_RE, TICKER_RE } from "@/lib/market/types"

export class MarketError extends Error {}

export type SyncResult = { id: string; name: string; ok: boolean; count: number; error?: string }

const MAX_BATCH = 5000

/**
 * Orkestrasi harga pasar. Semua jalur sinkronisasi menangkap error per aset:
 * kegagalan sumber eksternal TIDAK boleh menggagalkan halaman/aset lain.
 */
export const marketService = {
  async addManualPrices(userIds: string[], investmentId: string, points: { date: string; close: number }[]): Promise<number> {
    if (!(await priceRepository.findInvestment(investmentId, userIds))) throw new MarketError("Aset tidak ditemukan")
    const clean = points.filter((p) => DATE_RE.test(p.date) && p.close > 0 && Number.isFinite(p.close))
    if (!clean.length) throw new MarketError("Tidak ada harga valid")
    if (clean.length > MAX_BATCH) throw new MarketError(`Maksimal ${MAX_BATCH} titik harga per input`)
    await priceRepository.upsertAssetPrices(investmentId, clean, "manual")
    return clean.length
  },

  async importPrices(userIds: string[], investmentId: string, points: { date: string; close: number }[]): Promise<number> {
    if (!(await priceRepository.findInvestment(investmentId, userIds))) throw new MarketError("Aset tidak ditemukan")
    if (points.length > MAX_BATCH) throw new MarketError(`Maksimal ${MAX_BATCH} titik harga per impor`)
    // Impor CSV dianggap input manual user → tidak ditimpa sync otomatis.
    await priceRepository.upsertAssetPrices(investmentId, points, "manual")
    return points.length
  },

  async deletePrice(userIds: string[], investmentId: string, date: string): Promise<void> {
    const n = await priceRepository.deleteAssetPrice(investmentId, date, userIds)
    if (!n) throw new MarketError("Harga tidak ditemukan")
  },

  async setTicker(userId: string, investmentId: string, ticker: string | null): Promise<void> {
    if (ticker && !TICKER_RE.test(ticker)) throw new MarketError("Format ticker tidak valid (contoh: BBRI.JK)")
    if (!(await priceRepository.setTicker(investmentId, ticker, userId))) throw new MarketError("Aset tidak ditemukan")
  },

  async syncInvestment(userIds: string[], investmentId: string, years = 3): Promise<SyncResult> {
    const inv = await priceRepository.findInvestment(investmentId, userIds)
    if (!inv) throw new MarketError("Aset tidak ditemukan")
    return syncOne(inv.id, inv.name, inv.ticker, years)
  },

  /** Sync semua aset ber-ticker dalam scope. */
  async syncScope(userIds: string[], years = 3): Promise<SyncResult[]> {
    const invs = (await priceRepository.listInvestments(userIds)).filter((i) => i.ticker && !i.is_closed)
    const out: SyncResult[] = []
    for (const i of invs) out.push(await syncOne(i.id, i.name, i.ticker, years))
    return out
  },

  /** Cron sistem: semua aset ber-ticker lintas keluarga + benchmark. */
  async syncEverything(years = 1): Promise<{ assets: SyncResult[]; benchmarks: SyncResult[] }> {
    const assets: SyncResult[] = []
    for (const i of await priceRepository.listAllWithTicker()) assets.push(await syncOne(i.id, i.name, i.ticker, years))
    return { assets, benchmarks: await marketService.syncBenchmarks(years) }
  },

  async syncBenchmarks(years = 3): Promise<SyncResult[]> {
    const out: SyncResult[] = []
    for (const b of BENCHMARKS.filter((x) => x.yahoo)) {
      try {
        const pts = await fetchWithBackoff(resolveSource(), b.yahoo, yearsAgo(years), isoDate(new Date()))
        await priceRepository.upsertBenchmark(b.code, pts, "yahoo")
        out.push({ id: b.code, name: b.label, ok: true, count: pts.length })
      } catch (err) {
        console.error(`[market] sync benchmark ${b.code} gagal:`, err instanceof Error ? err.message : err)
        out.push({ id: b.code, name: b.label, ok: false, count: 0, error: err instanceof Error ? err.message : "gagal" })
      }
    }
    return out
  },

  async addManualBenchmark(code: string, points: { date: string; close: number }[]): Promise<number> {
    if (!BENCHMARKS.some((b) => b.code === code)) throw new MarketError("Benchmark tidak dikenal")
    await priceRepository.upsertBenchmark(code, points, "manual")
    return points.length
  },
}

async function syncOne(id: string, name: string, ticker: string | null, years: number): Promise<SyncResult> {
  if (!ticker) return { id, name, ok: false, count: 0, error: "Ticker belum diisi" }
  try {
    const pts = await fetchWithBackoff(resolveSource(), ticker, yearsAgo(years), isoDate(new Date()))
    await priceRepository.upsertAssetPrices(id, pts, "yahoo")
    return { id, name, ok: true, count: pts.length }
  } catch (err) {
    const error = err instanceof Error ? err.message : "gagal"
    console.error(`[market] sync ${name} (${ticker}) gagal:`, error)
    return { id, name, ok: false, count: 0, error }
  }
}
