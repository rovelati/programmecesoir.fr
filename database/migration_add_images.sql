-- Adapted for programmecesoir.fr real schema.
-- The live table already exposes poster_url and the frontend/social jobs read it.
-- So we keep poster_url as the public image URL field and add tracking metadata.

ALTER TABLE programs_fr
  ADD COLUMN IF NOT EXISTS image_source VARCHAR(20),
  ADD COLUMN IF NOT EXISTS image_fetched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tmdb_id INT,
  ADD COLUMN IF NOT EXISTS tvmaze_id INT,
  ADD COLUMN IF NOT EXISTS production_year INT;

CREATE INDEX IF NOT EXISTS idx_programs_fr_image_fetched_at ON programs_fr(image_fetched_at);
CREATE INDEX IF NOT EXISTS idx_programs_fr_tmdb_id ON programs_fr(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_programs_fr_tvmaze_id ON programs_fr(tvmaze_id);
