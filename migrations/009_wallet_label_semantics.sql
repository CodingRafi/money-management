-- Semantik dompet berubah: dompet = label sumber kas, bukan rekening penyimpan saldo.
--
-- 1. Tidak ada lagi komponen "transfer" di perhitungan saldo. Memindahkan uang antar
--    dompet hanya menggeser posisi sehingga TIDAK memengaruhi total kas. Karena itu
--    dompet bisa diperlakukan sebagai label sumber arus kas tanpa fitur transfer.
-- 2. Total kas dihitung otomatis di lib/dashboard.ts (getCashPosition):
--      Σ initial_balance + pemasukan − pengeluaran − BUY investasi + SELL/DIVIDEND ± pinjaman.
-- 3. Tabel `transfers` tidak dihapus karena masih dipakai household-backup.ts,
--    tapi tidak lagi dibaca oleh query mana pun.

COMMENT ON COLUMN wallets.initial_balance IS 'Modal/saldo awal dompet (input manual). Total kas dihitung otomatis dari seluruh transaksi; pemindahan dana antar dompet tidak perlu dicatat.';

COMMENT ON TABLE transfers IS 'Deprecated: tidak dipakai lagi. Pemindahan dana antar dompet tidak memengaruhi total kas sehingga tidak perlu dicatat.';
