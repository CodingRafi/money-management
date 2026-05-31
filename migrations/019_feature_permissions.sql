-- Seed permissions untuk semua fitur
-- Run AFTER 002_roles_permissions.sql

-- ── 1. Tambah permissions yang belum ada ─────────────────────────────────────

INSERT INTO permissions (codename, name) VALUES
  -- Dompet (user feature)
  ('view_wallets',       'Lihat dompet'),
  ('add_wallet',         'Tambah dompet'),
  ('change_wallet',      'Edit dompet'),
  ('delete_wallet',      'Hapus dompet'),
  -- Investasi / Kantong (user feature)
  ('view_investments',   'Lihat investasi'),
  ('add_investment',     'Tambah investasi'),
  ('change_investment',  'Edit investasi'),
  ('delete_investment',  'Hapus investasi'),
  -- Kategori user (user feature)
  ('view_categories',    'Lihat kategori'),
  ('add_category',       'Tambah kategori'),
  ('change_category',    'Edit kategori'),
  ('delete_category',    'Hapus kategori'),
  -- Lisensi (admin feature)
  ('view_licences',      'Lihat lisensi'),
  ('add_licence',        'Buat lisensi'),
  ('change_licence',     'Edit lisensi'),
  ('delete_licence',     'Hapus lisensi'),
  -- Master data (admin feature)
  ('view_master_data',   'Lihat data master'),
  ('add_master_data',    'Tambah data master'),
  ('change_master_data', 'Edit data master'),
  ('delete_master_data', 'Hapus data master')
ON CONFLICT (codename) DO NOTHING;

-- ── 2. Assign permissions ke role "user" ─────────────────────────────────────
-- User dapat semua permission fitur personal finance + permissions transaksi yang belum diassign

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'user'
  AND p.codename IN (
    -- Dompet
    'view_wallets', 'add_wallet', 'change_wallet', 'delete_wallet',
    -- Transaksi (sudah ada di 002 kecuali delete)
    'view_transactions', 'add_transaction', 'change_transaction', 'delete_transaction',
    -- Kategori
    'view_categories', 'add_category', 'change_category', 'delete_category',
    'manage_categories',
    -- Investasi
    'view_investments', 'add_investment', 'change_investment', 'delete_investment',
    -- Report & Dashboard
    'view_reports', 'view_dashboard'
  )
ON CONFLICT DO NOTHING;

-- ── 3. Assign SEMUA permissions ke role "admin" ───────────────────────────────

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;
