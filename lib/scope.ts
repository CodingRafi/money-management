import { cookies } from "next/headers"
import { cache } from "react"
import { getSession, requireSessionAction, type HouseholdSession } from "./session"
import type { SessionData } from "./auth-simple"
import { memberRepository, type MemberRow } from "@/repositories/member.repository"
import { redirect } from "next/navigation"

export const SCOPE_COOKIE = "view_scope"

export type ScopeMode = "family" | "personal"

export interface Scope {
  mode: ScopeMode
  householdId: string | null
  /** user_id yang datanya dibaca. Mode keluarga = seluruh anggota. */
  userIds: string[]
  /** Pemilik data pada mode personal (bisa anggota lain bila Admin mengintip). */
  targetUserId: string
  /** Admin melihat data anggota lain → tidak boleh menulis. */
  readOnly: boolean
  /** Hanya Admin yang punya mode keluarga & bisa melihat anggota lain. */
  canSwitch: boolean
  members: MemberRow[]
}

/**
 * Resolusi scope dari sesi + cookie preferensi. Cookie hanya preferensi tampilan:
 * nilainya SELALU divalidasi ulang terhadap keanggotaan keluarga di server, jadi
 * mengubah cookie ke user/keluarga lain tidak memberi akses (anti-IDOR).
 */
export const resolveScope = cache(async (): Promise<Scope | null> => {
  const session = await getSession()
  if (!session) return null

  const selfOnly: Scope = {
    mode: "personal",
    householdId: session.householdId,
    userIds: [session.userId],
    targetUserId: session.userId,
    readOnly: false,
    canSwitch: false,
    members: [],
  }
  if (!session.householdId || session.householdRole !== "admin") return selfOnly

  const members = await memberRepository.list(session.householdId)
  const pref = (await cookies()).get(SCOPE_COOKIE)?.value ?? "family"

  if (pref.startsWith("user:")) {
    const target = members.find((m) => m.user_id === pref.slice(5))
    if (target) {
      return {
        mode: "personal",
        householdId: session.householdId,
        userIds: [target.user_id],
        targetUserId: target.user_id,
        readOnly: target.user_id !== session.userId,
        canSwitch: true,
        members,
      }
    }
  }

  return {
    mode: "family",
    householdId: session.householdId,
    userIds: members.map((m) => m.user_id),
    targetUserId: session.userId,
    readOnly: false,
    canSwitch: true,
    members,
  }
})

export async function requireScope(): Promise<Scope> {
  const scope = await resolveScope()
  if (!scope) redirect("/login")
  return scope
}

export function isHouseholdSession(s: unknown): s is HouseholdSession {
  return !!s && typeof (s as HouseholdSession).householdId === "string"
}

/** Untuk Server Action yang menulis data: ditolak saat Admin sedang melihat anggota lain (read-only). */
export async function requireWritableSession(): Promise<SessionData> {
  const session = await requireSessionAction()
  const scope = await resolveScope()
  if (scope?.readOnly) throw new Error("Mode read-only: beralih ke mode Anda untuk mengubah data")
  return session
}

export async function requireWritableUserId(): Promise<string> {
  return (await requireWritableSession()).userId
}
