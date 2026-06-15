import { db } from "./db"
import bcryptjs from "bcryptjs"
import crypto from "crypto"

export const LOCAL_USER_ID = "local-user"
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function verifyPassword(username: string, password: string): boolean {
  const row = db.prepare("SELECT password_hash FROM credentials WHERE username = ?").get(username) as
    | { password_hash: string }
    | undefined
  if (!row) return false
  return bcryptjs.compareSync(password, row.password_hash)
}

export function createSession(): string {
  const token = crypto.randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  db.prepare("INSERT INTO user_sessions (token, expires_at) VALUES (?, ?)").run(token, expiresAt)
  return token
}

export function validateSession(token: string): { userId: string; username: string } | null {
  const row = db.prepare("SELECT expires_at FROM user_sessions WHERE token = ?").get(token) as
    | { expires_at: string }
    | undefined
  if (!row) return null
  if (new Date(row.expires_at) < new Date()) {
    db.prepare("DELETE FROM user_sessions WHERE token = ?").run(token)
    return null
  }
  const cred = db.prepare("SELECT username FROM credentials LIMIT 1").get() as
    | { username: string }
    | undefined
  return { userId: LOCAL_USER_ID, username: cred?.username ?? "TONAS" }
}

export function deleteSession(token: string): void {
  db.prepare("DELETE FROM user_sessions WHERE token = ?").run(token)
}

export function changeCredentials(newUsername: string, newPassword: string): void {
  const hash = bcryptjs.hashSync(newPassword, 10)
  db.prepare("UPDATE credentials SET username = ?, password_hash = ?").run(newUsername, hash)
}

export function getUsername(): string {
  const row = db.prepare("SELECT username FROM credentials LIMIT 1").get() as
    | { username: string }
    | undefined
  return row?.username ?? "TONAS"
}
