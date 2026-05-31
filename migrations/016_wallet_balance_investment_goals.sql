-- Wallet balance + Investment Goals
-- Run AFTER 015_transfers.sql

-- ── 1. Add balance to wallets ────────────────────────────────────────────────
ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS balance DECIMAL(20,2) NOT NULL DEFAULT 0;

-- Recalculate existing balances from all historical transactions (idempotent)
UPDATE wallets w SET balance = (
  COALESCE((SELECT SUM(i.amount)     FROM incomes i     WHERE i.wallet_id       = w.id), 0)
  - COALESCE((SELECT SUM(e.amount)   FROM expenses e    WHERE e.wallet_id       = w.id), 0)
  + COALESCE((SELECT SUM(t.amount)   FROM transfers t   WHERE t.to_wallet_id    = w.id), 0)
  - COALESCE((SELECT SUM(t.amount)   FROM transfers t   WHERE t.from_wallet_id  = w.id), 0)
  - COALESCE((SELECT SUM(it.total_amount) FROM investment_transactions it WHERE it.from_wallet_id = w.id AND it.type = 'BUY'),  0)
  + COALESCE((SELECT SUM(it.total_amount) FROM investment_transactions it WHERE it.to_wallet_id   = w.id AND it.type = 'SELL'), 0)
);

-- ── 2. Investment Goals (Kantong) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS investment_goals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  target_amount DECIMAL(20,2),
  target_date   DATE,
  color         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Link transactions to goals ────────────────────────────────────────────
ALTER TABLE investment_transactions
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES investment_goals(id) ON DELETE SET NULL;
