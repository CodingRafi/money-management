-- Add price column to licences
-- NULL = gratis / belum diset

ALTER TABLE licences ADD COLUMN IF NOT EXISTS price NUMERIC(12,2);
