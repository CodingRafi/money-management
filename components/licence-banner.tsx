import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { pool } from "@/lib/db"
import Link from "next/link"

type Row = { status: string; expired_at: Date | null; grace_period: number }

export async function LicenceBanner() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) return null

    const { rows } = await pool.query<Row>(
      `SELECT status, expired_at, grace_period FROM licences WHERE user_id = $1`,
      [session.user.id],
    )

    if (rows.length === 0) {
      return (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 text-sm text-blue-700 text-center">
          Kamu belum memiliki lisensi.{" "}
          <Link href="/licence/claim" className="font-semibold underline underline-offset-2">
            Klaim sekarang
          </Link>
        </div>
      )
    }

    const lic = rows[0]
    const now = new Date()

    if (lic.status === "SUSPENDED") {
      return (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 text-sm text-red-700 text-center">
          Lisensi kamu dinonaktifkan oleh admin. Hubungi admin untuk informasi lebih lanjut.
        </div>
      )
    }

    if (lic.expired_at) {
      const expiredAt = new Date(lic.expired_at)
      const graceEnd  = new Date(expiredAt.getTime() + lic.grace_period * 86_400_000)

      if (lic.status === "EXPIRED" || now > graceEnd) {
        return (
          <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 text-sm text-red-700 text-center">
            Lisensi kamu telah berakhir. Hubungi admin untuk perpanjangan.
          </div>
        )
      }

      if (lic.status === "GRACE" || now > expiredAt) {
        const daysLeft = Math.max(0, Math.ceil((graceEnd.getTime() - now.getTime()) / 86_400_000))
        return (
          <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2.5 text-sm text-yellow-700 text-center">
            Masa tenggang lisensi berakhir dalam {daysLeft} hari. Segera hubungi admin untuk perpanjangan.
          </div>
        )
      }

      const daysLeft = Math.ceil((expiredAt.getTime() - now.getTime()) / 86_400_000)
      if (daysLeft <= 7) {
        return (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-sm text-amber-700 text-center">
            Lisensi kamu akan berakhir dalam {daysLeft} hari.
          </div>
        )
      }
    }

    return null
  } catch {
    return null
  }
}
