import { db } from "./db"
import bcryptjs from "bcryptjs"
import crypto from "crypto"

export const LOCAL_USER_ID = "local-user"
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const BCRYPT_COST = 12

export const MAX_LOGIN_ATTEMPTS = 5
export const LOGIN_WINDOW_MINUTES = 15

export type UserRole = "super_admin" | "admin" | "member" | "child"
export type HouseholdRole = "admin" | "member" | "child"

export interface SessionData {
  userId: string
  username: string
  role: UserRole
  /** NULL untuk super_admin yang belum tergabung ke keluarga mana pun. */
  householdId: string | null
  householdRole: HouseholdRole | null
}

// ── Password ─────────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, BCRYPT_COST)
}

/** Mengembalikan userId jika kredensial benar, selain itu null. */
export async function verifyPassword(username: string, password: string): Promise<string | null> {
  const row = await db.prepare("SELECT id, password_hash FROM \"user\" WHERE username = ?").get(username) as
    | { id: string; password_hash: string | null }
    | undefined
  // Tetap jalankan compare agar waktu respons tidak membocorkan keberadaan username.
  const hash = row?.password_hash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva"
  const ok = await bcryptjs.compare(password, hash)
  return ok && row ? row.id : null
}

// ── Rate limiting ────────────────────────────────────────────────────────────

/** True bila identifier sudah melewati batas percobaan gagal dalam jendela waktu. */
export async function isRateLimited(identifiers: string[]): Promise<boolean> {
  for (const id of identifiers) {
    const row = await db.prepare(
      `SELECT COUNT(*)::int AS n FROM login_attempts
       WHERE identifier = ? AND attempted_at > NOW() - (? * INTERVAL '1 minute')`
    ).get(id, LOGIN_WINDOW_MINUTES) as { n: number } | undefined
    if ((row?.n ?? 0) >= MAX_LOGIN_ATTEMPTS) return true
  }
  return false
}

export async function recordFailedLogin(identifiers: string[]): Promise<void> {
  for (const id of identifiers) {
    await db.prepare("INSERT INTO login_attempts (identifier) VALUES (?)").run(id)
  }
  // Bersihkan catatan lama agar tabel tidak membengkak.
  await db.prepare("DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '1 day'").run()
}

export async function clearFailedLogins(identifiers: string[]): Promise<void> {
  for (const id of identifiers) {
    await db.prepare("DELETE FROM login_attempts WHERE identifier = ?").run(id)
  }
}

// ── Sesi ─────────────────────────────────────────────────────────────────────

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  await db.prepare("INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expiresAt)
  return token
}

export async function validateSession(token: string): Promise<SessionData | null> {
  const row = await db.prepare(
    `SELECT s.expires_at, u.id AS user_id, u.username, u.role,
            m.household_id, m.role AS household_role
     FROM user_sessions s
     JOIN "user" u ON u.id = s.user_id
     LEFT JOIN household_members m ON m.user_id = u.id
     WHERE s.token = ?`
  ).get(token) as
    | {
        expires_at: string
        user_id: string
        username: string | null
        role: UserRole
        household_id: string | null
        household_role: HouseholdRole | null
      }
    | undefined
  if (!row) return null
  if (new Date(row.expires_at) < new Date()) {
    await db.prepare("DELETE FROM user_sessions WHERE token = ?").run(token)
    return null
  }
  return {
    userId: row.user_id,
    username: row.username ?? "",
    role: row.role,
    householdId: row.household_id,
    householdRole: row.household_role,
  }
}

export async function deleteSession(token: string): Promise<void> {
  await db.prepare("DELETE FROM user_sessions WHERE token = ?").run(token)
}

export async function deleteSessionsForUser(userId: string): Promise<void> {
  await db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(userId)
}

// ── Kredensial ───────────────────────────────────────────────────────────────

export async function changeCredentials(userId: string, newUsername: string, newPassword: string): Promise<void> {
  const hash = await hashPassword(newPassword)
  await db.prepare("UPDATE \"user\" SET username = ?, password_hash = ? WHERE id = ?").run(newUsername, hash, userId)
}
