import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { validateSession, LOCAL_USER_ID } from "./auth-simple"

export { LOCAL_USER_ID }

export async function getSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get("session_token")?.value
  if (!token) return null
  return validateSession(token)
}

/** Use in pages — redirects to /login if not authenticated */
export async function requireUserId(): Promise<string> {
  const session = await getSession()
  if (!session) redirect("/login")
  return session.userId
}

/** Use in server actions — throws if not authenticated */
export async function requireUserIdAction(): Promise<string> {
  const cookieStore = await cookies()
  const token = cookieStore.get("session_token")?.value
  if (!token) throw new Error("Unauthenticated")
  const session = validateSession(token)
  if (!session) throw new Error("Unauthenticated")
  return session.userId
}
