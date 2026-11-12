import type { SessionData } from "@/lib/auth-simple"

/**
 * Scope pembacaan data untuk perintah bot Telegram.
 *
 * Bot selalu bekerja di mode pribadi, untuk SEMUA peran (termasuk admin
 * keluarga): hanya data milik user yang sedang chat, dan beban rumah tangga
 * (is_family_expense) tidak ikut dihitung — sama seperti mode pribadi di web.
 * Rekap keluarga tetap dilihat lewat aplikasi web.
 */

export type TgScopeMode = "family" | "personal"

export interface TgScope {
  /** user_id yang datanya boleh dibaca. */
  userIds: string[]
  mode: TgScopeMode
  /** Di mode pribadi, beban rumah tangga tidak ikut dihitung. */
  excludeFamilyExpense: boolean
  /** Label singkat untuk ditampilkan di judul laporan. */
  label: string
}

export async function resolveTgScope(session: SessionData): Promise<TgScope> {
  return {
    userIds: [session.userId],
    mode: "personal",
    excludeFamilyExpense: true,
    label: "Pribadi",
  }
}
