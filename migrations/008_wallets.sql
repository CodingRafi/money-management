-- Wallet categories (master data, global)
CREATE TABLE IF NOT EXISTS wallet_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  is_liquid  BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Wallets per user
CREATE TABLE IF NOT EXISTS wallets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES wallet_categories(id),
  name        TEXT NOT NULL,
  is_liquid   BOOLEAN NOT NULL DEFAULT true,
  color       TEXT,
  icon        TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default wallet categories (idempotent)
INSERT INTO wallet_categories (name, is_liquid, is_default, sort_order)
SELECT v.name, v.is_liquid, true, v.n
FROM (VALUES
  ('TUNAI',      true,  1),
  ('BANK',       true,  2),
  ('E-WALLET',   true,  3),
  ('INVESTASI',  false, 4),
  ('ASET FISIK', false, 5),
  ('KRIPTO',     false, 6)
) AS v(name, is_liquid, n)
WHERE NOT EXISTS (SELECT 1 FROM wallet_categories WHERE is_default = true);
