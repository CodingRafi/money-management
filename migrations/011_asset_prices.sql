-- Harga historis per aset investasi (harian). Privasi mengikuti kepemilikan
-- aset: harga hanya dibaca lewat JOIN ke investments.user_id = scope.userIds.
CREATE TABLE IF NOT EXISTS asset_prices (
  investment_id TEXT NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,                    -- YYYY-MM-DD
  close         DOUBLE PRECISION NOT NULL CHECK (close > 0),
  source        TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'yahoo' | 'import' | 'seed'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (investment_id, date)
);

CREATE INDEX IF NOT EXISTS idx_asset_prices_date ON asset_prices (date);

-- Harga benchmark (indeks pasar, emas, obligasi) — data pasar publik, dipakai bersama.
CREATE TABLE IF NOT EXISTS benchmark_prices (
  code          TEXT NOT NULL,                    -- 'IHSG' | 'GOLD' | 'OBLIGASI_ID' | ...
  date          TEXT NOT NULL,
  close         DOUBLE PRECISION NOT NULL CHECK (close > 0),
  source        TEXT NOT NULL DEFAULT 'manual',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (code, date)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_prices_date ON benchmark_prices (code, date);

-- Ticker supaya harga bisa di-sync otomatis (format Yahoo: BBRI.JK, ^JKSE, GC=F).
ALTER TABLE investments ADD COLUMN IF NOT EXISTS ticker TEXT;
CREATE INDEX IF NOT EXISTS idx_investments_ticker ON investments (ticker);
