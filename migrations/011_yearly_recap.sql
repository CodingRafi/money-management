-- Yearly financial recap per user
-- Kept in sync automatically via triggers on incomes and expenses

CREATE TABLE IF NOT EXISTS yearly_recap (
  user_id       TEXT            NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  year          INT             NOT NULL,
  total_income  DECIMAL(15,2)  NOT NULL DEFAULT 0,
  total_expense DECIMAL(15,2)  NOT NULL DEFAULT 0,
  balance       DECIMAL(15,2)  NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ     DEFAULT NOW(),
  PRIMARY KEY (user_id, year)
);

-- Helper: recompute and upsert a single user+year row
CREATE OR REPLACE FUNCTION fn_refresh_yearly_recap(p_user_id TEXT, p_year INT)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_income  DECIMAL(15,2);
  v_expense DECIMAL(15,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_income  FROM incomes  WHERE user_id = p_user_id AND year = p_year;
  SELECT COALESCE(SUM(amount), 0) INTO v_expense FROM expenses WHERE user_id = p_user_id AND year = p_year;

  IF v_income = 0 AND v_expense = 0 THEN
    DELETE FROM yearly_recap WHERE user_id = p_user_id AND year = p_year;
  ELSE
    INSERT INTO yearly_recap (user_id, year, total_income, total_expense, balance)
    VALUES (p_user_id, p_year, v_income, v_expense, v_income - v_expense)
    ON CONFLICT (user_id, year) DO UPDATE SET
      total_income  = EXCLUDED.total_income,
      total_expense = EXCLUDED.total_expense,
      balance       = EXCLUDED.balance,
      updated_at    = NOW();
  END IF;
END;
$$;

-- Trigger function for incomes
CREATE OR REPLACE FUNCTION fn_trg_incomes_recap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM fn_refresh_yearly_recap(OLD.user_id, OLD.year);
    RETURN OLD;
  END IF;
  PERFORM fn_refresh_yearly_recap(NEW.user_id, NEW.year);
  IF TG_OP = 'UPDATE' AND OLD.year <> NEW.year THEN
    PERFORM fn_refresh_yearly_recap(OLD.user_id, OLD.year);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incomes_recap ON incomes;
CREATE TRIGGER trg_incomes_recap
AFTER INSERT OR UPDATE OR DELETE ON incomes
FOR EACH ROW EXECUTE FUNCTION fn_trg_incomes_recap();

-- Trigger function for expenses
CREATE OR REPLACE FUNCTION fn_trg_expenses_recap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM fn_refresh_yearly_recap(OLD.user_id, OLD.year);
    RETURN OLD;
  END IF;
  PERFORM fn_refresh_yearly_recap(NEW.user_id, NEW.year);
  IF TG_OP = 'UPDATE' AND OLD.year <> NEW.year THEN
    PERFORM fn_refresh_yearly_recap(OLD.user_id, OLD.year);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_recap ON expenses;
CREATE TRIGGER trg_expenses_recap
AFTER INSERT OR UPDATE OR DELETE ON expenses
FOR EACH ROW EXECUTE FUNCTION fn_trg_expenses_recap();

-- Backfill existing data
INSERT INTO yearly_recap (user_id, year, total_income, total_expense, balance)
SELECT
  COALESCE(i.user_id, e.user_id)   AS user_id,
  COALESCE(i.year,    e.year)       AS year,
  COALESCE(i.total, 0)              AS total_income,
  COALESCE(e.total, 0)              AS total_expense,
  COALESCE(i.total, 0) - COALESCE(e.total, 0) AS balance
FROM
  (SELECT user_id, year, SUM(amount) AS total FROM incomes  GROUP BY user_id, year) i
  FULL OUTER JOIN
  (SELECT user_id, year, SUM(amount) AS total FROM expenses GROUP BY user_id, year) e
  ON i.user_id = e.user_id AND i.year = e.year
ON CONFLICT (user_id, year) DO UPDATE SET
  total_income  = EXCLUDED.total_income,
  total_expense = EXCLUDED.total_expense,
  balance       = EXCLUDED.balance,
  updated_at    = NOW();
