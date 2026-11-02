import { after, NextResponse } from "next/server"
import { handleTelegramUpdate, type TelegramUpdate } from "@/services/telegram.service"

/** Panjang maksimum eksekusi route (dipakai oleh `after()` saat memanggil AI). */
export const maxDuration = 60

/**
 * Webhook Telegram.
 *
 * Keamanan:
 *   * Telegram mengirim header `X-Telegram-Bot-Api-Secret-Token` yang kita
 *     samakan dengan TELEGRAM_WEBHOOK_SECRET. Tanpa itu, siapa pun bisa
 *     menyuruh bot mencatat transaksi.
 *
 * Balasan dikirim instan dan pemrosesan dilanjutkan lewat `after()`, supaya:
 *   * Telegram tidak mengulang update (retry) → tidak ada transaksi ganda.
 *   * Batas waktu Telegram (60 detik) tidak jadi masalah saat model berpikir.
 */
export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expected) {
    console.error("[telegram] TELEGRAM_WEBHOOK_SECRET belum diset")
    return NextResponse.json({ ok: false, error: "webhook belum dikonfigurasi" }, { status: 503 })
  }

  const provided = request.headers.get("x-telegram-bot-api-secret-token")
  if (!provided || provided !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  let update: TelegramUpdate
  try {
    update = (await request.json()) as TelegramUpdate
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 })
  }

  after(async () => {
    try {
      await handleTelegramUpdate(update)
    } catch (err) {
      console.error("[telegram] error saat menangani update:", err)
    }
  })

  return NextResponse.json({ ok: true })
}

/** Health check: apakah webhook terpasang & environment-nya lengkap. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: {
      botToken: !!process.env.TELEGRAM_BOT_TOKEN,
      webhookSecret: !!process.env.TELEGRAM_WEBHOOK_SECRET,
      geminiApiKey: !!process.env.GEMINI_API_KEY,
    },
  })
}
