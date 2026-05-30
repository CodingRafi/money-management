-- Make categories, expense types, and type allocations year-specific
-- Each year has its own snapshot; changing 2027 config doesn't touch 2026 data.
-- Run AFTER 012_yearly_recap_jsonb.sql

-- ── Add year column (nullable so master/default rows stay year-agnostic) ──────
ALTER TABLE income_categories  ADD COLUMN IF NOT EXISTS year INT;
ALTER TABLE expense_types      ADD COLUMN IF NOT EXISTS year INT;
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS year INT;
ALTER TABLE type_allocations   ADD COLUMN IF NOT EXISTS year INT;

-- ── Assign year from created_at for existing user-owned records ────────────────
UPDATE income_categories
SET year = EXTRACT(YEAR FROM created_at)::int
WHERE user_id IS NOT NULL AND year IS NULL;

UPDATE expense_types
SET year = EXTRACT(YEAR FROM created_at)::int
WHERE user_id IS NOT NULL AND year IS NULL;

UPDATE expense_categories
SET year = EXTRACT(YEAR FROM created_at)::int
WHERE user_id IS NOT NULL AND year IS NULL;

UPDATE type_allocations
SET year = EXTRACT(YEAR FROM created_at)::int
WHERE year IS NULL;

-- ── type_allocations: replace global unique with year-scoped unique ────────────
ALTER TABLE type_allocations
  DROP CONSTRAINT IF EXISTS type_allocations_user_id_type_id_key;

ALTER TABLE type_allocations
  ADD CONSTRAINT type_allocations_user_id_type_id_year_key
  UNIQUE(user_id, type_id, year);

-- ── Update fn_refresh_expense_breakdown to be year-aware ──────────────────────
-- Includes categories for the target year, plus any categories directly
-- referenced by expenses in that year (handles pre-migration data).
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
  WHERE ec.user_id = p_user_id
    AND ec.is_hidden = false
    AND (
      ec.year = p_year
      OR ec.id IN (
        SELECT DISTINCT category_id
        FROM expenses
        WHERE user_id = p_user_id
          AND year = p_year
          AND category_id IS NOT NULL
      )
    );

  UPDATE yearly_recap
  SET expense_breakdown = COALESCE(v_data, '[]')
  WHERE user_id = p_user_id AND year = p_year;
END;
$$;

-- ── Backfill expense_breakdown with the updated function ──────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT user_id, year FROM yearly_recap LOOP
    PERFORM fn_refresh_expense_breakdown(r.user_id, r.year);
  END LOOP;
END;
$$;
