ALTER TABLE wallets
  DROP COLUMN IF EXISTS balance,
  DROP COLUMN IF EXISTS initial_balance,
  DROP COLUMN IF EXISTS currency;
