import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { validateSession, LOCAL_USER_ID, type SessionData, type UserRole } from "./auth-simple"

export { LOCAL_USER_ID }
export type { SessionData }

export const SESSION_COOKIE = "session_token"

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge:   30 * 24 * 60 * 60,
  path:     "/",
}

/** Dibungkus cache() agar layout + page dalam satu request hanya query sekali. */
export const getSession = cache(async (): Promise<SessionData | null> => {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  return await validateSession(token)
})

/** Use in pages — redirects to /login if not authenticated */
export async function requireSession(): Promise<SessionData> {
  const session = await getSession()
  if (!session) redirect("/login")
  return session
}

/** Use in server actions — throws if not authenticated */
export async function requireSessionAction(): Promise<SessionData> {
  const session = await getSession()
  if (!session) throw new Error("Unauthenticated")
  return session
}

/** Hanya role tertentu (mis. super_admin). Selain itu 403 → /dashboard. */
export async function requireRole(...roles: UserRole[]): Promise<SessionData> {
  const session = await requireSession()
  if (!roles.includes(session.role)) redirect("/dashboard")
  return session
}

export async function requireRoleAction(...roles: UserRole[]): Promise<SessionData> {
  const session = await requireSessionAction()
  if (!roles.includes(session.role)) throw new Error("Forbidden")
  return session
}

export async function requireUserId(): Promise<string> {
  return (await requireSession()).userId
}

export async function requireUserIdAction(): Promise<string> {
  return (await requireSessionAction()).userId
}

export type HouseholdSession = SessionData & { householdId: string }

/** Halaman yang butuh data keluarga. Super admin tanpa keluarga diarahkan ke /super-admin. */
export async function requireHouseholdSession(): Promise<HouseholdSession> {
  const session = await requireSession()
  if (!session.householdId) redirect(session.role === "super_admin" ? "/super-admin" : "/license-expired")
  return { ...session, householdId: session.householdId }
}

export async function requireHouseholdSessionAction(): Promise<HouseholdSession> {
  const session = await requireSessionAction()
  if (!session.householdId) throw new Error("Forbidden")
  return { ...session, householdId: session.householdId }
}
