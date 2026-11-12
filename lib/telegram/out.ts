import type { InlineKeyboard } from "./telegram-api"

/**
 * Cara bot membalas. Perintah yang diketik user selalu mengirim pesan baru,
 * sedangkan penekanan tombol mengubah pesan yang sama (chat tidak penuh).
 * Handler cukup memakai `Out` tanpa peduli asalnya.
 */
export interface Out {
  chatId: string
  /** Tampilkan HTML: mengedit pesan bertombol bila ada, kalau tidak kirim baru. */
  reply(html: string, keyboard?: InlineKeyboard): Promise<void>
  /** Selalu kirim pesan baru (mis. hasil aksi yang ingin tetap terlihat). */
  send(html: string, keyboard?: InlineKeyboard): Promise<void>
  /**
   * Kirim pertanyaan yang jawabannya akan dibalas user (force reply).
   * `ref` ditempel di akhir pesan sebagai penanda — saat user membalas, bot
   * membaca penanda itu untuk tahu balasan ini ditujukan ke mana, tanpa perlu
   * menyimpan state di server.
   */
  prompt(html: string, ref: PromptRef, placeholder?: string): Promise<void>
}

/** Penanda balasan: domain (pj=pinjaman, iv=investasi, cf=cashflow) : aksi : kode [: argumen]. */
export interface PromptRef {
  domain: "pj" | "iv" | "cf"
  action: string
  code: string
  arg?: string
}

export function formatRef(ref: PromptRef): string {
  return `[ref ${ref.domain}:${ref.action}:${ref.code}${ref.arg ? `:${ref.arg}` : ""}]`
}

const REF_PATTERN = /\[ref (pj|iv|cf):([a-z]+):([A-Za-z0-9]+)(?::([a-z0-9]+))?\]/

/** Baca penanda dari teks pesan bot yang dibalas user. */
export function parseRef(text: string | undefined): PromptRef | null {
  if (!text) return null
  const m = REF_PATTERN.exec(text)
  if (!m) return null
  return { domain: m[1] as PromptRef["domain"], action: m[2], code: m[3], arg: m[4] }
}

/** Potong teks untuk label tombol. */
export function clip(text: string, max = 28): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}
