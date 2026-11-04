-- Add patronymic_depth to trees table in master registry.
-- Defaults to 3 names (Given Name + Father + Grandfather).
ALTER TABLE trees ADD COLUMN patronymic_depth INTEGER NOT NULL DEFAULT 3;
