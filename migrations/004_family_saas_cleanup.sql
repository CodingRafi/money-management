-- Money Management — Multi-tenant keluarga (Fase 1, tahap PEMBERSIHAN)
--
-- Jalankan SETELAH 003 dan setelah kode versi baru terpasang:
--   1. Menggabungkan kategori duplikat (salinan per-tahun/per-user) menjadi satu
--      daftar per keluarga, lalu mengarahkan ulang semua referensinya.
--   2. Menghapus kolom/tabel lama: credentials, wallets.balance, kategori.user_id/year.
--
-- Berjalan dalam satu transaksi (runMigrations). BACKUP database dulu: DROP COLUMN
-- tidak bisa dibatalkan setelah COMMIT.

-- ── 1. Gabungkan jenis pengeluaran (expense_types) ──────────────────────────
-- Baris kanonik = baris dengan tahun terbaru untuk (household_id, name).

CREATE TEMP TABLE et_map ON COMMIT DROP AS
SELECT id AS old_id,
       FIRST_VALUE(id) OVER (
         PARTITION BY household_id, name
         ORDER BY year DESC NULLS LAST, created_at DESC, id
       ) AS new_id
FROM expense_types
WHERE household_id IS NOT NULL;

UPDATE expense_categories ec SET type_id = m.new_id
FROM et_map m WHERE ec.type_id = m.old_id AND m.old_id <> m.new_id;

-- type_allocations: unik (user_id, type_id, year) → bangun ulang tanpa bentrok.
CREATE TEMP TABLE ta_new ON COMMIT DROP AS
SELECT DISTINCT ON (ta.user_id, COALESCE(m.new_id, ta.type_id), ta.year)
       ta.id, ta.user_id, COALESCE(m.new_id, ta.type_id) AS type_id,
       ta.percentage, ta.created_at, ta.year
FROM type_allocations ta
LEFT JOIN et_map m ON m.old_id = ta.type_id
ORDER BY ta.user_id, COALESCE(m.new_id, ta.type_id), ta.year,
         (m.old_id = m.new_id) DESC NULLS LAST, ta.created_at DESC;
DELETE FROM type_allocations;
INSERT INTO type_allocations (id, user_id, type_id, percentage, created_at, year)
SELECT id, user_id, type_id, percentage, created_at, year FROM ta_new;

DELETE FROM expense_types t USING et_map m WHERE t.id = m.old_id AND m.old_id <> m.new_id;

-- ── 2. Gabungkan kategori pengeluaran ────────────────────────────────────────

CREATE TEMP TABLE ec_map ON COMMIT DROP AS
SELECT id AS old_id,
       FIRST_VALUE(id) OVER (
         PARTITION BY household_id, type_id, name
         ORDER BY year DESC NULLS LAST, created_at DESC, id
       ) AS new_id
FROM expense_categories
WHERE household_id IS NOT NULL;

UPDATE expenses e SET category_id = m.new_id
FROM ec_map m WHERE e.category_id = m.old_id AND m.old_id <> m.new_id;

CREATE TEMP TABLE budgets_new ON COMMIT DROP AS
SELECT DISTINCT ON (b.user_id, COALESCE(m.new_id, b.category_id), b.month, b.year)
       b.id, b.user_id, COALESCE(m.new_id, b.category_id) AS category_id,
       b.percentage, b.month, b.year, b.created_at
FROM budgets b
LEFT JOIN ec_map m ON m.old_id = b.category_id
ORDER BY b.user_id, COALESCE(m.new_id, b.category_id), b.month, b.year,
         (m.old_id = m.new_id) DESC NULLS LAST, b.created_at DESC;
DELETE FROM budgets;
INSERT INTO budgets (id, user_id, category_id, percentage, month, year, created_at)
SELECT id, user_id, category_id, percentage, month, year, created_at FROM budgets_new;

CREATE TEMP TABLE nominal_new ON COMMIT DROP AS
SELECT DISTINCT ON (n.user_id, COALESCE(m.new_id, n.category_id), n.year)
       n.id, n.user_id, COALESCE(m.new_id, n.category_id) AS category_id,
       n.year, n.nominal, n.created_at
FROM category_nominal_budgets n
LEFT JOIN ec_map m ON m.old_id = n.category_id
ORDER BY n.user_id, COALESCE(m.new_id, n.category_id), n.year,
         (m.old_id = m.new_id) DESC NULLS LAST, n.created_at DESC;
DELETE FROM category_nominal_budgets;
INSERT INTO category_nominal_budgets (id, user_id, category_id, year, nominal, created_at)
SELECT id, user_id, category_id, year, nominal, created_at FROM nominal_new;

DELETE FROM expense_categories c USING ec_map m WHERE c.id = m.old_id AND m.old_id <> m.new_id;

-- ── 3. Gabungkan kategori pemasukan ──────────────────────────────────────────

CREATE TEMP TABLE ic_map ON COMMIT DROP AS
SELECT id AS old_id,
       FIRST_VALUE(id) OVER (
         PARTITION BY household_id, name
         ORDER BY year DESC NULLS LAST, created_at DESC, id
       ) AS new_id
FROM income_categories
WHERE household_id IS NOT NULL;

UPDATE incomes i SET category_id = m.new_id
FROM ic_map m WHERE i.category_id = m.old_id AND m.old_id <> m.new_id;

DELETE FROM income_categories c USING ic_map m WHERE c.id = m.old_id AND m.old_id <> m.new_id;

-- ── 4. Hapus kolom lama kategori + cegah duplikat di masa depan ─────────────

ALTER TABLE income_categories  DROP COLUMN IF EXISTS user_id;
ALTER TABLE income_categories  DROP COLUMN IF EXISTS year;
ALTER TABLE expense_types      DROP COLUMN IF EXISTS user_id;
ALTER TABLE expense_types      DROP COLUMN IF EXISTS year;
ALTER TABLE expense_categories DROP COLUMN IF EXISTS user_id;
ALTER TABLE expense_categories DROP COLUMN IF EXISTS year;

CREATE UNIQUE INDEX IF NOT EXISTS uq_income_categories_household  ON income_categories (household_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_types_household      ON expense_types (household_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_categories_household ON expense_categories (household_id, type_id, name);

-- ── 5. Dompet murni privat tanpa saldo ──────────────────────────────────────

ALTER TABLE wallets DROP COLUMN IF EXISTS balance;
ALTER TABLE wallets DROP COLUMN IF EXISTS initial_balance;
ALTER TABLE wallets DROP COLUMN IF EXISTS is_shared;

-- ── 6. Kredensial lama sudah dipindahkan ke "user" di 003 ───────────────────

DROP TABLE IF EXISTS credentials;
