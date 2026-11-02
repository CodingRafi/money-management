import { getSessionForUser } from "@/lib/auth-simple"
import { telegramRepository } from "@/repositories/telegram.repository"
import {
  downloadTelegramFile,
  escapeHtml,
  getTelegramFile,
  sendTelegramHtml,
  sendTelegramMessage,
  sendTelegramMessageLong,
  sendTyping,
} from "@/lib/telegram/telegram-api"
import { runTelegramAgent } from "@/lib/telegram/agent"
import { GeminiError } from "@/lib/telegram/gemini"
import type { ToolContext } from "@/lib/telegram/tools"
import { formatCard } from "@/lib/telegram/format"
import { historyCard } from "@/lib/telegram/cards"
import {
  REVISION_FIELD_ALIASES,
  deleteTransactionByCode,
  previewDeletion,
  findTransactionKind,
  listRecent,
  reviseExpense,
  reviseIncome,
  revisionHelpText,
  showTransaction,
} from "@/lib/telegram/revision"

// ── Bentuk update Telegram (subset yang kita pakai) ──────────────────────────

export interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    text?: string
    caption?: string
    from?: { id: number; username?: string; first_name?: string; is_bot?: boolean; language_code?: string }
    chat: { id: number; type: string; username?: string; first_name?: string }
    photo?: { file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }[]
    document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number }
  }
}

// ── Deduplikasi update (Telegram bisa mengirim update yang sama) ─────────────

const processedUpdates = new Set<number>()

function alreadyProcessed(updateId: number): boolean {
  if (processedUpdates.has(updateId)) return true
  processedUpdates.add(updateId)
  if (processedUpdates.size > 2000) {
    const first = processedUpdates.values().next().value
    if (first !== undefined) processedUpdates.delete(first)
  }
  return false
}

// ── Rate limit sederhana (per chat, in-memory) ───────────────────────────────

const RATE_WINDOW_MS = 5 * 60 * 1000
const RATE_MAX_MESSAGES = 20
const rateBuckets = new Map<string, number[]>()

function isRateLimited(chatId: string): boolean {
  const now = Date.now()
  const hits = (rateBuckets.get(chatId) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  hits.push(now)
  rateBuckets.set(chatId, hits)
  if (rateBuckets.size > 1000) {
    for (const [k, v] of rateBuckets) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) rateBuckets.delete(k)
    }
  }
  return hits.length > RATE_MAX_MESSAGES
}

// ── Riwayat percakapan (in-memory, per chat) ────────────────────────────────

const MAX_HISTORY_TURNS = 10
const histories = new Map<string, { role: "user" | "model"; parts: { text?: string }[] }[]>()

function getHistory(chatId: string) {
  return histories.get(chatId) ?? []
}

function pushHistory(chatId: string, entry: { role: "user" | "model"; parts: { text?: string }[] }) {
  const list = getHistory(chatId)
  list.push(entry)
  while (list.length > MAX_HISTORY_TURNS * 2) list.shift()
  histories.set(chatId, list)
}

// ── Bantuan ──────────────────────────────────────────────────────────────────

const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? ""

function helpText(linked: boolean): string {
  const lines = [
    "🤖 <b>Asisten Pencatat Keuangan</b>",
    "",
    "Kirim catatan biasa, misalnya:",
    "• <code>makan siang 25rb</code>",
    "• <code>beli bensin 100rb di Pertamina</code>",
    "• <code>gaji 5jt</code>",
    "• <code>pinjam 2jt ke budi</code>",
    "• kirim <b>foto struk</b> — nominal &amp; merchant-nya saya baca sendiri",
    "• <code>berapa pengeluaran bulan ini?</code>",
    "",
    "<b>Perintah:</b>",
    ...COMMAND_HINTS.map(([cmd, desc]) => `• <code>${cmd}</code> — ${desc}`),
    "",
  ]
  if (linked) {
    lines.push("Ketik /start kapan saja untuk melihat bantuan ini lagi.")
  } else {
    lines.push(
      "🔗 <b>Belum terhubung.</b>",
      "1. Buka aplikasi Money Management → menu <b>Integrasi → Telegram</b>.",
      "2. Klik <b>Buat kode koneksi</b>.",
      `3. Kirim <code>/link KODE</code> ke saya${BOT_USERNAME ? ` (@${escapeHtml(BOT_USERNAME)})` : ""}.`,
    )
  }
  return lines.join("\n")
}

/** Daftar perintah resmi bot — satu sumber kebenaran dengan `setMyCommands`. */
const COMMAND_HINTS = [
  ["/start", "mulai & lihat cara pakai"],
  ["/link", "hubungkan akun dengan kode"],
  ["/riwayat", "10 transaksi terakhir"],
  ["/revisi", "perbaiki transaksi yang salah catat"],
  ["/hapus", "hapus transaksi (dengan konfirmasi)"],
  ["/status", "status koneksi akun"],
  ["/help", "bantuan"],
  ["/unlink", "putuskan hubungan akun"],
]

async function loadContext(userId: string): Promise<Omit<ToolContext, "today"> | null> {
  const session = await getSessionForUser(userId)
  if (!session) return null
  if (!session.householdId) return null
  return { session, householdId: session.householdId }
}

// ── Penanganan perintah ──────────────────────────────────────────────────────

async function handleLink(chatId: string, chatMeta: { username?: string; first_name?: string }, code: string) {
  const normalized = code.trim().toUpperCase()
  const row = await telegramRepository.findValidCode(normalized)
  if (!row) {
    await sendTelegramMessage(
      chatId,
      "Kode tidak valid atau sudah kedaluwarsa. Buat kode baru di aplikasi (menu Integrasi → Telegram), lalu kirim ulang.",
    )
    return
  }

  const existing = await telegramRepository.findByChatId(String(chatId))
  if (existing && existing.user_id !== row.user_id) {
    await sendTelegramMessage(
      chatId,
      "⚠️ Chat ini sudah terhubung ke akun lain. Putuskan dulu dari akun lama (/unlink), lalu coba lagi.",
    )
    return
  }

  await telegramRepository.upsertLink({
    userId: row.user_id,
    chatId: String(chatId),
    telegramUsername: chatMeta.username ?? null,
    telegramFirstName: chatMeta.first_name ?? null,
  })
  await telegramRepository.markCodeUsed(normalized)

  const session = await getSessionForUser(row.user_id)
  await sendTelegramHtml(
    chatId,
    `✅ Berhasil terhubung sebagai <b>${escapeHtml(session?.username ?? row.user_id)}</b>.\n\n${helpText(true)}`,
  )
}

async function handleUnlink(chatId: string) {
  const changed = await telegramRepository.deleteByChatId(String(chatId))
  histories.delete(chatId)
  await sendTelegramMessage(
    chatId,
    changed
      ? "🔌 Hubungan akun diputus. Kirim /link KODE untuk menyambungkan lagi."
      : "Chat ini memang belum terhubung ke akun mana pun.",
  )
}

async function handleStatus(chatId: string) {
  const link = await telegramRepository.findByChatId(String(chatId))
  if (!link) {
    await sendTelegramMessage(chatId, "Status: belum terhubung ke akun mana pun.")
    return
  }
  const session = await getSessionForUser(link.user_id)
  await sendTelegramHtml(
    chatId,
    [
      "ℹ️ <b>Status</b>",
      `Akun: ${escapeHtml(session?.username ?? link.user_id)}`,
      `Peran: ${escapeHtml(session?.householdRole ?? "-")}`,
      `Chat: ${escapeHtml(link.telegram_username ? `@${link.telegram_username}` : link.chat_id)}`,
      `Terhubung sejak: ${new Date(link.created_at).toLocaleDateString("id-ID")}`,
    ].join("\n"),
  )
}

async function handleHistory(chatId: string) {
  const link = await telegramRepository.findByChatId(String(chatId))
  if (!link) {
    await sendTelegramMessage(chatId, "Belum terhubung. Kirim /link KODE dulu.")
    return
  }
  const rows = await listRecent(link.user_id, 10)
  await sendTelegramHtml(
    chatId,
    `🧾 <b>10 transaksi terakhir</b>\n\n${historyCard(rows)}\n\nKode = 6 karakter terakhir ID, dipakai untuk <code>/revisi</code>.`,
  )
}

// ── Revisi transaksi ─────────────────────────────────────────────────────────

/** Petunjuk singkat kalau sintaks /revisi salah. */
function revisiUsage(): string {
  return [
    "Format: <code>/revisi &lt;kode&gt; &lt;field&gt; &lt;nilai&gt;</code>",
    "",
    "Contoh:",
    "<code>/revisi 0AD968 jumlah 30rb</code>",
    "<code>/revisi 0AD968 kategori TRANSPORTASI</code>",
    "<code>/revisi 0AD968 wallet BCA</code>",
    "<code>/revisi 0AD968 tanggal 2026-11-01</code>",
    "<code>/revisi 0AD968 kebutuhan SEKUNDER</code>",
    "<code>/revisi 0AD968 keluarga Y</code>",
    "<code>/revisi 0AD968 nama makan malam</code>",
    "",
    "Lihat daftar kode: <code>/riwayat</code>",
  ].join("\n")
}

async function handleRevisi(chatId: string, ctx: Omit<ToolContext, "today">, arg: string) {
  const parts = arg.trim().split(/\s+/).filter(Boolean)

  // /revisi → daftar kode terbaru + panduan
  if (parts.length === 0) {
    const rows = await listRecent(ctx.session.userId, 10)
    await sendTelegramHtml(
      chatId,
      `<b>Transaksi terbaru (kode revisi)</b>\n\n${historyCard(rows)}\n\n${revisionHelpText()}`,
    )
    return
  }

  const code = parts[0]

  // /revisi <kode> → tampilkan data transaksi
  if (parts.length === 1) {
    const outcome = await showTransaction(ctx, code)
    if (!outcome.ok) {
      await sendTelegramMessage(chatId, outcome.message)
      return
    }
    await sendTelegramHtml(chatId, formatCard(outcome.card))
    return
  }

  // /revisi <kode> <field> <nilai>
  const fieldKey = REVISION_FIELD_ALIASES[parts[1].toLowerCase()]
  if (!fieldKey) {
    await sendTelegramHtml(
      chatId,
      `Field "${escapeHtml(parts[1])}" tidak dikenal.\n\n${revisiUsage()}`,
    )
    return
  }

  const value = parts.slice(2).join(" ")
  if (!value) {
    await sendTelegramHtml(
      chatId,
      `Nilai untuk "${escapeHtml(parts[1])}" belum diisi.\n\n${revisiUsage()}`,
    )
    return
  }

  const kind = await findTransactionKind(ctx.session.userId, code)
  if (!kind) {
    await sendTelegramHtml(
      chatId,
      `Transaksi "${escapeHtml(code)}" tidak ditemukan. Lihat daftar kode dengan /riwayat.`,
    )
    return
  }

  // Field khusus pengeluaran tidak berlaku untuk pendapatan.
  if (kind === "income" && (fieldKey === "needs_type" || fieldKey === "is_family_expense")) {
    await sendTelegramHtml(
      chatId,
      `Field "${escapeHtml(parts[1])}" hanya berlaku untuk pengeluaran, bukan pendapatan.`,
    )
    return
  }

  const patch = { [fieldKey]: value } as Record<string, string>
  const outcome =
    kind === "expense"
      ? await reviseExpense(ctx, code, patch)
      : await reviseIncome(ctx, code, patch)

  if (!outcome.ok) {
    await sendTelegramHtml(chatId, `❌ Revisi gagal:\n${escapeHtml(outcome.message)}`)
    return
  }

  await sendTelegramHtml(chatId, formatCard(outcome.card))
}

// ── Hapus transaksi ──────────────────────────────────────────────────────────

function hapusUsage(): string {
  return [
    "Format: <code>/hapus &lt;kode&gt;</code>",
    "",
    "Bot akan menampilkan transaksinya dulu, lalu minta konfirmasi:",
    "<code>/hapus 0AD968</code> → lihat data yang akan dihapus",
    "<code>/hapus 0AD968 ya</code> → hapus permanen",
    "",
    "Lihat daftar kode: <code>/riwayat</code>",
  ].join("\n")
}

async function handleHapus(chatId: string, ctx: Omit<ToolContext, "today">, arg: string) {
  const parts = arg.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    const rows = await listRecent(ctx.session.userId, 10)
    await sendTelegramHtml(
      chatId,
      `<b>Transaksi terbaru (kode hapus)</b>\n\n${historyCard(rows)}\n\n${hapusUsage()}`,
    )
    return
  }

  const code = parts[0]
  const confirmed = parts.length > 1 && ["ya", "y", "yes", "ok", "hapus"].includes(parts[1].toLowerCase())

  if (!confirmed) {
    const preview = await previewDeletion(ctx, code)
    if (!preview.ok) {
      await sendTelegramHtml(chatId, escapeHtml(preview.message))
      return
    }
    await sendTelegramHtml(
      chatId,
      `${formatCard(preview.card)}\n\n⚠️ Penghapusan <b>tidak bisa dibatalkan</b>. Untuk melanjutkan kirim:\n<code>/hapus ${escapeHtml(code)} ya</code>`,
    )
    return
  }

  const result = await deleteTransactionByCode(ctx, code)
  await sendTelegramHtml(chatId, `${result.ok ? "🗑️" : "❌"} ${escapeHtml(result.message)}`)
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  if (alreadyProcessed(update.update_id)) return
  const message = update.message
  if (!message?.chat) return
  if (message.from?.is_bot) return

  const chatId = String(message.chat.id)
  const text = (message.text ?? message.caption ?? "").trim()

  // Perintah tidak melewati rate limit AI.
  if (text.startsWith("/")) {
    const [rawCommand, ...rest] = text.split(/\s+/)
    const command = rawCommand.split("@")[0].toLowerCase()
    const arg = rest.join(" ")

    switch (command) {
      case "/start":
        await sendTelegramHtml(chatId, helpText(!!(await telegramRepository.findByChatId(chatId))))
        return
      case "/help":
        await sendTelegramHtml(chatId, helpText(!!(await telegramRepository.findByChatId(chatId))))
        return
      case "/link":
        if (!arg) {
          await sendTelegramHtml(chatId, "Format: <code>/link KODE</code>. Buat kode di aplikasi (Integrasi → Telegram).")
          return
        }
        await handleLink(chatId, { username: message.chat.username, first_name: message.chat.first_name }, arg)
        return
      case "/unlink":
        await handleUnlink(chatId)
        return
      case "/status":
        await handleStatus(chatId)
        return
      case "/riwayat":
        await handleHistory(chatId)
        return
      case "/revisi": {
        const link = await telegramRepository.findByChatId(chatId)
        if (!link) {
          await sendTelegramMessage(chatId, "Belum terhubung. Kirim /link KODE dulu.")
          return
        }
        const revCtx = await loadContext(link.user_id)
        if (!revCtx) {
          await sendTelegramMessage(chatId, "Akun ini tidak bisa dipakai lewat Telegram.")
          return
        }
        await handleRevisi(chatId, revCtx, arg)
        return
      }
      case "/hapus": {
        const link = await telegramRepository.findByChatId(chatId)
        if (!link) {
          await sendTelegramMessage(chatId, "Belum terhubung. Kirim /link KODE dulu.")
          return
        }
        const delCtx = await loadContext(link.user_id)
        if (!delCtx) {
          await sendTelegramMessage(chatId, "Akun ini tidak bisa dipakai lewat Telegram.")
          return
        }
        await handleHapus(chatId, delCtx, arg)
        return
      }
      default:
        await sendTelegramMessage(chatId, `Perintah tidak dikenal: ${command}. /help untuk melihat daftar.`)
        return
    }
  }

  // Pesan biasa → butuh akun tertaut.
  const link = await telegramRepository.findByChatId(chatId)
  if (!link) {
    await sendTelegramHtml(
      chatId,
      "🔗 Chat ini belum terhubung ke akun Money Management.\n\n" +
        "Buka aplikasi → menu <b>Integrasi → Telegram</b> → <b>Buat kode koneksi</b>, lalu kirim <code>/link KODE</code> ke saya.",
    )
    return
  }

  if (isRateLimited(chatId)) {
    await sendTelegramMessage(chatId, "Terlalu banyak pesan dalam waktu singkat. Coba lagi sebentar.")
    return
  }

  const ctx = await loadContext(link.user_id)
  if (!ctx) {
    await sendTelegramMessage(
      chatId,
      "Akun ini tidak bisa dipakai lewat Telegram (belum anggota keluarga atau sesi tidak valid). Hubungi Admin keluarga.",
    )
    return
  }

  await sendTyping(chatId)

  // Ambil gambar (struk) bila ada.
  let image: { mimeType: string; base64: string } | undefined
  try {
    const photo = message.photo?.length
      ? message.photo[message.photo.length - 1]
      : message.document?.mime_type?.startsWith("image/")
        ? { file_id: message.document.file_id, file_unique_id: "", width: 0, height: 0 }
        : undefined

    if (photo) {
      const file = await getTelegramFile(photo.file_id)
      if (file.file_size && file.file_size > 10 * 1024 * 1024) {
        throw new Error("Ukuran file terlalu besar (maks 10 MB)")
      }
      const buffer = await downloadTelegramFile(file.file_path)
      image = {
        mimeType: message.document?.mime_type ?? "image/jpeg",
        base64: buffer.toString("base64"),
      }
    }
  } catch (err) {
    await sendTelegramMessage(
      chatId,
      `Gagal mengambil gambar: ${err instanceof Error ? err.message : "tidak diketahui"}.`,
    )
    return
  }

  try {
    const history = getHistory(chatId)
    const out = await runTelegramAgent({
      ctx,
      text: text || "Tolong catat struk ini.",
      image,
      history,
    })

    pushHistory(chatId, { role: "user", parts: [{ text }] })
    pushHistory(chatId, { role: "model", parts: [{ text: out.reply }] })

    await sendTelegramMessageLong(chatId, out.reply, out.html ? { parseMode: "HTML" } : {})
  } catch (err) {
    console.error("[telegram] gagal memproses pesan:", err)
    await sendTelegramMessage(chatId, friendlyErrorMessage(err))
  }
}

/**
 * Pesan error yang bisa dimengerti user (bukan raw error dari API).
 * Untuk masalah kuota, user perlu tahu harus mengecek billing Google AI Studio.
 */
function friendlyErrorMessage(err: unknown): string {
  if (err instanceof GeminiError) {
    if (err.kind === "quota") {
      return (
        "⚠️ Kuota API Gemini habis, jadi pesanmu belum bisa diproses.\n\n" +
        "Pemilik aplikasi perlu mengecek kuota di https://aistudio.google.com/apikey " +
        "(menu Billing / Plans). Coba lagi nanti."
      )
    }
    if (err.kind === "busy") {
      return "⚠️ Server AI sedang sibuk semua. Coba kirim ulang pesanmu dalam satu menit lagi."
    }
    return "⚠️ Maaf, permintaan ke AI gagal diproses. Coba kirim ulang pesannya."
  }
  return "⚠️ Maaf, ada kendala saat memproses pesanmu. Coba lagi sebentar."
}
