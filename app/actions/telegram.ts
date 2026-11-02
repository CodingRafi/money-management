"use server"

import crypto from "crypto"
import { revalidatePath } from "next/cache"
import { requireSession } from "@/lib/session"
import { telegramRepository } from "@/repositories/telegram.repository"

const CODE_TTL_MINUTES = 15

/** Alfabet tanpa karakter ambigu (0/O, 1/I/L) supaya kode mudah diketik dari HP. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

function generateCode(): string {
  const bytes = crypto.randomBytes(CODE_ALPHABET.length)
  let out = ""
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return out
}

/**
 * Buat kode koneksi sekali pakai.
 * Kode dikirim ke Telegram lewat perintah `/link KODE`.
 */
export async function createTelegramLinkCode(): Promise<{ code: string; expiresAt: string }> {
  const session = await requireSession()
  if (!session.householdId) throw new Error("Akun ini belum anggota keluarga")

  const code = generateCode()
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString()
  await telegramRepository.createCode(code, session.userId, expiresAt)
  await telegramRepository.deleteExpiredCodes()

  revalidatePath("/integrasi/telegram")
  return { code, expiresAt }
}

/** Putuskan hubungan akun dengan chat Telegram. */
export async function unlinkTelegram(): Promise<{ removed: boolean }> {
  const session = await requireSession()
  const removed = (await telegramRepository.deleteByUserId(session.userId)) > 0
  revalidatePath("/integrasi/telegram")
  return { removed }
}
