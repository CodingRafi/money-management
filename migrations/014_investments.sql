-- Investment module
-- Run AFTER 010_transactions.sql

CREATE TABLE IF NOT EXISTS investment_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS investments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES investment_categories(id),
  name        TEXT NOT NULL,
  wallet_id   UUID REFERENCES wallets(id) ON DELETE SET NULL,
  unit        TEXT,
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS investment_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id  UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  quantity       DECIMAL(20,8) NOT NULL CHECK (quantity > 0),
  price_per_unit DECIMAL(20,2) NOT NULL CHECK (price_per_unit > 0),
  total_amount   DECIMAL(20,2) NOT NULL,
  from_wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
  to_wallet_id   UUID REFERENCES wallets(id) ON DELETE SET NULL,
  date           DATE NOT NULL,
  year           INT NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default investment categories (idempotent)
INSERT INTO investment_categories (name, is_default, sort_order)
SELECT v.name, true, v.n
FROM (VALUES
  ('SAHAM',      1),
  ('REKSA DANA', 2),
  ('EMAS',       3),
  ('KRIPTO',     4),
  ('DEPOSITO',   5),
  ('LAINNYA',    6)
) AS v(name, n)
WHERE NOT EXISTS (SELECT 1 FROM investment_categories WHERE is_default = true);
