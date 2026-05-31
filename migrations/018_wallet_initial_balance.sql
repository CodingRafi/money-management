-- Tambah initial_balance ke wallets
-- Merepresentasikan saldo sebelum user mulai pakai aplikasi ini.
-- balance = initial_balance + (semua transaksi yang dicatat di app)

ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS initial_balance DECIMAL(20,2) NOT NULL DEFAULT 0;

-- Recalculate balance dengan menyertakan initial_balance (saat ini 0, jadi tidak berubah)
UPDATE wallets SET balance = initial_balance + (
  COALESCE((SELECT SUM(i.amount)     FROM incomes i     WHERE i.wallet_id      = wallets.id), 0)
  - COALESCE((SELECT SUM(e.amount)   FROM expenses e    WHERE e.wallet_id      = wallets.id), 0)
  + COALESCE((SELECT SUM(t.amount)   FROM transfers t   WHERE t.to_wallet_id   = wallets.id), 0)
  - COALESCE((SELECT SUM(t.amount)   FROM transfers t   WHERE t.from_wallet_id = wallets.id), 0)
  - COALESCE((SELECT SUM(it.total_amount) FROM investment_transactions it WHERE it.from_wallet_id = wallets.id AND it.type = 'BUY'),  0)
  + COALESCE((SELECT SUM(it.total_amount) FROM investment_transactions it WHERE it.to_wallet_id   = wallets.id AND it.type = 'SELL'), 0)
);
