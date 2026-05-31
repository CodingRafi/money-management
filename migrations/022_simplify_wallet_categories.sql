-- Remove wallets in non-liquid categories (they move to investasi feature)
DELETE FROM wallets
WHERE category_id IN (
  SELECT id FROM wallet_categories WHERE name IN ('INVESTASI', 'ASET FISIK', 'KRIPTO')
);

-- Remove non-liquid wallet categories (now handled by investasi feature)
DELETE FROM wallet_categories WHERE name IN ('INVESTASI', 'ASET FISIK', 'KRIPTO');
