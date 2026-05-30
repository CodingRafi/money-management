"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { pool } from "@/lib/db"
import { userHasPermission } from "@/lib/permissions"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error("Unauthenticated")
  return session
}

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error("Unauthenticated")
  const ok = await userHasPermission(session.user.id, "manage_roles")
  if (!ok) throw new Error("Unauthorized")
  return session
}

/** User mencabut salah satu sesi login mereka sendiri */
export async function revokeSessionAction(sessionId: string) {
  const session = await requireUser()

  await pool.query(
    `DELETE FROM session WHERE id = $1 AND "userId" = $2`,
    [sessionId, session.user.id],
  )

  revalidatePath("/settings/devices")
}

/** Admin mencabut sesi login milik user mana pun */
export async function adminRevokeSessionAction(sessionId: string, licenceId: string) {
  await requireAdmin()

  await pool.query(`DELETE FROM session WHERE id = $1`, [sessionId])

  revalidatePath(`/admin/licences/${licenceId}`)
}
