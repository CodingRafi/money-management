/**
 * Pasang / lepas webhook Telegram.
 *
 *   bun scripts/telegram-setup.ts          → pasang webhook
 *   bun scripts/telegram-setup.ts --remove → lepas webhook
 *
 * Env yang dibutuhkan:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, NEXT_PUBLIC_APP_URL
 */

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

function loadEnvFile() {
  for (const file of [".env.local", ".env"]) {
    const path = join(process.cwd(), file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, "utf-8").split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = value
    }
  }
}

loadEnvFile()

const BOT_API = process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org"
const token = process.env.TELEGRAM_BOT_TOKEN
const secret = process.env.TELEGRAM_WEBHOOK_SECRET
const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")

/**
 * Slash command yang muncul saat user mengetik "/" di chat.
 * Nama perintah: huruf kecil a-z, 0-9, dan underscore (maks 32 karakter).
 */
const BOT_COMMANDS = [
  { command: "start", description: "Mulai & lihat cara pakai" },
  { command: "link", description: "Hubungkan akun dengan kode koneksi" },
  { command: "unlink", description: "Putuskan hubungan akun" },
  { command: "riwayat", description: "Lihat 10 transaksi terakhir" },
  { command: "revisi", description: "Perbaiki transaksi yang salah catat" },
  { command: "status", description: "Lihat status koneksi akun" },
  { command: "help", description: "Bantuan & contoh perintah" },
]

async function api<T>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${BOT_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string }
  if (!data.ok) throw new Error(`${method} gagal: ${data.description ?? "tidak diketahui"}`)
  return data.result as T
}

async function main() {
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum diset")
  if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET belum diset")
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL belum diset")

  const webhookUrl = `${appUrl}/api/telegram/webhook`

  if (process.argv.includes("--remove")) {
    await api("deleteWebhook", { drop_pending_updates: false })
    console.log("✓ Webhook dilepas.")
    return
  }

  // Hanya pasang slash command, tanpa menyentuh webhook.
  if (!process.argv.includes("--commands-only")) {
    await api("setWebhook", {
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ["message"],
      drop_pending_updates: false,
    })
  }

  // ── Slash command (tag) ────────────────────────────────────────────────────
  // Daftar perintah yang muncul otomatis saat user mengetik "/" di chat.
  // Dipasang lewat API supaya ikut terpasang bareng webhook (tidak perlu
  // buka @BotFather manual).
  if (!process.argv.includes("--skip-commands")) {
    await api("setMyCommands", { commands: BOT_COMMANDS })
    console.log("✓ Slash command terpasang:")
    for (const c of BOT_COMMANDS) console.log(`   /${c.command.padEnd(8)} — ${c.description}`)
  }

  if (process.argv.includes("--commands-only")) {
    console.log("")
    console.log("Selesai — webhook tidak disentuh.")
    return
  }

  const info = await api<{ url: string; pending_update_count: number; last_error_message?: string }>(
    "getWebhookInfo",
  )
  console.log("✓ Webhook terpasang:")
  console.log(`   URL          : ${info.url}`)
  console.log(`   Update queued: ${info.pending_update_count}`)
  if (info.last_error_message) console.log(`   Error        : ${info.last_error_message}`)

  const bot = await api<{ username: string; first_name: string }>("getMe")
  console.log(`   Bot          : @${bot.username} (${bot.first_name})`)
  console.log("")
  console.log("Langkah berikutnya:")
  console.log("  1. Setiap anggota buka aplikasi → Saya → Telegram → Buat kode koneksi.")
  console.log("  2. Anggota mengirim /link KODE ke bot di atas.")
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
