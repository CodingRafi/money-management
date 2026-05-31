ALTER TABLE incomes                 ADD COLUMN is_initial BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE expenses                ADD COLUMN is_initial BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE transfers               ADD COLUMN is_initial BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE investment_transactions ADD COLUMN is_initial BOOLEAN NOT NULL DEFAULT false;
