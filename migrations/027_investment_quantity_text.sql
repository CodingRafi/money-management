-- Change quantity to TEXT to allow free-form values like "10 lot", "5 gram", etc.
-- Must drop CHECK constraint before altering type
ALTER TABLE investment_transactions
  DROP CONSTRAINT IF EXISTS investment_transactions_quantity_check;

ALTER TABLE investment_transactions
  ALTER COLUMN quantity TYPE TEXT USING quantity::text;
