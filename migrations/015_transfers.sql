-- Transfer antar dompet liquid
-- Run AFTER 008_wallets.sql

CREATE TABLE IF NOT EXISTS transfers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  from_wallet_id UUID NOT NULL REFERENCES wallets(id),
  to_wallet_id   UUID NOT NULL REFERENCES wallets(id),
  amount         DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  date           DATE NOT NULL,
  month          INT NOT NULL,
  year           INT NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
