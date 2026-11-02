-- Saldo awal dompet. Saldo dompet = initial_balance + pemasukan - pengeluaran ± transfer.
-- Kolom lama (initial_balance) dihapus di 004; ini mengembalikannya sebagai input manual.

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS initial_balance DOUBLE PRECISION NOT NULL DEFAULT 0;

COMMENT ON COLUMN wallets.initial_balance IS 'Saldo awal dompet (input manual pengguna)';
