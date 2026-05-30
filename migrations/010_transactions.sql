-- Core financial transaction tables
-- Run AFTER 008_wallets.sql

CREATE TABLE IF NOT EXISTS incomes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  name        TEXT NOT NULL,
  category_id UUID REFERENCES income_categories(id) ON DELETE SET NULL,
  wallet_id   UUID REFERENCES wallets(id) ON DELETE SET NULL,
  amount      DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  month       INT NOT NULL,
  year        INT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  name        TEXT NOT NULL,
  wallet_id   UUID REFERENCES wallets(id) ON DELETE SET NULL,
  category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  needs_type  TEXT NOT NULL DEFAULT 'PRIMER' CHECK (needs_type IN ('PRIMER', 'SEKUNDER', 'TERSIER')),
  amount      DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  month       INT NOT NULL,
  year        INT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Dipinjam: uang yang kamu pinjamkan ke orang lain
CREATE TABLE IF NOT EXISTS loans_given (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  borrower  TEXT NOT NULL,
  amount    DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  status    TEXT NOT NULL DEFAULT 'FIX' CHECK (status IN ('FIX', 'GANTUNG')),
  notes     TEXT,
  month     INT NOT NULL,
  year      INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hutang: kamu yang meminjam dari orang lain
CREATE TABLE IF NOT EXISTS loans_taken (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  lender    TEXT NOT NULL,
  amount    DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  notes     TEXT,
  month     INT NOT NULL,
  year      INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
