-- Custom RBAC tables
-- Run this AFTER 001_better_auth.sql

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codename TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- Default permissions
INSERT INTO permissions (codename, name) VALUES
  ('manage_roles',       'Can manage roles'),
  ('manage_permissions', 'Can manage permissions'),
  ('manage_users',       'Can manage user roles'),
  ('view_dashboard',     'Can view dashboard'),
  ('view_transactions',  'Can view transactions'),
  ('add_transaction',    'Can add transactions'),
  ('change_transaction', 'Can edit transactions'),
  ('delete_transaction', 'Can delete transactions'),
  ('view_reports',       'Can view reports'),
  ('manage_categories',  'Can manage categories')
ON CONFLICT (codename) DO NOTHING;

-- Default roles
INSERT INTO roles (name, description) VALUES
  ('admin', 'Administrator with full access'),
  ('user',  'Regular user with basic access')
ON CONFLICT (name) DO NOTHING;

-- admin → all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- user → basic permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.codename IN (
    'view_dashboard', 'view_transactions',
    'add_transaction', 'change_transaction', 'view_reports'
  )
WHERE r.name = 'user'
ON CONFLICT DO NOTHING;
