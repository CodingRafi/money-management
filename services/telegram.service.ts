import { getSessionForUser } from "@/lib/auth-simple"
import { telegramRepository } from "@/repositories/telegram.repository"
import {
  answerCallbackQuery,
  downloadTelegramFile,
  editTelegramHtml,
  escapeHtml,
  forceReplyMarkup,
  getTelegramFile,
  inlineMarkup,
  sendTelegramHtml,
  sendTelegramMessage,
  sendTelegramMessageLong,
  sendTyping,
  type InlineKeyboard,
} from "@/lib/telegram/telegram-api"
import { runTelegramAgent } from "@/lib/telegram/agent"
import { GeminiError } from "@/lib/telegram/gemini"
import type { ToolContext } from "@/lib/telegram/tools"
import { formatCard, formatCardPlain, shortCode, stripHtml, type TxnCard } from "@/lib/telegram/format"
import { historyCard } from "@/lib/telegram/cards"
import { todayFromDb } from "@/lib/telegram/tools"
import { PERIOD_HELP } from "@/lib/telegram/period"
import { formatRef, parseRef, type Out, type PromptRef } from "@/lib/telegram/out"
import { handleRekap, handleRiwayat, showCashflowMenu } from "@/lib/telegram/cashflow-bot"
import {
  applyEdit,
  askEditField,
  askPayment,
  confirmDeleteLoan,
  confirmDeletePayment,
  deleteLoan,
  deletePayment,
  findLoanIdByCode,
  payLoan,
  setLikelihood,
  showEditMenu,
  showLoanDetail,
  showLoans,
} from "@/lib/telegram/loan-bot"
import {
  askNewAsset,
  askTransaction,
  confirmDeleteAsset,
  confirmDeleteTx,
  deleteAsset,
  deleteTx,
  investmentAiText,
  showAsset,
  showInvestments,
  toggleClosed,
} from "@/lib/telegram/investment-bot"
import {
  REVISION_FIELD_ALIASES,
  deleteTransactionByCode,
  previewDeletion,
  findTransactionKind,
  findLastCreated,
  isRecentAlias,
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
    /** Pesan bot yang dibalas user (dipakai untuk jawaban atas pertanyaan bot). */
    reply_to_message?: { message_id: number; text?: string }
  }
  /** Penekanan tombol inline. */
  callback_query?: {
    id: string
    from?: { id: number; is_bot?: boolean }
    message?: { message_id: number; chat: { id: number; type: string } }
    data?: string
  }
}

type BotCtx = Omit<ToolContext, "today">

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

/**
 * Anggaran waktu pemrosesan AI untuk satu pesan (ms).
 *
 * Harus lebih kecil dari batas durasi route (`maxDuration`) supaya masih
 * ada waktu mengirim pesan balasan ke user sebelum proses dipotong platform.
 */
const AI_BUDGET_MS = Number(process.env.TELEGRAM_AI_BUDGET_MS ?? 40_000)

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
    "• <code>gaji 5jt</code>",
    "• <code>pinjam 2jt ke budi</code>",
    "• kirim <b>foto struk</b> — nominal &amp; merchant-nya saya baca sendiri",
    "• <code>berapa pengeluaran bulan ini?</code>",
    "",
    "<b>Menu utama</b> (tekan tombolnya, tidak perlu hafal sintaks):",
    "• <code>/cashflow</code> — riwayat, rekap, anggaran, cari, revisi &amp; hapus",
    "• <code>/pinjaman</code> — daftar/cari pinjaman, bayar cicilan, revisi, hapus",
    "• <code>/investasi</code> — portofolio, tambah aset &amp; transaksi, tutup/hapus",
    "",
    "<b>Pintasan:</b>",
    "• <code>/rekap [periode]</code> — mis. <code>/rekap kemarin</code>, <code>/rekap 2026-10</code>, <code>/rekap tahun</code>",
    "• <code>/rekap kategori [periode]</code> · <code>/rekap anggaran</code> · <code>/rekap top 5</code>",
    "• <code>/riwayat [periode] [kata kunci]</code> — mis. <code>/riwayat hari ini</code>, <code>/riwayat bulan lalu kopi</code>",
    "• filter riwayat: <code>kategori X</code> · <code>dompet X</code> · <code>masuk</code>/<code>keluar</code> · <code>limit 30</code>",
    `• Periode: <code>${PERIOD_HELP}</code>`,
    "• <code>/revisi</code> · <code>/hapus</code> — perbaiki / hapus transaksi (boleh <code>barusan</code>)",
    "",
    "<b>Akun:</b> <code>/link KODE</code> · <code>/status</code> · <code>/unlink</code>",
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

async function loadContext(userId: string): Promise<BotCtx | null> {
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
    "<code>/revisi barusan</code> → transaksi yang terakhir dicatat",
    "<code>/revisi barusan jumlah 30rb</code>",
    "<code>/revisi jumlah 30rb</code> → tanpa kode, berlaku ke transaksi terakhir",
    "",
    "Lihat daftar kode: <code>/riwayat</code>",
  ].join("\n")
}

/**
 * Terjemahkan alias "barusan"/"terakhir" menjadi kode transaksi terakhir milik
 * user. Alias lain dikembalikan apa adanya.
 */
async function resolveCodeAlias(userId: string, token: string): Promise<string | null> {
  if (!isRecentAlias(token)) return token
  const last = await findLastCreated(userId)
  return last?.id ?? null
}

async function handleRevisi(chatId: string, ctx: Omit<ToolContext, "today">, arg: string) {
  let parts = arg.trim().split(/\s+/).filter(Boolean)

  // /revisi → daftar kode terbaru + panduan
  if (parts.length === 0) {
    const rows = await listRecent(ctx.session.userId, 10)
    await sendTelegramHtml(
      chatId,
      `<b>Transaksi terbaru (kode transaksi)</b>\n\n${historyCard(rows)}\n\n${revisionHelpText()}`,
    )
    return
  }

  // Pintasan: /revisi <field> <nilai> tanpa kode → berlaku untuk transaksi
  // terakhir. Kode transaksi selalu hex, jadi tidak mungkin sama dengan nama
  // field.
  if (REVISION_FIELD_ALIASES[parts[0].toLowerCase()]) {
    if (parts.length === 1) {
      // "/revisi jumlah" — field tanpa nilai.
      await sendTelegramHtml(
        chatId,
        `Nilai untuk "${escapeHtml(parts[0])}" belum diisi.\n\n${revisiUsage()}`,
      )
      return
    }
    parts = ["barusan", ...parts]
  }

  // /revisi barusan → kode transaksi terakhir yang dicatat
  const rawToken = parts[0]
  const code = await resolveCodeAlias(ctx.session.userId, rawToken)
  if (!code) {
    await sendTelegramHtml(chatId, "Belum ada transaksi yang bisa direvisi.")
    return
  }
  // Kode yang ditampilkan ke user: tetap seperti yang diketik, kecuali kalau
  // user memakai alias "barusan" (maka tampilkan kode transaksinya).
  const displayCode = rawToken === code ? rawToken : shortCode(code)

  // /revisi <kode> → tampilkan data transaksi
  if (parts.length === 1) {
    const outcome = await showTransaction(ctx, code)
    if (!outcome.ok) {
      await sendTelegramHtml(
        chatId,
        `Transaksi "${escapeHtml(displayCode)}" tidak ditemukan. Lihat daftar kode dengan /riwayat.`,
      )
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
      `Transaksi "${escapeHtml(displayCode)}" tidak ditemukan. Lihat daftar kode dengan /riwayat.`,
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
    "<code>/hapus barusan</code> → transaksi yang terakhir dicatat",
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
      `<b>Transaksi terbaru (kode transaksi)</b>\n\n${historyCard(rows)}\n\n${hapusUsage()}`,
    )
    return
  }

  // /hapus barusan → kode transaksi terakhir yang dicatat
  const code = await resolveCodeAlias(ctx.session.userId, parts[0])
  if (!code) {
    await sendTelegramHtml(chatId, "Belum ada transaksi yang bisa dihapus.")
    return
  }

  const confirmed = parts.length > 1 && ["ya", "y", "yes", "ok", "hapus"].includes(parts[1].toLowerCase())

  if (!confirmed) {
    const preview = await previewDeletion(ctx, code)
    if (!preview.ok) {
      await sendTelegramHtml(chatId, escapeHtml(preview.message))
      return
    }
    await sendTelegramHtml(
      chatId,
      `${formatCard(preview.card)}\n\n⚠️ Penghapusan <b>tidak bisa dibatalkan</b>. Tekan tombol di bawah, atau kirim:\n<code>/hapus ${escapeHtml(shortCode(code))} ya</code>`,
      {
        keyboard: [[
          { text: "✅ Ya, hapus", data: `tx:y:${shortCode(code)}` },
          { text: "Batal", data: "tx:n" },
        ]],
      },
    )
    return
  }

  const result = await deleteTransactionByCode(ctx, code)
  await sendTelegramHtml(chatId, `${result.ok ? "🗑️" : "❌"} ${escapeHtml(result.message)}`)
}

// ── Cara membalas (Out) ──────────────────────────────────────────────────────

async function sendPromptMessage(chatId: string, html: string, ref: PromptRef, placeholder?: string) {
  await sendTelegramMessage(chatId, `${html}\n\n${formatRef(ref)}`, {
    parseMode: "HTML",
    replyMarkup: forceReplyMarkup(placeholder),
  })
}

/** Perintah yang diketik user: setiap balasan berupa pesan baru. */
function messageOut(chatId: string): Out {
  const send = (html: string, keyboard?: InlineKeyboard) => sendTelegramHtml(chatId, html, { keyboard })
  return {
    chatId,
    reply: send,
    send,
    prompt: (html, ref, placeholder) => sendPromptMessage(chatId, html, ref, placeholder),
  }
}

/** Tombol ditekan: ubah pesan yang sama; kalau gagal diedit, kirim pesan baru. */
function callbackOut(chatId: string, messageId: number): Out {
  const send = (html: string, keyboard?: InlineKeyboard) => sendTelegramHtml(chatId, html, { keyboard })
  return {
    chatId,
    send,
    reply: async (html, keyboard) => {
      try {
        await editTelegramHtml(chatId, messageId, html, keyboard)
      } catch (err) {
        console.error("[telegram] gagal mengedit pesan, kirim pesan baru:", err)
        await send(html, keyboard)
      }
    },
    prompt: (html, ref, placeholder) => sendPromptMessage(chatId, html, ref, placeholder),
  }
}

// ── Nama perintah ────────────────────────────────────────────────────────────

/**
 * Samakan nama perintah: awalan `cashflow_` / `pinjaman_` / `investasi_` dan
 * perintah lama (`/rekap_harian`, `/cari`, `/transaksi`, dst.) dipetakan ke
 * perintah baru, supaya kebiasaan lama tetap jalan.
 */
function normalizeCommand(command: string, arg: string): { command: string; arg: string } {
  const cashflow = /^\/cashflow_(.+)$/.exec(command)
  if (cashflow) return normalizeCommand(`/${cashflow[1]}`, arg)

  const sub = /^\/(pinjaman|investasi)_(.+)$/.exec(command)
  if (sub) return { command: `/${sub[1]}`, arg: `${sub[2]} ${arg}`.trim() }

  switch (command) {
    case "/rekap_bulanan":
      return { command: "/rekap", arg }
    case "/rekap_harian": {
      const a = arg.trim()
      if (!a) return { command: "/rekap", arg: "hari ini" }
      // Dulu angka telanjang = tanggal pada bulan berjalan.
      if (/^\d{1,2}$/.test(a)) return { command: "/rekap", arg: `tanggal ${a}` }
      return { command: "/rekap", arg: a }
    }
    case "/rekap_tahunan":
      return { command: "/rekap", arg: arg.trim() ? arg : "tahun ini" }
    case "/rekap_kategori":
      return { command: "/rekap", arg: `kategori ${arg}`.trim() }
    case "/anggaran":
      return { command: "/rekap", arg: "anggaran" }
    case "/top":
      return { command: "/rekap", arg: `top ${arg}`.trim() }
    case "/cari":
    case "/transaksi":
      return {
        command: "/riwayat",
        // Sintaks lama "periode 2026-11" / "tanggal 2026-11-05" → cukup tanggalnya.
        arg: arg.replace(/\b(periode|period|date|tanggal|bulan)\s+(?=\d{4}-\d)/gi, ""),
      }
    default:
      return { command, arg }
  }
}

/** Perintah yang butuh akun tertaut. */
const USER_COMMANDS = new Set(["/cashflow", "/rekap", "/riwayat", "/pinjaman", "/investasi", "/revisi", "/hapus"])

const PINJAMAN_BAYAR_USAGE = [
  "Format: <code>/pinjaman bayar &lt;kode&gt; &lt;jumlah&gt; [tanggal]</code>",
  "Contoh: <code>/pinjaman bayar AB12CD 500rb</code> atau <code>/pinjaman bayar AB12CD 500rb kemarin</code>",
  "",
  "Kode ada di <code>/pinjaman</code> (buka detail pinjamannya). Atau tekan tombol <b>Bayar cicilan</b>.",
].join("\n")

/**
 * `/pinjaman` → daftar, `/pinjaman budi` → cari,
 * `/pinjaman bayar <kode> <jumlah> [tanggal]` → catat cicilan.
 */
async function handlePinjaman(out: Out, ctx: BotCtx, arg: string): Promise<void> {
  const today = await todayFromDb()
  const text = arg.trim()

  if (/^bayar\b/i.test(text)) {
    const m = /^bayar\s+(\S+)\s+(.+)$/i.exec(text)
    if (!m) {
      await out.send(PINJAMAN_BAYAR_USAGE)
      return
    }
    const id = await findLoanIdByCode(ctx, m[1])
    if (!id) {
      await out.send(`Pinjaman dengan kode “${escapeHtml(m[1])}” tidak ditemukan. Lihat daftar di /pinjaman.`)
      return
    }
    await payLoan(out, ctx, today, id, m[2])
    return
  }

  await showLoans(out, ctx, today, text)
}

/** Jalankan perintah yang butuh akun tertaut (diketik maupun dari tombol). */
async function runUserCommand(out: Out, ctx: BotCtx, command: string, arg: string): Promise<void> {
  switch (command) {
    case "/cashflow":
      await showCashflowMenu(out)
      return
    case "/rekap":
      await handleRekap(out, ctx, arg)
      return
    case "/riwayat":
      await handleRiwayat(out, ctx, arg)
      return
    case "/pinjaman":
      await handlePinjaman(out, ctx, arg)
      return
    case "/investasi":
      await showInvestments(out, ctx, arg)
      return
    case "/revisi":
      await handleRevisi(out.chatId, ctx, arg)
      return
    case "/hapus":
      await handleHapus(out.chatId, ctx, arg)
      return
  }
}

// ── Hapus transaksi lewat tombol ─────────────────────────────────────────────

async function confirmDeleteTransaction(out: Out, ctx: BotCtx, code: string): Promise<void> {
  const preview = await previewDeletion(ctx, code)
  if (!preview.ok) {
    await out.send(escapeHtml(preview.message))
    return
  }
  await out.send(`${formatCard(preview.card)}\n\n⚠️ Penghapusan <b>tidak bisa dibatalkan</b>.`, [
    [
      { text: "✅ Ya, hapus", data: `tx:y:${code}` },
      { text: "Batal", data: "tx:n" },
    ],
  ])
}

// ── Penekanan tombol ─────────────────────────────────────────────────────────

const NEW_LOAN_PROMPT = [
  "➕ <b>Pinjaman baru</b>",
  "",
  "Balas dengan ceritanya, mis.:",
  "• <code>pinjam 2jt ke budi, jatuh tempo 2026-12-31</code> (piutang)",
  "• <code>hutang kredit motor 15jt bunga 1,5% dari dompet BCA</code>",
].join("\n")

async function dispatchCallback(out: Out, ctx: BotCtx, data: string): Promise<void> {
  // "c:<perintah>" → sama seperti user mengetik perintah itu.
  if (data.startsWith("c:")) {
    const [cmd, ...rest] = data.slice(2).trim().split(/\s+/)
    const norm = normalizeCommand(`/${cmd}`, rest.join(" "))
    if (USER_COMMANDS.has(norm.command)) await runUserCommand(out, ctx, norm.command, norm.arg)
    return
  }

  const [domain, action, id, extra] = data.split(":")

  if (domain === "pj") {
    switch (action) {
      case "v": return await showLoanDetail(out, ctx, id)
      case "b": return await askPayment(out, ctx, id)
      case "e": return await showEditMenu(out, ctx, id)
      case "f": return await askEditField(out, ctx, id, extra)
      case "l": return await setLikelihood(out, ctx, id, extra)
      case "d": return await confirmDeleteLoan(out, ctx, id)
      case "dy": return await deleteLoan(out, ctx, id)
      case "p": return await confirmDeletePayment(out, ctx, id)
      case "py": return await deletePayment(out, ctx, id)
      case "n": return await out.prompt(NEW_LOAN_PROMPT, { domain: "pj", action: "n", code: "NEW" }, "pinjam 2jt ke budi")
    }
    return
  }

  if (domain === "iv") {
    switch (action) {
      case "v": return await showAsset(out, ctx, id)
      case "t": return await askTransaction(out, ctx, id, extra)
      case "x": return await toggleClosed(out, ctx, id)
      case "d": return await confirmDeleteAsset(out, ctx, id)
      case "dy": return await deleteAsset(out, ctx, id)
      case "q": return await confirmDeleteTx(out, ctx, id)
      case "qy": return await deleteTx(out, ctx, id)
      case "n": return await askNewAsset(out)
    }
    return
  }

  if (domain === "tx") {
    switch (action) {
      case "d": return await confirmDeleteTransaction(out, ctx, id)
      case "y": {
        const result = await deleteTransactionByCode(ctx, id)
        return await out.reply(`${result.ok ? "🗑️" : "❌"} ${escapeHtml(result.message)}`)
      }
      case "n": return await out.reply("Penghapusan dibatalkan.")
    }
    return
  }

  if (domain === "cf") {
    switch (action) {
      case "e": return await handleRevisi(out.chatId, ctx, "")
      case "h": return await handleHapus(out.chatId, ctx, "")
      case "s":
        return await out.prompt(
          [
            "🔎 <b>Cari transaksi</b>",
            "",
            "Balas dengan kata kunci, boleh disertai periode, mis.:",
            "• <code>kopi</code>",
            "• <code>bensin bulan lalu</code>",
            "• <code>masuk 2026-11</code>",
          ].join("\n"),
          { domain: "cf", action: "s", code: "SEARCH" },
          "kopi bulan ini",
        )
    }
    return
  }
}

async function handleCallbackQuery(cb: NonNullable<TelegramUpdate["callback_query"]>): Promise<void> {
  // Selalu jawab dulu supaya tombol berhenti "loading".
  await answerCallbackQuery(cb.id)

  if (cb.from?.is_bot) return
  const chatId = cb.message ? String(cb.message.chat.id) : null
  const messageId = cb.message?.message_id
  const data = cb.data?.trim()
  if (!chatId || !messageId || !data) return

  const link = await telegramRepository.findByChatId(chatId)
  if (!link) {
    await sendTelegramMessage(chatId, "Belum terhubung. Kirim /link KODE dulu.")
    return
  }
  const ctx = await loadContext(link.user_id)
  if (!ctx) {
    await sendTelegramMessage(chatId, "Akun ini tidak bisa dipakai lewat Telegram.")
    return
  }

  try {
    await dispatchCallback(callbackOut(chatId, messageId), ctx, data)
  } catch (err) {
    console.error(`[telegram] gagal menjalankan tombol ${data}:`, err)
    await sendTelegramMessage(chatId, "⚠️ Maaf, aksi itu gagal. Coba lagi sebentar.")
  }
}

// ── Jawaban atas pertanyaan bot (force reply) ────────────────────────────────

/**
 * User membalas pertanyaan bot (mis. "Bayar cicilan — berapa?"). Penanda di
 * pesan bot menunjukkan tujuan jawabannya. Mengembalikan true bila sudah
 * ditangani.
 */
async function handlePromptReply(chatId: string, text: string, ref: PromptRef): Promise<boolean> {
  const link = await telegramRepository.findByChatId(chatId)
  if (!link) return false
  const ctx = await loadContext(link.user_id)
  if (!ctx) return false

  const out = messageOut(chatId)
  const today = await todayFromDb()

  try {
    if (ref.domain === "pj") {
      if (ref.action === "n") {
        await runAgentTurn(chatId, ctx, {
          agentText: `Catat pinjaman baru (panggil create_loan). Detail dari pengguna: ${text}`,
          historyText: text,
        })
        return true
      }
      const id = await findLoanIdByCode(ctx, ref.code)
      if (!id) {
        await out.send("Pinjaman tidak ditemukan (mungkin sudah dihapus). Buka /pinjaman lagi.")
        return true
      }
      if (ref.action === "b") await payLoan(out, ctx, today, id, text)
      else if (ref.action === "f") await applyEdit(out, ctx, today, id, ref.arg ?? "", text)
      return true
    }

    if (ref.domain === "iv") {
      const agentText = await investmentAiText(ctx, ref, text)
      if (!agentText) {
        await out.send("Aset tidak ditemukan (mungkin sudah dihapus). Buka /investasi lagi.")
        return true
      }
      await runAgentTurn(chatId, ctx, { agentText, historyText: text })
      return true
    }

    if (ref.domain === "cf" && ref.action === "s") {
      await handleRiwayat(out, ctx, text)
      return true
    }
  } catch (err) {
    console.error("[telegram] gagal memproses jawaban:", err)
    await sendTelegramMessage(chatId, friendlyErrorMessage(err))
    return true
  }
  return false
}

// ── Giliran AI ───────────────────────────────────────────────────────────────

/**
 * Jalankan agen AI untuk satu pesan dan kirim balasannya.
 * `agentText` = apa yang dibaca AI; `historyText` = apa yang dicatat di
 * riwayat percakapan (teks asli user).
 */
async function runAgentTurn(
  chatId: string,
  ctx: BotCtx,
  opts: { agentText: string; historyText: string; image?: { mimeType: string; base64: string } },
): Promise<void> {
  if (isRateLimited(chatId)) {
    await sendTelegramMessage(chatId, "Terlalu banyak pesan dalam waktu singkat. Coba lagi sebentar.")
    return
  }

  await sendTyping(chatId)

  try {
    const history = getHistory(chatId)
    let cardReplied = false
    const out = await runTelegramAgent({
      ctx,
      text: opts.agentText,
      image: opts.image,
      history,
      deadline: Date.now() + AI_BUDGET_MS,
      // Kirim kartu segera setelah transaksi tercatat — user tidak perlu
      // menunggu langkah AI berikutnya selesai (yang bisa saja tidak pernah).
      onCard: async (card: TxnCard) => {
        await sendCard(chatId, card)
        cardReplied = true
      },
    })

    pushHistory(chatId, { role: "user", parts: [{ text: opts.historyText }] })
    pushHistory(chatId, { role: "model", parts: [{ text: out.reply || "[kartu transaksi terkirim]" }] })

    if (out.reply.trim()) {
      try {
        await sendTelegramMessageLong(chatId, out.reply, out.html ? { parseMode: "HTML" } : {})
      } catch (err) {
        console.error("[telegram] gagal mengirim balasan:", err)
        if (out.html) {
          // Telegram menolak HTML-nya → kirim ulang versi teks biasa.
          await sendTelegramMessage(chatId, stripHtml(out.reply))
        } else if (!cardReplied) {
          throw err
        }
      }
    }
  } catch (err) {
    console.error("[telegram] gagal memproses pesan:", err)
    await sendTelegramMessage(chatId, friendlyErrorMessage(err))
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  if (alreadyProcessed(update.update_id)) return

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query)
    return
  }

  const message = update.message
  if (!message?.chat) return
  if (message.from?.is_bot) return

  const chatId = String(message.chat.id)
  const text = (message.text ?? message.caption ?? "").trim()

  // Perintah tidak melewati rate limit AI.
  if (text.startsWith("/")) {
    const [rawCommand, ...rest] = text.split(/\s+/)
    const rawName = rawCommand.split("@")[0].toLowerCase()
    const rawArg = rest.join(" ")

    switch (rawName) {
      case "/start":
      case "/help":
        await sendTelegramHtml(chatId, helpText(!!(await telegramRepository.findByChatId(chatId))))
        return
      case "/link":
        if (!rawArg) {
          await sendTelegramHtml(chatId, "Format: <code>/link KODE</code>. Buat kode di aplikasi (Integrasi → Telegram).")
          return
        }
        await handleLink(chatId, { username: message.chat.username, first_name: message.chat.first_name }, rawArg)
        return
      case "/unlink":
        await handleUnlink(chatId)
        return
      case "/status":
        await handleStatus(chatId)
        return
    }

    const { command, arg } = normalizeCommand(rawName, rawArg)
    if (!USER_COMMANDS.has(command)) {
      await sendTelegramMessage(chatId, `Perintah tidak dikenal: ${rawName}. /help untuk melihat daftar.`)
      return
    }

    const link = await telegramRepository.findByChatId(chatId)
    if (!link) {
      await sendTelegramMessage(chatId, "Belum terhubung. Kirim /link KODE dulu.")
      return
    }
    const userCtx = await loadContext(link.user_id)
    if (!userCtx) {
      await sendTelegramMessage(chatId, "Akun ini tidak bisa dipakai lewat Telegram.")
      return
    }

    // Perintah ini tidak memanggil model, jadi tidak kena rate limit AI.
    try {
      await runUserCommand(messageOut(chatId), userCtx, command, arg)
    } catch (err) {
      console.error(`[telegram] gagal menjalankan ${command}:`, err)
      await sendTelegramMessage(chatId, "⚠️ Maaf, perintah itu tidak bisa dijalankan. Coba lagi sebentar.")
    }
    return
  }

  // Balasan atas pertanyaan bot (mis. jumlah cicilan) → tangani sesuai penandanya.
  const ref = parseRef(message.reply_to_message?.text)
  if (ref && text && !message.photo?.length) {
    if (await handlePromptReply(chatId, text, ref)) return
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

  // Konfirmasi awal untuk foto struk: OCR butuh beberapa kali panggilan AI
  // yang bisa memakan puluhan detik. Tanpa pesan ini user menggantung lama
  // tanpa tahu apakah fotonya sudah diterima.
  if (image) {
    await sendTelegramMessage(chatId, "📸 Sedang membaca struk, sebentar ya…")
  }

  await runAgentTurn(chatId, ctx, {
    agentText: text || "Tolong catat struk ini.",
    historyText: text || "[foto struk]",
    image,
  })
}

/**
 * Kirim kartu transaksi ke user. Kartu pengeluaran/pemasukan mendapat tombol
 * Hapus (dengan konfirmasi).
 *
 * Kalau Telegram menolak pesan HTML-nya (mis. ada karakter tak valid), kirim
 * ulang versi teks biasa — supaya konfirmasi tetap sampai.
 */
async function sendCard(chatId: string, card: TxnCard): Promise<void> {
  const html = formatCard(card)
  const keyboard: InlineKeyboard | undefined = card.kind
    ? [[{ text: "🗑 Hapus", data: `tx:d:${shortCode(card.id)}` }]]
    : undefined
  try {
    await sendTelegramHtml(chatId, html, { keyboard })
  } catch (err) {
    console.error("[telegram] gagal kirim kartu HTML, kirim versi teks:", err)
    await sendTelegramMessage(chatId, formatCardPlain(card), {
      replyMarkup: keyboard ? inlineMarkup(keyboard) : undefined,
    })
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
