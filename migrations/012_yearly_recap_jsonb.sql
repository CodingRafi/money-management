-- Add JSONB cache columns to yearly_recap for fast report reads
ALTER TABLE yearly_recap
  ADD COLUMN IF NOT EXISTS income_monthly    JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS expense_breakdown JSONB NOT NULL DEFAULT '[]';

-- Update fn_refresh_yearly_recap to also maintain income_monthly
CREATE OR REPLACE FUNCTION fn_refresh_yearly_recap(p_user_id TEXT, p_year INT)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_income         DECIMAL(15,2);
  v_expense        DECIMAL(15,2);
  v_income_monthly JSONB;
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

  IF v_income = 0 AND v_expense = 0 THEN
    DELETE FROM yearly_recap WHERE user_id = p_user_id AND year = p_year;
  ELSE
    INSERT INTO yearly_recap (user_id, year, total_income, total_expense, balance, income_monthly)
    VALUES (p_user_id, p_year, v_income, v_expense, v_income - v_expense, COALESCE(v_income_monthly, '{}'))
    ON CONFLICT (user_id, year) DO UPDATE SET
      total_income   = EXCLUDED.total_income,
      total_expense  = EXCLUDED.total_expense,
      balance        = EXCLUDED.balance,
      income_monthly = EXCLUDED.income_monthly,
      updated_at     = NOW();
  END IF;
END;
$$;

-- Computes and stores expense_breakdown JSONB for a user+year
CREATE OR REPLACE FUNCTION fn_refresh_expense_breakdown(p_user_id TEXT, p_year INT)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_data JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'cat_id',     ec.id::text,
      'cat_name',   ec.name,
      'type_name',  et.name,
      'type_sort',  et.sort_order,
      'cat_sort',   ec.sort_order,
      'percentage', ec.default_percentage::float,
      'months',     COALESCE(spend.monthly_totals, '{}')
    )
    ORDER BY et.sort_order, ec.sort_order
  ), '[]')
  INTO v_data
  FROM expense_categories ec
  JOIN expense_types et ON et.id = ec.type_id
  LEFT JOIN LATERAL (
    SELECT jsonb_object_agg(e.month::text, e.month_total) AS monthly_totals
    FROM (
      SELECT month, SUM(amount)::numeric AS month_total
      FROM expenses
      WHERE user_id = p_user_id AND year = p_year AND category_id = ec.id
      GROUP BY month
    ) e
  ) spend ON true
  WHERE ec.user_id = p_user_id AND ec.is_hidden = false;

  UPDATE yearly_recap
  SET expense_breakdown = COALESCE(v_data, '[]')
  WHERE user_id = p_user_id AND year = p_year;
END;
$$;

-- Expense trigger now also refreshes expense_breakdown
CREATE OR REPLACE FUNCTION fn_trg_expenses_recap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM fn_refresh_yearly_recap(OLD.user_id, OLD.year);
    PERFORM fn_refresh_expense_breakdown(OLD.user_id, OLD.year);
    RETURN OLD;
  END IF;
  PERFORM fn_refresh_yearly_recap(NEW.user_id, NEW.year);
  PERFORM fn_refresh_expense_breakdown(NEW.user_id, NEW.year);
  IF TG_OP = 'UPDATE' AND OLD.year <> NEW.year THEN
    PERFORM fn_refresh_yearly_recap(OLD.user_id, OLD.year);
    PERFORM fn_refresh_expense_breakdown(OLD.user_id, OLD.year);
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill income_monthly for all existing rows
UPDATE yearly_recap yr SET
  income_monthly = COALESCE((
    SELECT jsonb_object_agg(month::text, total)
    FROM (
      SELECT month, SUM(amount)::numeric AS total
      FROM incomes WHERE user_id = yr.user_id AND year = yr.year
      GROUP BY month
    ) m
  ), '{}');

-- Backfill expense_breakdown for all existing rows
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT user_id, year FROM yearly_recap LOOP
    PERFORM fn_refresh_expense_breakdown(r.user_id, r.year);
  END LOOP;
END;
$$;
