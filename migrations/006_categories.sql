-- Category & budget tables
-- Run AFTER 002_roles_permissions.sql (needs "user" table from 001_better_auth.sql)

CREATE TABLE IF NOT EXISTS income_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  is_default   BOOLEAN DEFAULT FALSE,
  user_id      TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  color        TEXT,
  is_hidden    BOOLEAN DEFAULT FALSE,
  sort_order   INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense_types (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  is_default   BOOLEAN DEFAULT FALSE,
  user_id      TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  sort_order   INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  type_id            UUID REFERENCES expense_types(id) ON DELETE CASCADE,
  is_default         BOOLEAN DEFAULT FALSE,
  user_id            TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  is_hidden          BOOLEAN DEFAULT FALSE,
  default_percentage DECIMAL DEFAULT 0,
  sort_order         INT DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budgets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  category_id  UUID NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  percentage   DECIMAL NOT NULL DEFAULT 0,
  month        INT NOT NULL,
  year         INT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, category_id, month, year)
);

-- ── Seed: default income categories ────────────────────────────────────────
INSERT INTO income_categories (name, is_default, sort_order)
SELECT v.name, true, v.n
FROM (VALUES
  ('TETAP',       1),
  ('BONUS TETAP', 2),
  ('FREELANCE',   3),
  ('LAINNYA',     4)
) AS v(name, n)
WHERE NOT EXISTS (
  SELECT 1 FROM income_categories WHERE is_default = true AND user_id IS NULL
);

-- ── Seed: default expense types ─────────────────────────────────────────────
INSERT INTO expense_types (name, is_default, sort_order)
SELECT 'TETAP', true, 1
WHERE NOT EXISTS (
  SELECT 1 FROM expense_types WHERE name = 'TETAP' AND is_default = true AND user_id IS NULL
);

INSERT INTO expense_types (name, is_default, sort_order)
SELECT 'FLEKSIBEL', true, 2
WHERE NOT EXISTS (
  SELECT 1 FROM expense_types WHERE name = 'FLEKSIBEL' AND is_default = true AND user_id IS NULL
);

-- ── Seed: TETAP expense categories ──────────────────────────────────────────
INSERT INTO expense_categories (name, type_id, is_default, sort_order, default_percentage)
SELECT v.name, et.id, true, v.n, v.dp
FROM expense_types et
CROSS JOIN (VALUES
  ('TRANSPORTASI',    1,  5.27),
  ('RUMAH',           2, 17.80),
  ('PENDIDIKAN',      3,  1.80),
  ('MY LOVE',         4,  2.70),
  ('KESEHATAN',       5,  3.57),
  ('KOMUNIKASI',      6,  3.60),
  ('HIBURAN/JAJAN',   7,  1.80),
  ('HEWAN PELIHARAAN',8,  0.00),
  ('CICILAN/UTANG',   9,  0.00)
) AS v(name, n, dp)
WHERE et.name = 'TETAP' AND et.is_default = true AND et.user_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM expense_categories ec
    JOIN expense_types et2 ON et2.id = ec.type_id
    WHERE et2.name = 'TETAP' AND ec.is_default = true AND ec.user_id IS NULL
  );

-- ── Seed: FLEKSIBEL expense categories ──────────────────────────────────────
INSERT INTO expense_categories (name, type_id, is_default, sort_order, default_percentage)
SELECT v.name, et.id, true, v.n, 0
FROM expense_types et
CROSS JOIN (VALUES
  ('GAYA HIDUP',       1),
  ('SOSIAL',           2),
  ('RELATION',         3),
  ('SELF DEVELOPMENT', 4),
  ('INVESTASI BISNIS', 5),
  ('KANTOR',           6),
  ('FREELANCE EXPENSE',7),
  ('DONASI/ZAKAT',     8),
  ('LAINNYA',          9)
) AS v(name, n)
WHERE et.name = 'FLEKSIBEL' AND et.is_default = true AND et.user_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM expense_categories ec
    JOIN expense_types et2 ON et2.id = ec.type_id
    WHERE et2.name = 'FLEKSIBEL' AND ec.is_default = true AND ec.user_id IS NULL
  );
