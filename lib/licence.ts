import { pool } from "./db"

export type LicenceStatus = "ACTIVE" | "GRACE" | "EXPIRED" | "SUSPENDED"

export interface LicenceInfo {
  id: string
  status: LicenceStatus
  isGrace: boolean
  daysUntilExpiry: number | null
}

export function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  const seg = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
  return `LIC-${seg()}-${seg()}-${seg()}`
}

/**
 * Cek & sinkronisasi status lisensi user — auto-transisi ACTIVE→GRACE→EXPIRED.
 * Tidak ada logika device; session management dilakukan via tabel session Better Auth.
 * Return null jika user tidak punya lisensi.
 */
export async function checkLicenceStatus(userId: string): Promise<LicenceInfo | null> {
  const { rows } = await pool.query<{
    id: string
    status: LicenceStatus
    grace_period: number
    expired_at: Date | null
  }>(
    `SELECT id, status, grace_period, expired_at FROM licences WHERE user_id = $1`,
    [userId],
  )

  if (!rows[0]) return null

  const lic = rows[0]
  const now = new Date()
  let status: LicenceStatus = lic.status

  if (lic.expired_at) {
    const expiredAt = new Date(lic.expired_at)
    const graceEnd  = new Date(expiredAt.getTime() + lic.grace_period * 86_400_000)

    if ((status === "ACTIVE" || status === "GRACE") && now > expiredAt) {
      status = now <= graceEnd ? "GRACE" : "EXPIRED"
      await pool.query(
        `UPDATE licences SET status = $1::licence_status, updated_at = NOW() WHERE id = $2`,
        [status, lic.id],
      )
    }
  }

  const expiredAt       = lic.expired_at ? new Date(lic.expired_at) : null
  const daysUntilExpiry = expiredAt && now < expiredAt
    ? Math.ceil((expiredAt.getTime() - now.getTime()) / 86_400_000)
    : null

  return { id: lic.id, status, isGrace: status === "GRACE", daysUntilExpiry }
}
