"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireSessionAction } from "@/lib/session"
import { memberService } from "@/services/member.service"

/**
 * Aksi anggota keluarga.
 *
 * CATATAN: penambahan anggota TIDAK tersedia di sini. Membuat akun anggota
 * adalah kewenangan Super Admin (pengelola SaaS) — lihat
 * `addMember` di `app/actions/super-admin.ts`. Kepala keluarga hanya bisa
 * melihat daftar anggota dan menghapus anggota yang sudah ada.
 */

/** household_id selalu dari sesi — tidak pernah dari form (anti-IDOR). */
async function requireFamilyAdmin() {
  const session = await requireSessionAction()
  if (session.householdRole !== "admin" || !session.householdId) throw new Error("Forbidden")
  return { ...session, householdId: session.householdId }
}

export async function removeMember(formData: FormData): Promise<void> {
  const session = await requireFamilyAdmin()
  const userId = z.string().min(1).parse(formData.get("userId"))
  await memberService.removeMember(session.householdId, session.userId, userId)
  revalidatePath("/pengaturan/anggota")
}
