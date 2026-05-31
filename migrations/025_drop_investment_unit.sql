-- Remove unit column from investments (unit is no longer tracked at asset level)
ALTER TABLE investments DROP COLUMN IF EXISTS unit;
