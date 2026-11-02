/**
 * Klien Telegram Bot API (REST).
 *
 * Sengaja tanpa SDK resmi: kebutuhan kita cuma kirim pesan, ambil file,
 * dan memasang webhook — semuanya satu POST/GET sederhana.
 */

const API_BASE = process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org"

export function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum diset")
  return token
}

export function getWebhookSecret(): string {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET belum diset")
  return secret
}

async function callApi<T>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const token = getBotToken()
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  })
  const data = (await res.json().catch(() => null)) as
    | { ok: boolean; result?: T; description?: string }
    | null
  if (!res.ok || !data?.ok) {
    const desc = data?.description ?? `HTTP ${res.status}`
    throw new Error(`Telegram API ${method} gagal: ${desc}`)
  }
  return data.result as T
}

export interface TelegramSendOptions {
  parseMode?: "HTML" | "Markdown" | "MarkdownV2"
  replyToMessageId?: number
  disableWebPagePreview?: boolean
}

export { escapeHtml } from "./format"

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  options: TelegramSendOptions = {},
): Promise<void> {
  await callApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options.parseMode,
    reply_to_message_id: options.replyToMessageId,
    disable_web_page_preview: options.disableWebPagePreview ?? true,
  })
}

/** Potong pesan panjang (Telegram membatasi 4096 karakter per pesan). */
export function chunkMessage(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit)
    if (cut < limit * 0.6) cut = limit
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  if (rest.trim()) chunks.push(rest)
  return chunks
}

export async function sendTelegramMessageLong(
  chatId: string | number,
  text: string,
  options: TelegramSendOptions = {},
): Promise<void> {
  for (const chunk of chunkMessage(text)) {
    await sendTelegramMessage(chatId, chunk, options)
  }
}

/** Kirim pesan berformat HTML (statis/terstruktur). */
export async function sendTelegramHtml(
  chatId: string | number,
  html: string,
  options: Omit<TelegramSendOptions, "parseMode"> = {},
): Promise<void> {
  await sendTelegramMessage(chatId, html, { ...options, parseMode: "HTML" })
}

interface TelegramFile {
  file_id: string
  file_unique_id: string
  file_path: string
  file_size?: number
}

/** Ambil metadata file (termasuk file_path untuk diunduh). */
export async function getTelegramFile(fileId: string): Promise<TelegramFile> {
  return await callApi<TelegramFile>("getFile", { file_id: fileId })
}

/**
 * Unduh file dari Telegram.
 * Dipakai untuk OCR struk: gambar dikirim ke Gemini sebagai inline data.
 */
export async function downloadTelegramFile(filePath: string): Promise<Buffer> {
  const token = getBotToken()
  const res = await fetch(`${API_BASE}/file/bot${token}/${filePath}`, { cache: "no-store" })
  if (!res.ok) throw new Error(`Gagal unduh file Telegram: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/** Pasang webhook. `secretToken` dipakai Telegram sebagai header pembawa secret. */
export async function setTelegramWebhook(url: string, secretToken: string): Promise<void> {
  await callApi("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  })
}

export async function deleteTelegramWebhook(): Promise<void> {
  await callApi("deleteWebhook", { drop_pending_updates: false })
}

export async function getTelegramWebhookInfo(): Promise<{
  url: string
  has_custom_certificate: boolean
  pending_update_count: number
  last_error_message?: string
}> {
  return await callApi("getWebhookInfo")
}

/** Kirim "typing" statusfkasi ke chat (indikator bot sedang bekerja). */
export async function sendTyping(chatId: string | number): Promise<void> {
  try {
    await callApi("sendChatAction", { chat_id: chatId, action: "typing" })
  } catch {
    // Gagal menampilkan indikator tidak boleh menggagalkan pemrosesan.
  }
}
