import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"

// Vercel Cron: runs daily at 08:00 WIB (01:00 UTC)
// vercel.json: { "crons": [{ "path": "/api/cron/licence-check", "schedule": "0 1 * * *" }] }
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()

  // Auto-transition ACTIVE → GRACE → EXPIRED
  await pool.query(
    `UPDATE licences
     SET status = 'GRACE'::licence_status, updated_at = NOW()
     WHERE status = 'ACTIVE'
       AND expired_at IS NOT NULL
       AND expired_at < $1
       AND expired_at + (grace_period * interval '1 day') >= $1`,
    [now],
  )

  await pool.query(
    `UPDATE licences
     SET status = 'EXPIRED'::licence_status, updated_at = NOW()
     WHERE status IN ('ACTIVE', 'GRACE')
       AND expired_at IS NOT NULL
       AND expired_at + (grace_period * interval '1 day') < $1`,
    [now],
  )

  // Collect expiring-soon licences (H-7 and H-3) for future email sending
  const { rows: expiringH7 } = await pool.query(
    `SELECT l.id, l.code, u.email, u.name, l.expired_at
     FROM licences l
     LEFT JOIN "user" u ON u.id = l.user_id
     WHERE l.status = 'ACTIVE'
       AND l.expired_at IS NOT NULL
       AND l.expired_at BETWEEN $1 AND $2`,
    [
      new Date(now.getTime() + 6 * 86_400_000),
      new Date(now.getTime() + 7 * 86_400_000),
    ],
  )

  const { rows: expiringH3 } = await pool.query(
    `SELECT l.id, l.code, u.email, u.name, l.expired_at
     FROM licences l
     LEFT JOIN "user" u ON u.id = l.user_id
     WHERE l.status = 'ACTIVE'
       AND l.expired_at IS NOT NULL
       AND l.expired_at BETWEEN $1 AND $2`,
    [
      new Date(now.getTime() + 2 * 86_400_000),
      new Date(now.getTime() + 3 * 86_400_000),
    ],
  )

  // TODO: send email reminders via your email provider (Resend, Nodemailer, etc.)
  // expiringH7 → kirim email reminder H-7
  // expiringH3 → kirim email reminder H-3
  console.log(`[cron] H-7 reminders: ${expiringH7.length}, H-3 reminders: ${expiringH3.length}`)

  return NextResponse.json({
    ok: true,
    processed: { h7: expiringH7.length, h3: expiringH3.length },
  })
}
