
-- Add slug column to programs_fr table
ALTER TABLE programs_fr 
ADD COLUMN IF NOT EXISTS slug text;

-- Create index on slug for fast lookups
CREATE INDEX IF NOT EXISTS idx_programs_fr_slug ON programs_fr(slug);

-- Create index on channel_id for fast filtering (good practice)
CREATE INDEX IF NOT EXISTS idx_programs_fr_channel_id ON programs_fr(channel_id);

-- Optional: Create composite index for specific query patterns
CREATE INDEX IF NOT EXISTS idx_programs_fr_channel_slug ON programs_fr(channel_id, slug);
