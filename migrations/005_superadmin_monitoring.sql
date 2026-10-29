-- Money Management — Monitoring penjualan lisensi (Fase Super Admin)
--
-- Menambahkan:
--   1. `licenses.price`   → nilai jual lisensi (IDR) per keluarga.
--   2. `licenses.sold_at`  → tanggal transaksi penjualan/renewal terakhir.
--   3. `license_events`    → riwayat penjualan, perpanjangan, dan perubahan status.
--
-- Idempotent: aman dijalankan ulang. Dijalankan lewat `npm run migrate`.

-- ── 1. Nilai jual & tanggal penjualan ──────────────────────────────────────

ALTER TABLE licenses ADD COLUMN IF NOT EXISTS price   BIGINT NOT NULL DEFAULT 0;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;

COMMENT ON COLUMN licenses.price IS 'Nilai jual lisensi dalam IDR (0 = belum ada transaksi tercatat)';
COMMENT ON COLUMN licenses.sold_at IS 'Tanggal penjualan/renewal terakhir';

-- ── 2. Riwayat transaksi lisensi ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS license_events (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL DEFAULT 'sale'
                 CHECK (event_type IN ('sale','renewal','status_change','upgrade','created','member_change')),
  amount       BIGINT NOT NULL DEFAULT 0,
  plan_type    TEXT,
  note         TEXT,
  created_by   TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_license_events_household ON license_events (household_id);
CREATE INDEX IF NOT EXISTS idx_license_events_created   ON license_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_license_events_type      ON license_events (event_type);

-- ── 3. Backfill: lisensi yang sudah ada dianggap sold saat dibuat ───────────

UPDATE licenses SET sold_at = starts_at WHERE sold_at IS NULL AND starts_at IS NOT NULL;
