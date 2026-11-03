import { db } from "@/lib/db"
import type { SessionData } from "@/lib/auth-simple"

/**
 * Scope pembacaan data untuk perintah laporan Telegram.
 *
 * Aturannya sama dengan aplikasi web (lib/scope.ts) dan dengan
 * lib/telegram/budget-status.ts:
 *
 * - Admin keluarga → mode keluarga: seluruh data anggota.
 * - Anggota biasa   → mode pribadi: datanya sendiri saja, dan beban
 *   rumah tangga (is_family_expense) tidak ikut dihitung.
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
  if (session.householdId && session.householdRole === "admin") {
    const rows = await db
      .prepare("SELECT user_id FROM household_members WHERE household_id = ?")
      .all(session.householdId) as { user_id: string }[]
    const userIds = rows.map((r) => r.user_id)
    return {
      userIds: userIds.length > 0 ? userIds : [session.userId],
      mode: "family",
      excludeFamilyExpense: false,
      label: "Keluarga",
    }
  }

  return {
    userIds: [session.userId],
    mode: "personal",
    excludeFamilyExpense: true,
    label: "Pribadi",
  }
}
