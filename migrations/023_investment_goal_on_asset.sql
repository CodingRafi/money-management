-- Add default kantong to investments
ALTER TABLE investments
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES investment_goals(id) ON DELETE SET NULL;
