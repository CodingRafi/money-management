import { db } from "@/lib/db"

export type PriceRow = { date: string; close: number; source: string }

export type InvestmentRow = {
  id: string
  user_id: string
  name: string
  ticker: string | null
  unit: string | null
  category_name: string
  is_closed: number
}

export type TxRow = {
  investment_id: string
  date: string
  type: "BUY" | "SELL" | "DIVIDEND"
  quantity: string
  price_per_unit: number
  total_amount: number
}

/**
 * Harga aset tidak punya user_id sendiri — kepemilikan SELALU diturunkan dari
 * investments.user_id, dan setiap query membatasi ke `userIds` (scope).
 */
export const priceRepository = {
  async listInvestments(userIds: string[]): Promise<InvestmentRow[]> {
    return (await db.prepare(
      `SELECT i.id, i.user_id, i.name, i.ticker, i.unit, ic.name AS category_name, i.is_closed
       FROM investments i JOIN investment_categories ic ON ic.id = i.category_id
       WHERE i.user_id = ANY(?) AND i.is_active = 1
       ORDER BY ic.sort_order, i.name`
    ).all(userIds)) as InvestmentRow[]
  },

  /** Untuk cron sistem (lintas user): aset aktif yang punya ticker. */
  async listAllWithTicker(): Promise<{ id: string; name: string; ticker: string }[]> {
    return (await db.prepare(
      "SELECT id, name, ticker FROM investments WHERE is_active = 1 AND is_closed = 0 AND ticker IS NOT NULL AND ticker <> ''"
    ).all()) as { id: string; name: string; ticker: string }[]
  },

  async findInvestment(id: string, userIds: string[]): Promise<InvestmentRow | undefined> {
    return (await db.prepare(
      `SELECT i.id, i.user_id, i.name, i.ticker, i.unit, ic.name AS category_name, i.is_closed
       FROM investments i JOIN investment_categories ic ON ic.id = i.category_id
       WHERE i.id = ? AND i.user_id = ANY(?) AND i.is_active = 1`
    ).get(id, userIds)) as InvestmentRow | undefined
  },

  async listTransactions(userIds: string[]): Promise<TxRow[]> {
    return (await db.prepare(
      `SELECT it.investment_id, it.date, it.type, it.quantity, it.price_per_unit, it.total_amount
       FROM investment_transactions it JOIN investments i ON i.id = it.investment_id
       WHERE i.user_id = ANY(?) AND i.is_active = 1
       ORDER BY it.date, it.created_at`
    ).all(userIds)) as TxRow[]
  },

  /** Harga untuk aset-aset milik scope. Map investment_id → deret naik. */
  async listAssetPrices(userIds: string[], investmentIds?: string[]): Promise<Map<string, PriceRow[]>> {
    const rows = (await db.prepare(
      `SELECT ap.investment_id, ap.date, ap.close, ap.source
       FROM asset_prices ap JOIN investments i ON i.id = ap.investment_id
       WHERE i.user_id = ANY(?) AND i.is_active = 1 AND (?::text[] IS NULL OR ap.investment_id = ANY(?::text[]))
       ORDER BY ap.investment_id, ap.date`
    ).all(userIds, investmentIds ?? null, investmentIds ?? null)) as (PriceRow & { investment_id: string })[]
    const map = new Map<string, PriceRow[]>()
    for (const r of rows) {
      const list = map.get(r.investment_id) ?? []
      list.push({ date: r.date, close: Number(r.close), source: r.source })
      map.set(r.investment_id, list)
    }
    return map
  },

  async countAssetPrices(userIds: string[]): Promise<Map<string, { n: number; last: string | null }>> {
    const rows = (await db.prepare(
      `SELECT ap.investment_id, COUNT(*)::int AS n, MAX(ap.date) AS last
       FROM asset_prices ap JOIN investments i ON i.id = ap.investment_id
       WHERE i.user_id = ANY(?) GROUP BY ap.investment_id`
    ).all(userIds)) as { investment_id: string; n: number; last: string | null }[]
    return new Map(rows.map((r) => [r.investment_id, { n: Number(r.n), last: r.last }]))
  },

  /**
   * Upsert batch. Harga yang diinput manual tidak ditimpa oleh sumber otomatis.
   * Pemanggil WAJIB sudah memverifikasi kepemilikan investmentId (findInvestment).
   */
  async upsertAssetPrices(investmentId: string, points: { date: string; close: number }[], source: string): Promise<void> {
    if (!points.length) return
    await db.prepare(
      `INSERT INTO asset_prices (investment_id, date, close, source)
       SELECT ?::text, t.d, t.c, ?::text FROM unnest(?::text[], ?::float8[]) AS t(d, c)
       ON CONFLICT (investment_id, date) DO UPDATE SET close = EXCLUDED.close, source = EXCLUDED.source
       WHERE asset_prices.source <> 'manual' OR EXCLUDED.source = 'manual'`
    ).run(investmentId, source, points.map((p) => p.date), points.map((p) => p.close))
  },

  async deleteAssetPrice(investmentId: string, date: string, userIds: string[]): Promise<number> {
    return (await db.prepare(
      `DELETE FROM asset_prices WHERE investment_id = ? AND date = ?
       AND investment_id IN (SELECT id FROM investments WHERE user_id = ANY(?))`
    ).run(investmentId, date, userIds)).changes
  },

  async setTicker(investmentId: string, ticker: string | null, userId: string): Promise<number> {
    return (await db.prepare("UPDATE investments SET ticker = ?, updated_at = NOW() WHERE id = ? AND user_id = ?")
      .run(ticker, investmentId, userId)).changes
  },

  // ── Benchmark (data pasar publik, dipakai bersama) ────────────────────────

  async listBenchmark(code: string): Promise<{ date: string; close: number }[]> {
    const rows = (await db.prepare("SELECT date, close FROM benchmark_prices WHERE code = ? ORDER BY date").all(code)) as { date: string; close: number }[]
    return rows.map((r) => ({ date: r.date, close: Number(r.close) }))
  },

  async listBenchmarkCodes(): Promise<{ code: string; n: number }[]> {
    return (await db.prepare("SELECT code, COUNT(*)::int AS n FROM benchmark_prices GROUP BY code ORDER BY code").all()) as { code: string; n: number }[]
  },

  async upsertBenchmark(code: string, points: { date: string; close: number }[], source: string): Promise<void> {
    if (!points.length) return
    await db.prepare(
      `INSERT INTO benchmark_prices (code, date, close, source)
       SELECT ?::text, t.d, t.c, ?::text FROM unnest(?::text[], ?::float8[]) AS t(d, c)
       ON CONFLICT (code, date) DO UPDATE SET close = EXCLUDED.close, source = EXCLUDED.source
       WHERE benchmark_prices.source <> 'manual' OR EXCLUDED.source = 'manual'`
    ).run(code, source, points.map((p) => p.date), points.map((p) => p.close))
  },
}
