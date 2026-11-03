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
import { formatCard, formatAmount } from "@/lib/telegram/format"
import { historyCard } from "@/lib/telegram/cards"
import { todayFromDb } from "@/lib/telegram/tools"
import {
  budgetReport,
  recapCategory,
  recapDaily,
  recapMonthly,
  recapYearly,
} from "@/lib/telegram/reports"
import {
  filterTransactions,
  searchTransactions,
  topCategories,
  txList,
} from "@/lib/telegram/search"
import { investmentReport, loanReport } from "@/lib/telegram/domain"
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
    "<b>Laporan:</b>",
    "• <code>/rekap</code> — rekap bulan berjalan (s/d hari ini)",
    "• <code>/rekap 2026-11</code> — rekap bulan tertentu",
    "• <code>/rekap_harian [tanggal]</code> — harian (default hari ini, mis. kemarin / 2026-11-01) + tren 7 hari",
    "• <code>/rekap_tahunan</code> — rekap 12 bulan",
    "• <code>/rekap_kategori</code> — pengeluaran per kategori + status anggaran",
    "• <code>/anggaran</code> — status anggaran bulan ini",
    "• <code>/pinjaman</code> — daftar pinjaman &amp; sisa angsuran",
    "• <code>/investasi</code> — portofolio investasi",
    "",
    "<b>Cari &amp; filter:</b>",
    "• <code>/cari kopi</code> — cari transaksi by kata kunci",
    "• <code>/transaksi 2026-11 kategori TRANSPORTASI</code> — transaksi berfilter",
    "• <code>/top 5</code> — 5 pengeluaran terbesar",
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
  ["/rekap", "rekap bulanan (opsional: 2026-11)"],
  ["/rekap_harian [tanggal]", "harian + tren 7 hari"],
  ["/rekap_tahunan", "rekap 12 bulan (opsional: 2026)"],
  ["/rekap_kategori", "pengeluaran per kategori + status anggaran"],
  ["/anggaran", "status anggaran bulan ini"],
  ["/cari", "cari transaksi (kata kunci)"],
  ["/transaksi", "daftar transaksi berfilter"],
  ["/top", "pengeluaran terbesar (opsional: 5)"],
  ["/pinjaman", "daftar pinjaman & sisa angsuran"],
  ["/investasi", "portofolio investasi"],
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

// ── Parsing argumen perintah laporan ────────────────────────────────────────

/**
 * Parse argumen "/rekap" — bisa "YYYY-MM" (tahun & bulan) atau "MM" (bulan
 * saja, tahun berjalan) atau kosong (bulan berjalan).
 *
 * Mengembalikan `null` bila argumennya tidak valid, supaya pemanggil bisa
 * menampilkan petunjuk format.
 */
function parseMonthArg(arg: string, today: string): { month?: number; year?: number } | null {
  const raw = arg.trim()
  if (!raw) return {}

  const full = /^(\d{4})-(\d{1,2})$/.exec(raw)
  if (full) {
    const year = Number(full[1])
    const month = Number(full[2])
    if (month >= 1 && month <= 12) return { month, year }
    return null
  }

  const short = /^(\d{1,2})$/.exec(raw)
  if (short) {
    const month = Number(short[1])
    if (month >= 1 && month <= 12) return { month, year: Number(today.slice(0, 4)) }
    return null
  }

  return null
}

/**
 * Parse argumen "/rekap_harian" menjadi tanggal "YYYY-MM-DD".
 * Mendukung: kosong/"hari ini", "kemarin", "lusa kemarin", "N hari lalu",
 * "YYYY-MM-DD", "DD-MM-YYYY", "DD/MM(/YYYY)", dan "DD" (bulan berjalan).
 * Mengembalikan `null` bila tidak valid.
 */
function parseDayArg(arg: string, today: string): string | null {
  const raw = arg.trim().toLowerCase()
  if (!raw || raw === "hari ini" || raw === "today") return today

  const shift = (days: number) => {
    const d = new Date(`${today}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }
  if (raw === "kemarin" || raw === "yesterday") return shift(-1)
  if (raw === "kemarin lusa" || raw === "lusa kemarin") return shift(-2)

  const ago = /^(\d{1,3})\s*hari\s+(?:yang\s+)?lalu$/.exec(raw)
  if (ago) return shift(-Number(ago[1]))

  const [ty, tm] = today.split("-").map(Number)
  let y = ty
  let m = tm
  let d: number

  let match: RegExpExecArray | null
  if ((match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw))) {
    y = Number(match[1]); m = Number(match[2]); d = Number(match[3])
  } else if ((match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(raw))) {
    d = Number(match[1]); m = Number(match[2]); y = Number(match[3])
  } else if ((match = /^(\d{1,2})[-/.](\d{1,2})$/.exec(raw))) {
    d = Number(match[1]); m = Number(match[2])
  } else if ((match = /^(\d{1,2})$/.exec(raw))) {
    d = Number(match[1])
  } else {
    return null
  }

  // Validasi tanggal nyata (mis. tolak 31 Februari).
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

/** Parse argumen "/rekap_tahunan" — "YYYY" atau kosong (tahun berjalan). */
function parseYearArg(arg: string, today: string): { year?: number } {
  const raw = arg.trim()
  const m = /^(\d{4})$/.exec(raw)
  if (m) {
    const year = Number(m[1])
    if (year >= 2000 && year <= 2100) return { year }
  }
  return { year: Number(today.slice(0, 4)) }
}

/**
 * Parse argumen "/transaksi" — sepadan key-value yang longgar:
 *   "2026-11 kategori TRANSPORTASI dompet BCA jenis pengeluaran limit 10"
 * Nilai boleh dipisah spasi atau memakai "=".
 */
function parseFilterArg(arg: string): {
  period?: string
  category?: string
  wallet?: string
  kind?: "expense" | "income"
  limit?: number
  keyword?: string
} {
  const out: ReturnType<typeof parseFilterArg> = {}
  const tokens = arg.trim().split(/\s+/).filter(Boolean)

  const KEYS: Record<string, "period" | "category" | "wallet" | "kind" | "limit"> = {
    periode: "period",
    period: "period",
    bulan: "period",
    tanggal: "period",
    date: "period",
    kategori: "category",
    category: "category",
    dompet: "wallet",
    wallet: "wallet",
    jenis: "kind",
    type: "kind",
    limit: "limit",
    jumlah: "limit",
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const [rawKey, inlineValue] = token.includes("=")
      ? [token.slice(0, token.indexOf("=")), token.slice(token.indexOf("=") + 1)]
      : [token, undefined]

    const key = KEYS[rawKey.toLowerCase()]
    if (!key) {
      // Token tak dikenal → kumpulkan sebagai kata kunci bebas.
      out.keyword = out.keyword ? `${out.keyword} ${rawKey}` : rawKey
      continue
    }

    const value = inlineValue ?? tokens[++i]
    if (!value) continue

    if (key === "kind") {
      const v = value.toLowerCase()
      if (["expense", "pengeluaran", "keluar"].includes(v)) out.kind = "expense"
      else if (["income", "pemasukan", "masuk"].includes(v)) out.kind = "income"
      continue
    }
    if (key === "limit") {
      const n = Number(value)
      if (Number.isFinite(n) && n > 0) out.limit = Math.min(50, Math.floor(n))
      continue
    }
    out[key] = value
  }

  return out
}

/**
 * Parse argumen "/cari" — kata kunci bebas, dengan penyederhanaan tanggal:
 * "hari ini", "kemarin", "minggu ini", "bulan ini", "last bulan", "tahun ini".
 */
function parseSearchArg(
  arg: string,
  today: string,
): { keyword?: string; from?: string; to?: string } {
  const raw = arg.trim().toLowerCase()
  const [ty, tm] = today.split("-").map(Number)

  const shift = (base: string, days: number) => {
    const d = new Date(`${base}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }

  const prevMonth = new Date(Date.UTC(ty, tm - 2, 1))
  const prevMonthStart = prevMonth.toISOString().slice(0, 8) + "01"
  const prevMonthEnd = new Date(Date.UTC(ty, tm - 1, 0)).toISOString().slice(0, 10)

  const monthStart = `${ty}-${String(tm).padStart(2, "0")}-01`
  const monthEnd = new Date(Date.UTC(ty, tm, 0)).toISOString().slice(0, 10)

  const period = (from: string, to: string) => ({ from, to, keyword: undefined })

  if (raw === "hari ini" || raw === "today") return period(today, today)
  if (raw === "kemarin" || raw === "yesterday") return period(shift(today, -1), shift(today, -1))
  if (raw === "minggu ini" || raw === "week ini") return period(shift(today, -6), today)
  if (raw === "bulan ini" || raw === "month ini") return period(monthStart, monthEnd)
  if (raw === "last bulan" || raw === "bulan lalu") return period(prevMonthStart, prevMonthEnd)
  if (raw === "tahun ini" || raw === "year ini") return period(`${ty}-01-01`, `${ty}-12-31`)

  // Keyword biasa — tanpa filter tanggal.
  return { keyword: arg.trim() || undefined }
}

/** Petunjuk singkat untuk perintah laporan. */
function laporanUsage(): string {
  return [
    "Format: <code>/rekap [YYYY-MM | MM]</code>",
    "Contoh:",
    "<code>/rekap</code> — bulan berjalan",
    "<code>/rekap 2026-11</code> — November 2026",
    "<code>/rekap 11</code> — November tahun berjalan",
  ].join("\n")
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
      `<b>Transaksi terbaru (kode transaksi)</b>\n\n${historyCard(rows)}\n\n${revisionHelpText()}`,
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
      `<b>Transaksi terbaru (kode transaksi)</b>\n\n${historyCard(rows)}\n\n${hapusUsage()}`,
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

// ── Perintah laporan ─────────────────────────────────────────────────────────

/**
 * Menjalankan perintah laporan. Semua perintah ini membaca data langsung
 * dari database (tanpa AI), jadi hasilnya konsisten dan cepat.
 */
async function handleLaporan(chatId: string, ctx: Omit<ToolContext, "today">, command: string, arg: string) {
  const session = ctx.session
  const today = await todayFromDb()

  switch (command) {
    case "/rekap": {
      const opts = parseMonthArg(arg, today)
      if (opts === null) {
        await sendTelegramHtml(chatId, laporanUsage())
        return
      }
      const html = await recapMonthly(session, today, opts)
      await sendTelegramHtml(chatId, html)
      return
    }
    case "/rekap_harian": {
      const date = parseDayArg(arg, today)
      if (date === null) {
        await sendTelegramHtml(
          chatId,
          [
            "Format: <code>/rekap_harian [tanggal]</code>",
            "Contoh:",
            "<code>/rekap_harian</code> — hari ini",
            "<code>/rekap_harian kemarin</code>",
            "<code>/rekap_harian 3 hari lalu</code>",
            "<code>/rekap_harian 2026-11-01</code>",
            "<code>/rekap_harian 01-11-2026</code> atau <code>01/11</code>",
            "<code>/rekap_harian 15</code> — tanggal 15 bulan berjalan",
          ].join("\n"),
        )
        return
      }
      const html = await recapDaily(session, today, date)
      await sendTelegramHtml(chatId, html)
      return
    }
    case "/rekap_tahunan": {
      const html = await recapYearly(session, today, parseYearArg(arg, today))
      await sendTelegramHtml(chatId, html)
      return
    }
    case "/rekap_kategori": {
      const opts = parseMonthArg(arg, today)
      if (opts === null) {
        await sendTelegramHtml(chatId, laporanUsage())
        return
      }
      const html = await recapCategory(session, today, opts)
      await sendTelegramHtml(chatId, html)
      return
    }
    case "/anggaran": {
      const html = await budgetReport(session, today)
      await sendTelegramHtml(chatId, html)
      return
    }
    case "/pinjaman": {
      const html = await loanReport(session, today)
      await sendTelegramHtml(chatId, html)
      return
    }
    case "/investasi": {
      const html = await investmentReport(session)
      await sendTelegramHtml(chatId, html)
      return
    }
    case "/cari": {
      if (!arg.trim()) {
        await sendTelegramHtml(
          chatId,
          [
            "Format: <code>/cari &lt;kata kunci&gt;</code>",
            "",
            "Contoh:",
            "<code>/cari kopi</code> — cari transaksi bernama kopi",
            "<code>/cari bulan lalu</code> — semua transaksi bulan lalu",
            "<code>/cari 2026-11</code> — transaksi pada November 2026",
          ].join("\n"),
        )
        return
      }
      const opts = parseSearchArg(arg, today)
      const { rows, total } = await searchTransactions(session, { ...opts, limit: 20 })
      const header = `🔎 <b>Hasil pencarian</b>${opts.keyword ? ` — “${escapeHtml(opts.keyword)}”` : ""}`
      const footer = total > rows.length
        ? `\n\n⚠️ Menampilkan ${rows.length} dari ${total} hasil.`
        : ""
      await sendTelegramHtml(chatId, `${header}\n\n${txList(rows)}${footer}`)
      return
    }
    case "/transaksi": {
      const opts = parseFilterArg(arg)
      const rows = await filterTransactions(session, opts)
      const header = `🧾 <b>Transaksi${opts.period ? ` — ${escapeHtml(opts.period)}` : ""}</b>`
      await sendTelegramHtml(
        chatId,
        `${header}\n\n${txList(rows, "Tidak ada transaksi yang cocok.")}\n\nFilter: <code>kategori</code> · <code>dompet</code> · <code>jenis</code> · <code>periode</code> · <code>limit</code>`,
      )
      return
    }
    case "/top": {
      const limit = Number(arg.trim())
      const n = Number.isFinite(limit) && limit > 0 ? Math.min(20, Math.floor(limit)) : 5
      const items = await topCategories(session, today, { limit: n })
      if (items.length === 0) {
        await sendTelegramHtml(chatId, "🏆 <b>Top pengeluaran</b>\n\nBelum ada pengeluaran bulan ini.")
        return
      }
      const lines = items.map(
        (i) => `• ${escapeHtml(i.name)} — ${formatAmount(i.total)} (${i.pct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%)`,
      )
      await sendTelegramHtml(chatId, `🏆 <b>Top ${items.length} pengeluaran</b>\n\n${lines.join("\n")}`)
      return
    }
  }
}

/** Perintah laporan yang butuh akun tertaut. */
const LAPORAN_COMMANDS = new Set([
  "/rekap",
  "/rekap_harian",
  "/rekap_tahunan",
  "/rekap_kategori",
  "/anggaran",
  "/cari",
  "/transaksi",
  "/top",
  "/pinjaman",
  "/investasi",
])

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
      default: {
        if (!LAPORAN_COMMANDS.has(command)) {
          await sendTelegramMessage(chatId, `Perintah tidak dikenal: ${command}. /help untuk melihat daftar.`)
          return
        }

        const link = await telegramRepository.findByChatId(chatId)
        if (!link) {
          await sendTelegramMessage(chatId, "Belum terhubung. Kirim /link KODE dulu.")
          return
        }
        const repCtx = await loadContext(link.user_id)
        if (!repCtx) {
          await sendTelegramMessage(chatId, "Akun ini tidak bisa dipakai lewat Telegram.")
          return
        }

        // Perintah laporan tidak melewati rate limit AI (tak memanggil model).
        try {
          await handleLaporan(chatId, repCtx, command, arg)
        } catch (err) {
          console.error(`[telegram] gagal menjalankan ${command}:`, err)
          await sendTelegramMessage(
            chatId,
            "⚠️ Maaf, laporan tidak bisa dibuat. Coba lagi sebentar.",
          )
        }
        return
      }
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
