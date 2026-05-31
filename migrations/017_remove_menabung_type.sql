-- Hapus expense type MENABUNG (sudah digantikan oleh fitur Investasi)
-- Run AFTER 016_wallet_balance_investment_goals.sql

-- 1. Putuskan relasi expenses dari kategori MENABUNG (set category_id = NULL)
UPDATE expenses
SET category_id = NULL
WHERE category_id IN (
  SELECT ec.id FROM expense_categories ec
  JOIN expense_types et ON et.id = ec.type_id
  WHERE et.name = 'MENABUNG'
);

-- 2. Hapus budget entries yang terkait kategori MENABUNG
DELETE FROM budgets
WHERE category_id IN (
  SELECT ec.id FROM expense_categories ec
  JOIN expense_types et ON et.id = ec.type_id
  WHERE et.name = 'MENABUNG'
);

-- 3. Hapus expense_categories bertipe MENABUNG (default & user)
DELETE FROM expense_categories
WHERE type_id IN (
  SELECT id FROM expense_types WHERE name = 'MENABUNG'
);

-- 4. Hapus type_allocations untuk tipe MENABUNG
DELETE FROM type_allocations
WHERE type_id IN (
  SELECT id FROM expense_types WHERE name = 'MENABUNG'
);

-- 5. Hapus expense_types MENABUNG (default & semua user)
DELETE FROM expense_types WHERE name = 'MENABUNG';
