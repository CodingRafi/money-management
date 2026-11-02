import { db } from "@/lib/db"

export interface TelegramLinkRow {
  user_id: string
  chat_id: string
  telegram_username: string | null
  telegram_first_name: string | null
  created_at: string
  updated_at: string
}

export interface TelegramLinkCodeRow {
  code: string
  user_id: string
  expires_at: string
  used_at: string | null
  created_at: string
}

export const telegramRepository = {
  // ── Link ───────────────────────────────────────────────────────────────────

  async findByChatId(chatId: string): Promise<TelegramLinkRow | undefined> {
    return await db.prepare(
      `SELECT user_id, chat_id, telegram_username, telegram_first_name, created_at, updated_at
       FROM telegram_links WHERE chat_id = ?`
    ).get(chatId) as TelegramLinkRow | undefined
  },

  async findByUserId(userId: string): Promise<TelegramLinkRow | undefined> {
    return await db.prepare(
      `SELECT user_id, chat_id, telegram_username, telegram_first_name, created_at, updated_at
       FROM telegram_links WHERE user_id = ?`
    ).get(userId) as TelegramLinkRow | undefined
  },

  /**
   * Menaikkan chat_id ke akun tertentu. Chat yang sebelumnya milik akun lain
   * dilepas (chat_id UNIQUE), dan akun lama yang tertaut ke chat ini dilepas
   * juga supaya satu akun hanya punya satu chat.
   */
  async upsertLink(v: {
    userId: string
    chatId: string
    telegramUsername: string | null
    telegramFirstName: string | null
  }): Promise<void> {
    await db.transaction(async () => {
      // Lepas chat ini dari akun lain bila ada.
      await db.prepare("DELETE FROM telegram_links WHERE chat_id = ? AND user_id <> ?").run(v.chatId, v.userId)
      // Lepas akun ini dari chat lamanya.
      await db.prepare("DELETE FROM telegram_links WHERE user_id = ? AND chat_id <> ?").run(v.userId, v.chatId)

      await db.prepare(
        `INSERT INTO telegram_links (user_id, chat_id, telegram_username, telegram_first_name)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET
           chat_id = EXCLUDED.chat_id,
           telegram_username = EXCLUDED.telegram_username,
           telegram_first_name = EXCLUDED.telegram_first_name,
           updated_at = NOW()`
      ).run(v.userId, v.chatId, v.telegramUsername, v.telegramFirstName)
    })
  },

  async deleteByUserId(userId: string): Promise<number> {
    return (await db.prepare("DELETE FROM telegram_links WHERE user_id = ?").run(userId)).changes
  },

  async deleteByChatId(chatId: string): Promise<number> {
    return (await db.prepare("DELETE FROM telegram_links WHERE chat_id = ?").run(chatId)).changes
  },

  // ── Kode linking ───────────────────────────────────────────────────────────

  async createCode(code: string, userId: string, expiresAt: string): Promise<void> {
    // Satu kode aktif per akun — kode lama langsung dibuang.
    await db.prepare("DELETE FROM telegram_link_codes WHERE user_id = ?").run(userId)
    await db.prepare(
      "INSERT INTO telegram_link_codes (code, user_id, expires_at) VALUES (?, ?, ?)"
    ).run(code, userId, expiresAt)
  },

  async findValidCode(code: string): Promise<TelegramLinkCodeRow | undefined> {
    return await db.prepare(
      `SELECT code, user_id, expires_at, used_at, created_at
       FROM telegram_link_codes
       WHERE code = ? AND used_at IS NULL AND expires_at > NOW()`
    ).get(code) as TelegramLinkCodeRow | undefined
  },

  async markCodeUsed(code: string): Promise<void> {
    await db.prepare("UPDATE telegram_link_codes SET used_at = NOW() WHERE code = ?").run(code)
  },

  async deleteExpiredCodes(): Promise<void> {
    await db.prepare("DELETE FROM telegram_link_codes WHERE expires_at < NOW() - INTERVAL '1 day'").run()
  },
}
