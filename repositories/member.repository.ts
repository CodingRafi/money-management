import { db } from "@/lib/db"

export interface MemberRow {
  user_id: string
  username: string | null
  name: string
  role: "admin" | "member" | "child"
  relation: string | null
  spending_limit: number | null
  /** false = akun belum punya password, harus diset Super Admin. */
  has_password: boolean
}

export interface MemberWithHouseholdRow extends MemberRow {
  household_id: string
  household_name: string
}

export const memberRepository = {
  async usernameExists(username: string): Promise<boolean> {
    const row = await db.prepare('SELECT 1 FROM "user" WHERE LOWER(username) = LOWER(?)').get(username)
    return !!row
  },

  async insertUser(v: {
    id: string; username: string; name: string; email: string
    passwordHash: string; role: string; relation: string | null
  }): Promise<void> {
    await db.prepare(
      `INSERT INTO "user" (id, name, email, username, password_hash, role, relation)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(v.id, v.name, v.email, v.username, v.passwordHash, v.role, v.relation)
  },

  async insertMember(v: {
    householdId: string; userId: string; role: string; relation: string | null; spendingLimit: number | null
  }): Promise<void> {
    await db.prepare(
      `INSERT INTO household_members (household_id, user_id, role, relation, spending_limit)
       VALUES (?, ?, ?, ?, ?)`
    ).run(v.householdId, v.userId, v.role, v.relation, v.spendingLimit)
  },

  async list(householdId: string): Promise<MemberRow[]> {
    return await db.prepare(
      `SELECT m.user_id, u.username, u.name, m.role, m.relation, m.spending_limit,
              (u.password_hash IS NOT NULL) AS has_password
       FROM household_members m JOIN "user" u ON u.id = m.user_id
       WHERE m.household_id = ? ORDER BY m.created_at`
    ).all(householdId) as MemberRow[]
  },

  /** Semua anggota lintas keluarga — untuk halaman anggota milik Super Admin. */
  async listAllWithHousehold(): Promise<MemberWithHouseholdRow[]> {
    return await db.prepare(
      `SELECT m.user_id, u.username, u.name, m.role, m.relation, m.spending_limit,
              (u.password_hash IS NOT NULL) AS has_password,
              m.household_id, h.name AS household_name
       FROM household_members m
       JOIN "user" u ON u.id = m.user_id
       JOIN households h ON h.id = m.household_id
       ORDER BY h.name, m.created_at`
    ).all() as MemberWithHouseholdRow[]
  },

  /** Hanya mengembalikan baris bila user memang anggota keluarga tsb (anti-IDOR). */
  async find(householdId: string, userId: string): Promise<MemberRow | undefined> {
    return await db.prepare(
      `SELECT m.user_id, u.username, u.name, m.role, m.relation, m.spending_limit,
              (u.password_hash IS NOT NULL) AS has_password
       FROM household_members m JOIN "user" u ON u.id = m.user_id
       WHERE m.household_id = ? AND m.user_id = ?`
    ).get(householdId, userId) as MemberRow | undefined
  },

  async setPassword(userId: string, passwordHash: string): Promise<number> {
    const res = await db.prepare(
      'UPDATE "user" SET password_hash = ? WHERE id = ?'
    ).run(passwordHash, userId)
    return res.changes
  },

  async deleteUser(userId: string): Promise<void> {
    await db.prepare('DELETE FROM "user" WHERE id = ?').run(userId)
  },

  async updateSpendingLimit(householdId: string, userId: string, limit: number | null): Promise<number> {
    const res = await db.prepare(
      "UPDATE household_members SET spending_limit = ? WHERE household_id = ? AND user_id = ?"
    ).run(limit, householdId, userId)
    return res.changes
  },
}
