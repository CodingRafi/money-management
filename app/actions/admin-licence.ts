"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { pool } from "@/lib/db"
import { generateCode } from "@/lib/licence"
import { userHasPermission } from "@/lib/permissions"

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error("Unauthenticated")
  const ok = await userHasPermission(session.user.id, "manage_roles")
  if (!ok) throw new Error("Unauthorized")
  return session
}

function parsePrice(raw: FormDataEntryValue | null): number | null {
  if (!raw) return null
  const n = parseFloat(raw as string)
  return isNaN(n) || n < 0 ? null : n
}

export async function generateLicenceAction(_prev: unknown, formData: FormData) {
  await requireAdmin()

  const noExpiry    = formData.get("noExpiry") === "on"
  const expiredAtStr = formData.get("expiredAt") as string
  const expiredAt   = noExpiry ? null : expiredAtStr ? new Date(expiredAtStr) : null

  if (!noExpiry && !expiredAt) return { error: "Tanggal expired diperlukan" }

  const gracePeriod = parseInt(formData.get("gracePeriod") as string) || 3
  const price       = parsePrice(formData.get("price"))
  const code        = generateCode()

  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO licences (id, code, status, grace_period, expired_at, price)
       VALUES (gen_random_uuid()::text, $1, 'ACTIVE', $2, $3, $4)
       RETURNING id`,
      [code, gracePeriod, expiredAt, price],
    )
    await pool.query(
      `INSERT INTO licence_history (id, licence_id, action, created_at)
       VALUES (gen_random_uuid()::text, $1, 'CREATED', NOW())`,
      [rows[0].id],
    )
    revalidatePath("/admin/licences")
    return { success: true, code }
  } catch {
    return { error: "Gagal membuat lisensi. Coba lagi." }
  }
}

export async function suspendLicenceAction(licenceId: string, note?: string) {
  await requireAdmin()
  await pool.query(
    `UPDATE licences SET status = 'SUSPENDED', updated_at = NOW() WHERE id = $1`,
    [licenceId],
  )
  await pool.query(
    `INSERT INTO licence_history (id, licence_id, action, note, created_at)
     VALUES (gen_random_uuid()::text, $1, 'SUSPENDED', $2, NOW())`,
    [licenceId, note ?? null],
  )
  revalidatePath("/admin/licences")
}

export async function activateLicenceAction(licenceId: string) {
  await requireAdmin()
  await pool.query(
    `UPDATE licences SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
    [licenceId],
  )
  await pool.query(
    `INSERT INTO licence_history (id, licence_id, action, created_at)
     VALUES (gen_random_uuid()::text, $1, 'ACTIVATED', NOW())`,
    [licenceId],
  )
  revalidatePath("/admin/licences")
}

export async function renewLicenceAction(_prev: unknown, formData: FormData) {
  await requireAdmin()

  const licenceId    = formData.get("licenceId") as string
  const noExpiry     = formData.get("noExpiry") === "on"
  const expiredAtStr = formData.get("newExpiredAt") as string
  const newExpiredAt = noExpiry ? null : expiredAtStr ? new Date(expiredAtStr) : null
  const price        = parsePrice(formData.get("price"))

  if (!noExpiry && !newExpiredAt) return { error: "Tanggal expired diperlukan" }

  await pool.query(
    `UPDATE licences SET expired_at = $1, status = 'ACTIVE', price = $2, updated_at = NOW()
     WHERE id = $3`,
    [newExpiredAt, price, licenceId],
  )
  await pool.query(
    `INSERT INTO licence_history (id, licence_id, action, created_at)
     VALUES (gen_random_uuid()::text, $1, 'RENEWED', NOW())`,
    [licenceId],
  )
  revalidatePath("/admin/licences")
  return { success: true }
}

export async function deleteLicenceAction(licenceId: string) {
  await requireAdmin()

  const { rows } = await pool.query<{ user_id: string | null }>(
    `SELECT user_id FROM licences WHERE id = $1`,
    [licenceId],
  )
  if (!rows[0]) throw new Error("Lisensi tidak ditemukan")
  if (rows[0].user_id) throw new Error("Lisensi yang sudah diklaim tidak dapat dihapus")

  await pool.query(`DELETE FROM licences WHERE id = $1`, [licenceId])
  revalidatePath("/admin/licences")
}
