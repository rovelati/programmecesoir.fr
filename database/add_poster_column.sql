-- Add poster_url column to programs table
ALTER TABLE programs ADD COLUMN IF NOT EXISTS poster_url TEXT;
