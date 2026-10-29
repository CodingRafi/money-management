"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireSessionAction } from "@/lib/session"
import { SCOPE_COOKIE } from "@/lib/scope"

const scopeSchema = z.union([z.literal("family"), z.string().regex(/^user:[A-Za-z0-9-]{1,64}$/)])

export async function setScope(value: string): Promise<void> {
  const session = await requireSessionAction()
  // Hanya Admin Keluarga yang boleh berpindah; kepemilikan target divalidasi di resolveScope().
  if (session.householdRole !== "admin") return
  const parsed = scopeSchema.parse(value)
  const store = await cookies()
  store.set(SCOPE_COOKIE, parsed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  })
  revalidatePath("/", "layout")
}
