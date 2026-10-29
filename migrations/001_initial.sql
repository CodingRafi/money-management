-- Money Management — initial schema (PostgreSQL)
--
-- Catatan desain:
--   * id memakai TEXT (bukan UUID) supaya id dari SQLite lama tetap bisa dipakai.
--   * Flag boolean (is_default, is_active, ...) tetap INTEGER 0/1 agar query
--     yang sudah ada (`= 1`, `= 0`) tidak perlu diubah.
--   * Nominal memakai DOUBLE PRECISION (bukan DECIMAL) supaya SUM() dikembalikan
--     sebagai angka JS, bukan string.

CREATE TABLE IF NOT EXISTS "user" (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credentials (
  username      TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sessions (
  token      TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);

-- ── Categories ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS income_categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  user_id    TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  color      TEXT,
  is_hidden  INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  year       INTEGER
);

CREATE TABLE IF NOT EXISTS expense_types (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  user_id    TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  year       INTEGER
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  type_id            TEXT REFERENCES expense_types(id) ON DELETE CASCADE,
  is_default         INTEGER NOT NULL DEFAULT 0,
  user_id            TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  is_hidden          INTEGER NOT NULL DEFAULT 0,
  default_percentage DOUBLE PRECISION NOT NULL DEFAULT 0,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  year               INTEGER
);

CREATE TABLE IF NOT EXISTS budgets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  percentage  DOUBLE PRECISION NOT NULL DEFAULT 0,
  month       INTEGER NOT NULL,
  year        INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, category_id, month, year)
);

CREATE TABLE IF NOT EXISTS type_allocations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type_id    TEXT NOT NULL REFERENCES expense_types(id) ON DELETE CASCADE,
  percentage DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  year       INTEGER,
  UNIQUE(user_id, type_id, year)
);

CREATE TABLE IF NOT EXISTS year_budget_settings (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  year             INTEGER NOT NULL,
  max_expense_pct  DOUBLE PRECISION NOT NULL DEFAULT 100,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, year)
);

CREATE TABLE IF NOT EXISTS category_nominal_budgets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  year        INTEGER NOT NULL,
  nominal     DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, category_id, year)
);

-- ── Wallets ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wallet_categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  is_liquid  INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallets (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  category_id      TEXT NOT NULL REFERENCES wallet_categories(id),
  name             TEXT NOT NULL,
  is_liquid        INTEGER NOT NULL DEFAULT 1,
  color            TEXT,
  icon             TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  balance          DOUBLE PRECISION NOT NULL DEFAULT 0,
  initial_balance  DOUBLE PRECISION NOT NULL DEFAULT 0
);

-- ── Transactions ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS incomes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  name        TEXT NOT NULL,
  category_id TEXT REFERENCES income_categories(id) ON DELETE SET NULL,
  wallet_id   TEXT REFERENCES wallets(id) ON DELETE SET NULL,
  amount      DOUBLE PRECISION NOT NULL CHECK (amount > 0),
  month       INTEGER NOT NULL,
  year        INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_initial  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  name        TEXT NOT NULL,
  wallet_id   TEXT REFERENCES wallets(id) ON DELETE SET NULL,
  category_id TEXT REFERENCES expense_categories(id) ON DELETE SET NULL,
  needs_type  TEXT NOT NULL DEFAULT 'PRIMER' CHECK (needs_type IN ('PRIMER', 'SEKUNDER', 'TERSIER')),
  amount      DOUBLE PRECISION NOT NULL CHECK (amount > 0),
  month       INTEGER NOT NULL,
  year        INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_initial  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS loans_given (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  borrower   TEXT NOT NULL,
  amount     DOUBLE PRECISION NOT NULL CHECK (amount > 0),
  status     TEXT NOT NULL DEFAULT 'FIX' CHECK (status IN ('FIX', 'GANTUNG')),
  notes      TEXT,
  month      INTEGER NOT NULL,
  year       INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loans_taken (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  lender     TEXT NOT NULL,
  amount     DOUBLE PRECISION NOT NULL CHECK (amount > 0),
  notes      TEXT,
  month      INTEGER NOT NULL,
  year       INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transfers (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  from_wallet_id TEXT NOT NULL REFERENCES wallets(id),
  to_wallet_id   TEXT NOT NULL REFERENCES wallets(id),
  amount         DOUBLE PRECISION NOT NULL CHECK (amount > 0),
  date           TEXT NOT NULL,
  month          INTEGER NOT NULL,
  year           INTEGER NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_initial     INTEGER NOT NULL DEFAULT 0
);

-- ── Investments ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS investment_categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investment_goals (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  target_amount DOUBLE PRECISION,
  target_date   TEXT,
  color         TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investments (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES investment_categories(id),
  name        TEXT NOT NULL,
  wallet_id   TEXT REFERENCES wallets(id) ON DELETE SET NULL,
  unit        TEXT,
  notes       TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_liquid   INTEGER NOT NULL DEFAULT 0,
  goal_id     TEXT REFERENCES investment_goals(id) ON DELETE SET NULL,
  is_closed   INTEGER NOT NULL DEFAULT 0,
  closed_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS investment_transactions (
  id             TEXT PRIMARY KEY,
  investment_id  TEXT NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  goal_id        TEXT REFERENCES investment_goals(id) ON DELETE SET NULL,
  type           TEXT NOT NULL CHECK (type IN ('BUY', 'SELL', 'DIVIDEND')),
  quantity       TEXT NOT NULL DEFAULT '1',
  price_per_unit DOUBLE PRECISION NOT NULL CHECK (price_per_unit > 0),
  total_amount   DOUBLE PRECISION NOT NULL,
  from_wallet_id TEXT REFERENCES wallets(id) ON DELETE SET NULL,
  to_wallet_id   TEXT REFERENCES wallets(id) ON DELETE SET NULL,
  date           TEXT NOT NULL,
  year           INTEGER NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_initial     INTEGER NOT NULL DEFAULT 0
);

-- ── Loans ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS loans (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type               TEXT NOT NULL CHECK (type IN ('PIUTANG', 'HUTANG')),
  name               TEXT NOT NULL,
  description        TEXT,
  principal_amount   DOUBLE PRECISION NOT NULL CHECK (principal_amount > 0),
  interest_rate      DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),
  interest_type      TEXT NOT NULL DEFAULT 'FLAT' CHECK (interest_type IN ('FLAT', 'REDUCING')),
  start_date         TEXT NOT NULL,
  due_date           TEXT,
  wallet_id          TEXT NOT NULL REFERENCES wallets(id),
  status             TEXT NOT NULL DEFAULT 'ONGOING' CHECK (status IN ('ONGOING', 'LUNAS', 'TERLAMBAT')),
  is_active          INTEGER NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_initial         INTEGER NOT NULL DEFAULT 0,
  payment_likelihood TEXT CHECK (payment_likelihood IN ('LANCAR', 'MERAGUKAN', 'MACET'))
);

CREATE TABLE IF NOT EXISTS loan_payments (
  id             TEXT PRIMARY KEY,
  loan_id        TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  principal_paid DOUBLE PRECISION NOT NULL CHECK (principal_paid > 0),
  interest_paid  DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (interest_paid >= 0),
  total_paid     DOUBLE PRECISION NOT NULL,
  date           TEXT NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_initial     INTEGER NOT NULL DEFAULT 0
);

-- ── Fundamental analysis ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fundamental_analyses (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  sector      TEXT NOT NULL,
  stock_code  TEXT NOT NULL,
  period      TEXT NOT NULL,
  input_data  TEXT NOT NULL,
  result_data TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_incomes_user_year       ON incomes (user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_expenses_user_year      ON expenses (user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_transfers_user_year     ON transfers (user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_income_categories_user  ON income_categories (user_id, year);
CREATE INDEX IF NOT EXISTS idx_expense_categories_user ON expense_categories (user_id, year);
CREATE INDEX IF NOT EXISTS idx_expense_types_user      ON expense_types (user_id, year);
CREATE INDEX IF NOT EXISTS idx_wallets_user            ON wallets (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_investments_user        ON investments (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_investment_tx_inv        ON investment_transactions (investment_id);
CREATE INDEX IF NOT EXISTS idx_loan_payments_loan       ON loan_payments (loan_id);
CREATE INDEX IF NOT EXISTS idx_loans_user              ON loans (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires   ON user_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_fundamental_user        ON fundamental_analyses (user_id, created_at DESC);
