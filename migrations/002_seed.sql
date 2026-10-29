-- Money Management — master data seed (PostgreSQL)
--
-- Idempotent: aman dijalankan berulang kali. Dipakai untuk data default
-- (kategori bawaan, user lokal, kredensial login).

-- ── Local user + credentials ─────────────────────────────────────────────────

INSERT INTO "user" (id, name, email)
VALUES ('local-user', 'TONAS', 'local@tonas.app')
ON CONFLICT (id) DO NOTHING;

INSERT INTO credentials (username, password_hash)
VALUES ('TONAS', '$2a$10$P3J6.Mi9Cn54fn90ObguE.LtseRJwy6A6pJ/xzmWBC0qDJOvaXE0G')
ON CONFLICT (username) DO NOTHING;

-- ── Wallet categories ────────────────────────────────────────────────────────

INSERT INTO wallet_categories (id, name, is_liquid, is_default, sort_order)
SELECT v.id, v.name, v.is_liquid, 1, v.n
FROM (VALUES
  ('seed-wc-tunai',      'TUNAI',      1, 1),
  ('seed-wc-bank',       'BANK',       1, 2),
  ('seed-wc-ewallet',    'E-WALLET',   1, 3),
  ('seed-wc-investasi',  'INVESTASI',  0, 4),
  ('seed-wc-asetfisik',  'ASET FISIK', 0, 5),
  ('seed-wc-kripto',     'KRIPTO',     0, 6)
) AS v(id, name, is_liquid, n)
WHERE NOT EXISTS (SELECT 1 FROM wallet_categories WHERE id = v.id);

-- ── Income categories ────────────────────────────────────────────────────────

INSERT INTO income_categories (id, name, is_default, sort_order)
SELECT v.id, v.name, 1, v.n
FROM (VALUES
  ('seed-ic-tetap',       'TETAP',       1),
  ('seed-ic-bonustetap',  'BONUS TETAP', 2),
  ('seed-ic-freelance',   'FREELANCE',   3),
  ('seed-ic-lainnya',     'LAINNYA',     4)
) AS v(id, name, n)
WHERE NOT EXISTS (SELECT 1 FROM income_categories WHERE id = v.id);

-- ── Expense types ────────────────────────────────────────────────────────────

INSERT INTO expense_types (id, name, is_default, sort_order)
SELECT v.id, v.name, 1, v.n
FROM (VALUES
  ('seed-et-tetap',     'TETAP',     1),
  ('seed-et-fleksibel', 'FLEKSIBEL', 2)
) AS v(id, name, n)
WHERE NOT EXISTS (SELECT 1 FROM expense_types WHERE id = v.id);

-- ── Expense categories ───────────────────────────────────────────────────────

INSERT INTO expense_categories (id, name, type_id, is_default, sort_order, default_percentage)
SELECT v.id, v.name, 'seed-et-tetap', 1, v.n, v.dp
FROM (VALUES
  ('seed-ec-transportasi',     'TRANSPORTASI',     1,  5.27),
  ('seed-ec-rumah',            'RUMAH',            2, 17.80),
  ('seed-ec-pendidikan',       'PENDIDIKAN',       3,  1.80),
  ('seed-ec-mylove',           'MY LOVE',          4,  2.70),
  ('seed-ec-kesehatan',        'KESEHATAN',        5,  3.57),
  ('seed-ec-komunikasi',       'KOMUNIKASI',       6,  3.60),
  ('seed-ec-hiburan',          'HIBURAN/JAJAN',    7,  1.80),
  ('seed-ec-hewan',            'HEWAN PELIHARAAN', 8,  0.00),
  ('seed-ec-cicilan',          'CICILAN/UTANG',    9,  0.00)
) AS v(id, name, n, dp)
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE id = v.id);

INSERT INTO expense_categories (id, name, type_id, is_default, sort_order, default_percentage)
SELECT v.id, v.name, 'seed-et-fleksibel', 1, v.n, 0
FROM (VALUES
  ('seed-ec-gayahidup',        'GAYA HIDUP',          1),
  ('seed-ec-sosial',           'SOSIAL',              2),
  ('seed-ec-relation',         'RELATION',            3),
  ('seed-ec-selfdev',          'SELF DEVELOPMENT',    4),
  ('seed-ec-investasibisnis',  'INVESTASI BISNIS',    5),
  ('seed-ec-kantor',           'KANTOR',              6),
  ('seed-ec-freelanceexp',     'FREELANCE EXPENSE',   7),
  ('seed-ec-donasi',           'DONASI/ZAKAT',        8),
  ('seed-ec-lainnyacat',       'LAINNYA',             9)
) AS v(id, name, n)
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE id = v.id);

-- ── Investment categories ────────────────────────────────────────────────────

INSERT INTO investment_categories (id, name, is_default, sort_order)
SELECT v.id, v.name, 1, v.n
FROM (VALUES
  ('seed-ic-saham',     'SAHAM',      1),
  ('seed-ic-reksadana', 'REKSA DANA', 2),
  ('seed-ic-emas',      'EMAS',       3),
  ('seed-ic-kripto',    'KRIPTO',     4),
  ('seed-ic-deposito',  'DEPOSITO',   5),
  ('seed-ic-lainnyai',  'LAINNYA',    6)
) AS v(id, name, n)
WHERE NOT EXISTS (SELECT 1 FROM investment_categories WHERE id = v.id);
