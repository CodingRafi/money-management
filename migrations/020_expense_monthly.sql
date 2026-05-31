-- Add expense_monthly JSONB cache column to yearly_recap
ALTER TABLE yearly_recap
  ADD COLUMN IF NOT EXISTS expense_monthly JSONB NOT NULL DEFAULT '{}';

-- Update fn_refresh_yearly_recap to also maintain expense_monthly
CREATE OR REPLACE FUNCTION fn_refresh_yearly_recap(p_user_id TEXT, p_year INT)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_income           DECIMAL(15,2);
  v_expense          DECIMAL(15,2);
  v_income_monthly   JSONB;
  v_expense_monthly  JSONB;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_income  FROM incomes  WHERE user_id = p_user_id AND year = p_year;
  SELECT COALESCE(SUM(amount), 0) INTO v_expense FROM expenses WHERE user_id = p_user_id AND year = p_year;

  SELECT COALESCE(jsonb_object_agg(month::text, total), '{}')
  INTO v_income_monthly
  FROM (
    SELECT month, SUM(amount)::numeric AS total
    FROM incomes WHERE user_id = p_user_id AND year = p_year
    GROUP BY month
  ) m;

  SELECT COALESCE(jsonb_object_agg(month::text, total), '{}')
  INTO v_expense_monthly
  FROM (
    SELECT month, SUM(amount)::numeric AS total
    FROM expenses WHERE user_id = p_user_id AND year = p_year
    GROUP BY month
  ) m;

  IF v_income = 0 AND v_expense = 0 THEN
    DELETE FROM yearly_recap WHERE user_id = p_user_id AND year = p_year;
  ELSE
    INSERT INTO yearly_recap (user_id, year, total_income, total_expense, balance, income_monthly, expense_monthly)
    VALUES (p_user_id, p_year, v_income, v_expense, v_income - v_expense,
            COALESCE(v_income_monthly, '{}'), COALESCE(v_expense_monthly, '{}'))
    ON CONFLICT (user_id, year) DO UPDATE SET
      total_income    = EXCLUDED.total_income,
      total_expense   = EXCLUDED.total_expense,
      balance         = EXCLUDED.balance,
      income_monthly  = EXCLUDED.income_monthly,
      expense_monthly = EXCLUDED.expense_monthly,
      updated_at      = NOW();
  END IF;
END;
$$;

-- Backfill expense_monthly for all existing rows
UPDATE yearly_recap yr SET
  expense_monthly = COALESCE((
    SELECT jsonb_object_agg(month::text, total)
    FROM (
      SELECT month, SUM(amount)::numeric AS total
      FROM expenses WHERE user_id = yr.user_id AND year = yr.year
      GROUP BY month
    ) m
  ), '{}');
