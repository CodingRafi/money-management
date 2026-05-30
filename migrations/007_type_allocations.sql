-- Type-level budget allocations + add MENABUNG expense type
-- Run AFTER 006_categories.sql

-- ── Tambah tipe MENABUNG ke master ───────────────────────────────────────────
INSERT INTO expense_types (name, is_default, sort_order)
SELECT 'MENABUNG', true, 3
WHERE NOT EXISTS (
  SELECT 1 FROM expense_types WHERE name = 'MENABUNG' AND is_default = true AND user_id IS NULL
);

-- Kategori default MENABUNG
INSERT INTO expense_categories (name, type_id, is_default, sort_order, default_percentage)
SELECT v.name, et.id, true, v.n, 0
FROM expense_types et
CROSS JOIN (VALUES
  ('TABUNGAN DARURAT', 1),
  ('INVESTASI',        2),
  ('DANA PENSIUN',     3),
  ('LAINNYA',          4)
) AS v(name, n)
WHERE et.name = 'MENABUNG' AND et.is_default = true AND et.user_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM expense_categories ec
    JOIN expense_types et2 ON et2.id = ec.type_id
    WHERE et2.name = 'MENABUNG' AND ec.is_default = true AND ec.user_id IS NULL
  );

-- ── Tabel alokasi per tipe ────────────────────────────────────────────────────
-- Menyimpan persentase alokasi dari total pendapatan per tipe pengeluaran per user.
-- Berbeda dari budgets (per kategori per bulan), ini adalah konfigurasi tetap user.
CREATE TABLE IF NOT EXISTS type_allocations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type_id     UUID NOT NULL REFERENCES expense_types(id) ON DELETE CASCADE,
  percentage  DECIMAL NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, type_id)
);
