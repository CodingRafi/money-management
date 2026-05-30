"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { pool } from "@/lib/db"
import { seedUserCategories } from "@/lib/seedUserCategories"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error("Unauthenticated")
  return session
}

export async function claimLicence(_prev: unknown, formData: FormData) {
  const session = await requireUser()
  const code    = (formData.get("code") as string)?.trim().toUpperCase()
  if (!code) return { error: "Kode lisensi diperlukan" }

  try {
    const { rows } = await pool.query<{ id: string; user_id: string | null; status: string }>(
      `SELECT id, user_id, status FROM licences WHERE code = $1`,
      [code],
    )

    if (rows.length === 0) return { error: "Kode lisensi tidak ditemukan" }
    const lic = rows[0]

    if (lic.user_id && lic.user_id !== session.user.id)
      return { error: "Kode lisensi sudah digunakan oleh pengguna lain" }
    if (lic.status === "SUSPENDED")
      return { error: "Lisensi ini dinonaktifkan. Hubungi admin." }
    if (lic.user_id === session.user.id)
      return { error: "Kamu sudah mengklaim lisensi ini" }

    await pool.query(
      `UPDATE licences SET user_id = $1, updated_at = NOW() WHERE id = $2`,
      [session.user.id, lic.id],
    )
    await pool.query(
      `INSERT INTO licence_history (id, licence_id, action, note, created_at)
       VALUES (gen_random_uuid()::text, $1, 'CLAIMED', $2, NOW())`,
      [lic.id, `Diklaim oleh ${session.user.email}`],
    )

    await seedUserCategories(session.user.id).catch((err) => {
      console.error("seedUserCategories failed:", err)
    })

    revalidatePath("/")
    return { success: true }
  } catch {
    return { error: "Terjadi kesalahan. Coba lagi." }
  }
}
