-- Money Management — Multi-tenant keluarga + lisensi (Fase 1, tahap ADITIF)
--
-- Migrasi ini hanya MENAMBAH struktur dan memindahkan data. Perubahan yang
-- merusak (DROP credentials, wallets.balance, categories.year/user_id) ada di
-- 004_family_saas_cleanup.sql dan baru dijalankan setelah kode tidak lagi
-- memakainya. Idempotent: aman dijalankan ulang.

-- ── Tabel baru ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS households (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  currency   TEXT NOT NULL DEFAULT 'IDR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS licenses (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  plan_type    TEXT NOT NULL DEFAULT 'basic',  -- 'basic' | 'family_pro' | 'lifetime'
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'suspended', 'trial')),
  max_members  INTEGER NOT NULL DEFAULT 5,
  starts_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ,                    -- NULL = lifetime / tanpa batas
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS household_members (
  household_id   TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role           TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'child')),
  relation       TEXT,                         -- 'suami' | 'istri' | 'anak'
  spending_limit DOUBLE PRECISION,             -- batas belanja bulanan (role child)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (household_id, user_id)
);

-- Satu user hanya boleh jadi anggota satu keluarga.
CREATE UNIQUE INDEX IF NOT EXISTS idx_household_members_user_unique ON household_members (user_id);
CREATE INDEX IF NOT EXISTS idx_licenses_household ON licenses (household_id);

-- Rate limiting login (disimpan di DB agar tahan restart / multi-instance).
CREATE TABLE IF NOT EXISTS login_attempts (
  id           BIGSERIAL PRIMARY KEY,
  identifier   TEXT NOT NULL,                  -- 'ip:1.2.3.4' atau 'user:budi'
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_lookup ON login_attempts (identifier, attempted_at);

-- ── "user" & sesi ───────────────────────────────────────────────────────────

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS username      TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS relation      TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS role          TEXT NOT NULL DEFAULT 'member';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_role_check') THEN
    ALTER TABLE "user" ADD CONSTRAINT user_role_check
      CHECK (role IN ('super_admin', 'admin', 'member', 'child'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_username_key') THEN
    ALTER TABLE "user" ADD CONSTRAINT user_username_key UNIQUE (username);
  END IF;
END $$;

-- Pindahkan kredensial lama ke akun utama; akun ini jadi Super Admin.
UPDATE "user" SET
  username      = (SELECT username      FROM credentials LIMIT 1),
  password_hash = (SELECT password_hash FROM credentials LIMIT 1),
  role          = 'super_admin'
WHERE id = 'local-user' AND password_hash IS NULL;

ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
UPDATE user_sessions SET user_id = 'local-user' WHERE user_id IS NULL;
ALTER TABLE user_sessions ALTER COLUMN user_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions (user_id);

-- ── Keluarga bawaan untuk data yang sudah ada ───────────────────────────────

INSERT INTO households (id, name)
SELECT 'household-default', 'Keluarga TONAS'
WHERE EXISTS (SELECT 1 FROM "user" WHERE id = 'local-user')
ON CONFLICT (id) DO NOTHING;

INSERT INTO licenses (id, household_id, plan_type, status, max_members, expires_at)
SELECT 'license-default', 'household-default', 'lifetime', 'active', 10, NULL
WHERE EXISTS (SELECT 1 FROM households WHERE id = 'household-default')
ON CONFLICT (id) DO NOTHING;

INSERT INTO household_members (household_id, user_id, role, relation)
SELECT 'household-default', 'local-user', 'admin', 'suami'
WHERE EXISTS (SELECT 1 FROM households WHERE id = 'household-default')
ON CONFLICT (household_id, user_id) DO NOTHING;

-- ── Jejak input & penanda pengeluaran keluarga ──────────────────────────────

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_family_expense INTEGER NOT NULL DEFAULT 0;

ALTER TABLE expenses         ADD COLUMN IF NOT EXISTS recorded_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE incomes          ADD COLUMN IF NOT EXISTS recorded_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE transfers        ADD COLUMN IF NOT EXISTS recorded_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE investments      ADD COLUMN IF NOT EXISTS recorded_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE investment_goals ADD COLUMN IF NOT EXISTS recorded_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE loans            ADD COLUMN IF NOT EXISTS recorded_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;

UPDATE expenses         SET recorded_by = user_id WHERE recorded_by IS NULL;
UPDATE incomes          SET recorded_by = user_id WHERE recorded_by IS NULL;
UPDATE transfers        SET recorded_by = user_id WHERE recorded_by IS NULL;
UPDATE investments      SET recorded_by = user_id WHERE recorded_by IS NULL;
UPDATE investment_goals SET recorded_by = user_id WHERE recorded_by IS NULL;
UPDATE loans            SET recorded_by = user_id WHERE recorded_by IS NULL;

-- ── Kategori milik keluarga ─────────────────────────────────────────────────
-- household_id NULL = template global (is_default = 1, disalin saat keluarga
-- baru dibuat). Kolom user_id/year lama dibiarkan sampai 004.

ALTER TABLE income_categories  ADD COLUMN IF NOT EXISTS household_id TEXT REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE expense_types      ADD COLUMN IF NOT EXISTS household_id TEXT REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS household_id TEXT REFERENCES households(id) ON DELETE CASCADE;

UPDATE income_categories c SET household_id = m.household_id
FROM household_members m WHERE c.household_id IS NULL AND c.user_id = m.user_id;
UPDATE expense_types c SET household_id = m.household_id
FROM household_members m WHERE c.household_id IS NULL AND c.user_id = m.user_id;
UPDATE expense_categories c SET household_id = m.household_id
FROM household_members m WHERE c.household_id IS NULL AND c.user_id = m.user_id;

CREATE INDEX IF NOT EXISTS idx_income_categories_household  ON income_categories (household_id);
CREATE INDEX IF NOT EXISTS idx_expense_types_household      ON expense_types (household_id);
CREATE INDEX IF NOT EXISTS idx_expense_categories_household ON expense_categories (household_id);
