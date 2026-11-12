-- Backfill: SELL tanpa kantong -> kantong dari BUY aset tsb (hanya jika aset hanya punya 1 kantong).
UPDATE investment_transactions s
SET goal_id = b.goal_id
FROM (
  SELECT investment_id, MIN(goal_id) AS goal_id
  FROM investment_transactions
  WHERE type = 'BUY' AND goal_id IS NOT NULL
  GROUP BY investment_id
  HAVING COUNT(DISTINCT goal_id) = 1
) b
WHERE s.investment_id = b.investment_id
  AND s.type = 'SELL'
  AND s.goal_id IS NULL;
