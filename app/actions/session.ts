"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { pool } from "@/lib/db"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error("Unauthenticated")
  return session
}

export async function revokeSessionAction(sessionId: string) {
  const session = await requireUser()
  await pool.query(
    `DELETE FROM session WHERE id = $1 AND "userId" = $2`,
    [sessionId, session.user.id],
  )
  revalidatePath("/settings/devices")
}
