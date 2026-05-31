-- Add is_liquid flag to investments (default: not liquid)
ALTER TABLE investments
  ADD COLUMN IF NOT EXISTS is_liquid BOOLEAN NOT NULL DEFAULT false;
