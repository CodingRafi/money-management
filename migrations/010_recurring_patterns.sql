-- Pola transaksi berulang yang sudah dikonfirmasi user (fitur "Belum Dicatat").
-- Pola = template, bukan transaksi: bisa eksis tanpa transaksi bulan berjalan.
CREATE TABLE IF NOT EXISTS recurring_patterns (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  household_id      TEXT REFERENCES households(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('EXPENSE','INCOME')),
  name              TEXT NOT NULL,
  category_id       TEXT,                       -- expense_categories / income_categories (sesuai kind)
  wallet_id         TEXT REFERENCES wallets(id) ON DELETE SET NULL,
  needs_type        TEXT NOT NULL DEFAULT 'PRIMER' CHECK (needs_type IN ('PRIMER','SEKUNDER','TERSIER')),
  is_family_expense INTEGER NOT NULL DEFAULT 0,
  -- Statistik historis (dasar nominal & tanggal usulan)
  amount_avg        DOUBLE PRECISION NOT NULL DEFAULT 0,
  amount_min        DOUBLE PRECISION NOT NULL DEFAULT 0,
  amount_max        DOUBLE PRECISION NOT NULL DEFAULT 0,
  occurrences       INTEGER NOT NULL DEFAULT 0,
  day_of_month      INTEGER NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 31),
  confidence        DOUBLE PRECISION NOT NULL DEFAULT 0,
  -- State
  is_active         INTEGER NOT NULL DEFAULT 1,  -- 0 = diabaikan
  auto_post         INTEGER NOT NULL DEFAULT 0,  -- 1 = transaksi dibuat otomatis
  last_posted_month TEXT,                        -- 'YYYY-MM' — bulan yang sudah ditangani (idempotensi)
  last_seen_date    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_user  ON recurring_patterns (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_house ON recurring_patterns (household_id);
