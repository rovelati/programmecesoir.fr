-- Create index on genre column for faster category filtering
CREATE INDEX IF NOT EXISTS idx_programs_genre ON programs(genre);
