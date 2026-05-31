-- Track whether a loan was created as initial data (no wallet balance effect)
ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS is_initial BOOLEAN NOT NULL DEFAULT false;
