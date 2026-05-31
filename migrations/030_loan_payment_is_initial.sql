-- Track whether a loan payment was entered as initial data (no wallet balance effect)
ALTER TABLE loan_payments
  ADD COLUMN IF NOT EXISTS is_initial BOOLEAN NOT NULL DEFAULT false;
