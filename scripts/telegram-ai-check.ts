/**
 * Uji jalur AI tanpa Telegram.
 *
 *   bun scripts/telegram-ai-check.ts "makan siang 25rb"
 *
 * Menjalankan pesan contoh langsung ke Gemini (function calling) memakai akun
 * anggota keluarga pertama di database, lalu menampilkan tool yang dipanggil
 * dan balasannya. Berguna untuk memastikan GEMINI_API_KEY & model sudah benar
 * sebelum webhook dipasang.
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

const { db } = await import("../lib/db")
const { getSessionForUser } = await import("../lib/auth-simple")
const { runTelegramAgent } = await import("../lib/telegram/agent")

async function main() {
  const message = process.argv[2] ?? "makan siang 25rb"

  const user = await db.prepare(
    `SELECT u.id FROM "user" u
     JOIN household_members m ON m.user_id = u.id
     ORDER BY u.created_at LIMIT 1`
  ).get() as { id: string } | undefined
  if (!user) throw new Error("Belum ada anggota keluarga di database")

  const session = await getSessionForUser(user.id)
  if (!session?.householdId) throw new Error("Session anggota tidak bisa dibuat")

  console.log(`Akun  : ${session.username}`)
  console.log(`Pesan : ${message}\n`)

  const out = await runTelegramAgent({
    ctx: { session, householdId: session.householdId },
    text: message,
  })

  console.log("Tool  :", out.toolsUsed.join(", ") || "(tidak ada)")
  console.log("Balas :", out.reply)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })

