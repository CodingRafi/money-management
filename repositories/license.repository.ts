import { db } from "@/lib/db"

export interface LicenseRow {
  id: string
  household_id: string
  plan_type: string
  status: "active" | "expired" | "suspended" | "trial"
  max_members: number
  starts_at: string
  expires_at: string | null
}

export interface HouseholdSummaryRow {
  id: string
  name: string
  plan_type: string
  status: LicenseRow["status"]
  max_members: number
  expires_at: string | null
  member_count: number
  admin_username: string | null
}

type LicenseValues = {
  plan_type: string
  status: LicenseRow["status"]
  max_members: number
  expires_at: string | null
}

export const licenseRepository = {
  async findByHousehold(householdId: string): Promise<LicenseRow | undefined> {
    return await db.prepare(
      "SELECT id, household_id, plan_type, status, max_members, starts_at, expires_at FROM licenses WHERE household_id = ?"
    ).get(householdId) as LicenseRow | undefined
  },

  async listHouseholds(search?: string): Promise<HouseholdSummaryRow[]> {
    const like = `%${(search ?? "").toLowerCase()}%`
    return await db.prepare(
      `SELECT h.id, h.name, l.plan_type, l.status, l.max_members, l.expires_at,
              (SELECT COUNT(*)::int FROM household_members m WHERE m.household_id = h.id) AS member_count,
              (SELECT u.username FROM household_members m JOIN "user" u ON u.id = m.user_id
                 WHERE m.household_id = h.id AND m.role = 'admin' ORDER BY m.created_at LIMIT 1) AS admin_username
       FROM households h
       JOIN licenses l ON l.household_id = h.id
       WHERE LOWER(h.name) LIKE ?
          OR EXISTS (SELECT 1 FROM household_members m JOIN "user" u ON u.id = m.user_id
                     WHERE m.household_id = h.id AND LOWER(u.username) LIKE ?)
       ORDER BY h.created_at DESC`
    ).all(like, like) as HouseholdSummaryRow[]
  },

  async countMembers(householdId: string): Promise<number> {
    const row = await db.prepare("SELECT COUNT(*)::int AS n FROM household_members WHERE household_id = ?")
      .get(householdId) as { n: number } | undefined
    return row?.n ?? 0
  },

  async update(householdId: string, v: LicenseValues): Promise<number> {
    const res = await db.prepare(
      `UPDATE licenses SET plan_type = ?, status = ?, max_members = ?, expires_at = ?, updated_at = NOW()
       WHERE household_id = ?`
    ).run(v.plan_type, v.status, v.max_members, v.expires_at, householdId)
    return res.changes
  },

  async insertHousehold(id: string, name: string): Promise<void> {
    await db.prepare("INSERT INTO households (id, name) VALUES (?, ?)").run(id, name)
  },

  async insertLicense(id: string, householdId: string, v: LicenseValues): Promise<void> {
    await db.prepare(
      "INSERT INTO licenses (id, household_id, plan_type, status, max_members, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, householdId, v.plan_type, v.status, v.max_members, v.expires_at)
  },
}
