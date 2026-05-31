-- Modul Pinjaman: Piutang & Hutang dengan cicilan dan bunga
-- Run AFTER 023_investment_goal_on_asset.sql

CREATE TABLE IF NOT EXISTS loans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('PIUTANG', 'HUTANG')),
  name             TEXT NOT NULL,
  description      TEXT,
  principal_amount DECIMAL(20,2) NOT NULL CHECK (principal_amount > 0),
  interest_rate    DECIMAL(10,4) NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),
  interest_type    TEXT NOT NULL DEFAULT 'FLAT' CHECK (interest_type IN ('FLAT', 'REDUCING')),
  start_date       DATE NOT NULL,
  due_date         DATE,
  wallet_id        UUID NOT NULL REFERENCES wallets(id),
  status           TEXT NOT NULL DEFAULT 'ONGOING' CHECK (status IN ('ONGOING', 'LUNAS', 'TERLAMBAT')),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id         UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  principal_paid  DECIMAL(20,2) NOT NULL CHECK (principal_paid > 0),
  interest_paid   DECIMAL(20,2) NOT NULL DEFAULT 0 CHECK (interest_paid >= 0),
  total_paid      DECIMAL(20,2) NOT NULL,
  date            DATE NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
