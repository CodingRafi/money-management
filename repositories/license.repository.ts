import { db } from "@/lib/db"

export interface LicenseRow {
  id: string
  household_id: string
  plan_type: string
  status: "active" | "expired" | "suspended" | "trial"
  max_members: number
  starts_at: string
  expires_at: string | null
  /** Kolom nilai jual — hanya tersedia setelah migrasi 005. */
  price?: number
  sold_at?: string | null
}

export interface HouseholdSummaryRow {
  id: string
  name: string
  plan_type: string
  status: LicenseRow["status"]
  max_members: number
  expires_at: string | null
  price: number
  sold_at: string | null
  member_count: number
  admin_username: string | null
}

export interface HouseholdRow {
  id: string
  name: string
  currency: string
  created_at: string
}

export interface PlanRevenueRow {
  plan_type: string
  households: number
  revenue: number
}

type LicenseValues = {
  plan_type: string
  status: LicenseRow["status"]
  max_members: number
  expires_at: string | null
}

/** Kolom ringkasan yang dipakai semua daftar keluarga. */
const SUMMARY_SELECT = `
  SELECT h.id, h.name, l.plan_type, l.status, l.max_members, l.expires_at, l.price, l.sold_at,
         (SELECT COUNT(*)::int FROM household_members m WHERE m.household_id = h.id) AS member_count,
         (SELECT u.username FROM household_members m JOIN "user" u ON u.id = m.user_id
            WHERE m.household_id = h.id AND m.role = 'admin' ORDER BY m.created_at LIMIT 1) AS admin_username
  FROM households h
  JOIN licenses l ON l.household_id = h.id`

export const licenseRepository = {
  /**
   * Query inti lisensi. SENGAJA tidak menyentuh kolom `price`/`sold_at`
   * (migrasi 005) supaya halaman utama tidak ikut gagal bila migrasi belum
   * dijalankan. Modul Super Admin memakai query terpisah di bawah.
   */
  async findByHousehold(householdId: string): Promise<LicenseRow | undefined> {
    return await db.prepare(
      `SELECT id, household_id, plan_type, status, max_members, starts_at, expires_at
       FROM licenses WHERE household_id = ?`
    ).get(householdId) as LicenseRow | undefined
  },

  async findHousehold(householdId: string): Promise<HouseholdRow | undefined> {
    return await db.prepare(
      "SELECT id, name, currency, created_at FROM households WHERE id = ?"
    ).get(householdId) as HouseholdRow | undefined
  },

  /** Ringkasan satu keluarga lengkap dengan kolom harga (migrasi 005). */
  async findSummaryByHousehold(householdId: string): Promise<HouseholdSummaryRow | undefined> {
    return await db.prepare(
      `${SUMMARY_SELECT} WHERE h.id = ?`
    ).get(householdId) as HouseholdSummaryRow | undefined
  },

  async listHouseholds(search?: string): Promise<HouseholdSummaryRow[]> {
    const like = `%${(search ?? "").toLowerCase()}%`
    return await db.prepare(
      `${SUMMARY_SELECT}
       WHERE LOWER(h.name) LIKE ?
          OR EXISTS (SELECT 1 FROM household_members m JOIN "user" u ON u.id = m.user_id
                     WHERE m.household_id = h.id AND LOWER(u.username) LIKE ?)
       ORDER BY h.created_at DESC`
    ).all(like, like) as HouseholdSummaryRow[]
  },

  /** Keluarga aktif/trial yang akan kadaluarsa dalam N hari ke depan. */
  async listExpiring(days: number): Promise<HouseholdSummaryRow[]> {
    return await db.prepare(
      `${SUMMARY_SELECT}
       WHERE l.status IN ('active','trial')
         AND l.expires_at IS NOT NULL
         AND l.expires_at <= NOW() + (? * INTERVAL '1 day')
       ORDER BY l.expires_at ASC`
    ).all(days) as HouseholdSummaryRow[]
  },

  /** Keluarga yang sudah kadaluarsa atau ditangguhkan. */
  async listExpired(): Promise<HouseholdSummaryRow[]> {
    return await db.prepare(
      `${SUMMARY_SELECT}
       WHERE l.status IN ('expired','suspended')
          OR (l.expires_at IS NOT NULL AND l.expires_at < NOW())
       ORDER BY l.expires_at ASC NULLS LAST`
    ).all() as HouseholdSummaryRow[]
  },

  async statusCounts(): Promise<Record<LicenseRow["status"], number>> {
    const rows = await db.prepare(
      "SELECT status, COUNT(*)::int AS n FROM licenses GROUP BY status"
    ).all() as { status: LicenseRow["status"]; n: number }[]
    const counts = { active: 0, trial: 0, expired: 0, suspended: 0 }
    for (const r of rows) counts[r.status] = r.n
    return counts
  },

  async revenueByPlan(): Promise<PlanRevenueRow[]> {
    return await db.prepare(
      `SELECT plan_type,
              COUNT(*)::int AS households,
              COALESCE(SUM(price), 0) AS revenue
       FROM licenses GROUP BY plan_type ORDER BY revenue DESC`
    ).all() as PlanRevenueRow[]
  },

  async totalRevenue(): Promise<number> {
    const row = await db.prepare(
      "SELECT COALESCE(SUM(price), 0) AS revenue FROM licenses"
    ).get() as { revenue: number } | undefined
    return row?.revenue ?? 0
  },

  async countMembers(householdId: string): Promise<number> {
    const row = await db.prepare("SELECT COUNT(*)::int AS n FROM household_members WHERE household_id = ?")
      .get(householdId) as { n: number } | undefined
    return row?.n ?? 0
  },

  async countAllMembers(): Promise<number> {
    const row = await db.prepare("SELECT COUNT(*)::int AS n FROM household_members").get() as
      | { n: number }
      | undefined
    return row?.n ?? 0
  },

  async update(householdId: string, v: LicenseValues & { price?: number }): Promise<number> {
    if (v.price === undefined) {
      const res = await db.prepare(
        `UPDATE licenses SET plan_type = ?, status = ?, max_members = ?, expires_at = ?, updated_at = NOW()
         WHERE household_id = ?`
      ).run(v.plan_type, v.status, v.max_members, v.expires_at, householdId)
      return res.changes
    }
    const res = await db.prepare(
      `UPDATE licenses SET plan_type = ?, status = ?, max_members = ?, expires_at = ?, price = ?, updated_at = NOW()
       WHERE household_id = ?`
    ).run(v.plan_type, v.status, v.max_members, v.expires_at, v.price, householdId)
    return res.changes
  },

  /** Perpanjangan: geser tanggal kadaluarsa & aktifkan kembali. */
  async renew(householdId: string, expiresAt: string, price?: number): Promise<number> {
    if (price === undefined) {
      const res = await db.prepare(
        `UPDATE licenses SET expires_at = ?, status = 'active', updated_at = NOW()
         WHERE household_id = ?`
      ).run(expiresAt, householdId)
      return res.changes
    }
    const res = await db.prepare(
      `UPDATE licenses SET expires_at = ?, status = 'active', price = ?, sold_at = NOW(), updated_at = NOW()
       WHERE household_id = ?`
    ).run(expiresAt, price, householdId)
    return res.changes
  },

  /** Catat transaksi penjualan: harga + tanggal jual. */
  async recordSale(householdId: string, price: number, planType?: string): Promise<number> {
    if (planType) {
      const res = await db.prepare(
        `UPDATE licenses SET price = ?, plan_type = ?, sold_at = NOW(), updated_at = NOW()
         WHERE household_id = ?`
      ).run(price, planType, householdId)
      return res.changes
    }
    const res = await db.prepare(
      "UPDATE licenses SET price = ?, sold_at = NOW(), updated_at = NOW() WHERE household_id = ?"
    ).run(price, householdId)
    return res.changes
  },

  async insertHousehold(id: string, name: string): Promise<void> {
    await db.prepare("INSERT INTO households (id, name) VALUES (?, ?)").run(id, name)
  },

  async insertLicense(id: string, householdId: string, v: LicenseValues & { price?: number }): Promise<void> {
    await db.prepare(
      `INSERT INTO licenses (id, household_id, plan_type, status, max_members, expires_at, price, sold_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      householdId,
      v.plan_type,
      v.status,
      v.max_members,
      v.expires_at,
      v.price ?? 0,
      (v.price ?? 0) > 0 ? new Date().toISOString() : null,
    )
  },
}
