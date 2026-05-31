-- Add PASAR UANG and OBLIGASI / SBN investment categories
INSERT INTO investment_categories (name, is_default, sort_order)
SELECT v.name, true, v.n
FROM (VALUES
  ('PASAR UANG',     6),
  ('OBLIGASI / SBN', 7)
) AS v(name, n)
WHERE NOT EXISTS (SELECT 1 FROM investment_categories WHERE name = v.name);

-- Push LAINNYA to the end
UPDATE investment_categories SET sort_order = 8 WHERE name = 'LAINNYA' AND is_default = true;
