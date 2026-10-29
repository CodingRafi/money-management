import { db } from "@/lib/db"

export type LicenseEventType =
  | "sale"
  | "renewal"
  | "status_change"
  | "upgrade"
  | "created"
  | "member_change"

export interface LicenseEventRow {
  id: string
  household_id: string
  event_type: LicenseEventType
  amount: number
  plan_type: string | null
  note: string | null
  created_by: string | null
  created_at: string
}

export interface LicenseEventWithHousehold extends LicenseEventRow {
  household_name: string
}

export const licenseEventRepository = {
  async insert(v: {
    id: string
    householdId: string
    eventType: LicenseEventType
    amount?: number
    planType?: string | null
    note?: string | null
    createdBy?: string | null
  }): Promise<void> {
    await db.prepare(
      `INSERT INTO license_events (id, household_id, event_type, amount, plan_type, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      v.id,
      v.householdId,
      v.eventType,
      v.amount ?? 0,
      v.planType ?? null,
      v.note ?? null,
      v.createdBy ?? null,
    )
  },

  async listByHousehold(householdId: string): Promise<LicenseEventRow[]> {
    return await db.prepare(
      `SELECT id, household_id, event_type, amount, plan_type, note, created_by, created_at
       FROM license_events WHERE household_id = ? ORDER BY created_at DESC`
    ).all(householdId) as LicenseEventRow[]
  },

  async listRecent(limit = 20): Promise<LicenseEventWithHousehold[]> {
    return await db.prepare(
      `SELECT e.id, e.household_id, e.event_type, e.amount, e.plan_type, e.note, e.created_by,
              e.created_at, h.name AS household_name
       FROM license_events e
       JOIN households h ON h.id = e.household_id
       ORDER BY e.created_at DESC LIMIT ?`
    ).all(limit) as LicenseEventWithHousehold[]
  },

  async revenueSince(days: number): Promise<number> {
    const row = await db.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS revenue FROM license_events
       WHERE event_type IN ('sale','renewal') AND created_at > NOW() - (? * INTERVAL '1 day')`
    ).get(days) as { revenue: number } | undefined
    return row?.revenue ?? 0
  },
}
