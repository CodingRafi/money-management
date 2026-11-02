"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireSessionAction } from "@/lib/session"
import { SCOPE_COOKIE } from "@/lib/scope"
import { memberRepository } from "@/repositories/member.repository"

const scopeSchema = z.union([z.literal("family"), z.string().regex(/^user:[A-Za-z0-9_-]{1,64}$/)])

/**
 * Ganti konteks tampilan (Keluarga ↔ Personal per anggota).
 *
 * Cookie hanya preferensi tampilan: nilainya selalu divalidasi ulang terhadap
 * keanggotaan keluarga di `resolveScope()`. Di sini tetap divalidasi supaya
 * cookie tidak pernah berisi user di luar keluarga ini.
 */
export async function setScope(value: string): Promise<void> {
  const session = await requireSessionAction()
  // Hanya Admin Keluarga yang boleh berpindah; kepemilikan target divalidasi di resolveScope().
  if (session.householdRole !== "admin" || !session.householdId) return

  const parsed = scopeSchema.safeParse(value)
  if (!parsed.success) return

  if (parsed.data !== "family") {
    const targetUserId = parsed.data.slice(5)
    const members = await memberRepository.list(session.householdId)
    if (!members.some((m) => m.user_id === targetUserId)) return
  }

  const store = await cookies()
  store.set(SCOPE_COOKIE, parsed.data, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  })
  revalidatePath("/", "layout")
}
