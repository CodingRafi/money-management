-- Licence system tables
-- Run AFTER 001_better_auth.sql and 002_roles_permissions.sql

DO $$ BEGIN
  CREATE TYPE licence_status AS ENUM ('ACTIVE', 'GRACE', 'EXPIRED', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- max_devices NULL = unlimited; expired_at NULL = no expiry
CREATE TABLE IF NOT EXISTS licences (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code         TEXT UNIQUE NOT NULL,
  user_id      TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  status       licence_status NOT NULL DEFAULT 'ACTIVE',
  max_devices  INT,
  grace_period INT NOT NULL DEFAULT 3,
  expired_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  licence_id  TEXT NOT NULL REFERENCES licences(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  os          TEXT,
  browser     TEXT,
  last_ip     TEXT,
  last_seen   TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (licence_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS licence_history (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  licence_id  TEXT NOT NULL REFERENCES licences(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_licences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_licences_updated_at ON licences;
CREATE TRIGGER trg_licences_updated_at
  BEFORE UPDATE ON licences
  FOR EACH ROW EXECUTE FUNCTION update_licences_updated_at();
