-- Money Management — Integrasi Telegram (asesan AI untuk input transaksi)
--
-- Menambahkan:
--   1. `telegram_links`      → ikatan chat_id Telegram dengan akun anggota keluarga.
--   2. `telegram_link_codes` → kode sekali pakai untuk proses linking (self-service).
--
-- Aturan:
--   * Satu chat Telegram = satu akun. `chat_id` UNIQUE mencegah satu chat
--     dipakai dua akun (yang terakhir victorious merebut, tapi riwayat lama
--     milik akun sebelumnya akan hilang).
--   * Kode linking berlaku singkat (default 15 menit) dan hanya bisa dipakai sekali.
--
-- Idempotent: aman dijalankan ulang. Dijalankan lewat `npm run migrate`.

-- ── 1. Ikatan chat Telegram ↔ akun ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS telegram_links (
  user_id            TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  chat_id            TEXT NOT NULL UNIQUE,
  telegram_username  TEXT,
  telegram_first_name TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_links_chat ON telegram_links (chat_id);

-- ── 2. Kode linking sekali pakai ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code       TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_user ON telegram_link_codes (user_id);

COMMENT ON TABLE telegram_links IS 'Ikatan akun anggota keluarga dengan chat Telegram pribadi';
COMMENT ON TABLE telegram_link_codes IS 'Kode sekali pakai untuk menautkan akun ke bot Telegram';
