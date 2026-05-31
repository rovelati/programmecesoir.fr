-- Unified Supabase setup for programmecesoir.fr, 123programmitv.it and fernsehheute.de
-- Target project: xkrchvzeagoukkgpsnct

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- Shared status table
-- ============================================

CREATE TABLE IF NOT EXISTS import_status (
  id TEXT PRIMARY KEY,
  status TEXT,
  last_run_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  channels_processed INTEGER,
  programs_inserted INTEGER,
  programs_deleted INTEGER,
  error_message TEXT,
  source_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_status_updated ON import_status(updated_at);

-- ============================================
-- Editorial content
-- ============================================

CREATE TABLE IF NOT EXISTS birthday_articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_date DATE NOT NULL,
  birth_date_mmdd CHAR(5) NOT NULL,
  birth_year INTEGER,
  age_today INTEGER,
  entity_type TEXT NOT NULL DEFAULT 'actor' CHECK (entity_type IN ('actor', 'film', 'serie')),
  entity_slug TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  article_title TEXT NOT NULL,
  article_slug TEXT NOT NULL UNIQUE,
  article_body_html TEXT NOT NULL,
  article_excerpt TEXT NOT NULL,
  image_url TEXT,
  image_alt TEXT,
  upcoming_airings JSONB,
  known_for JSONB,
  external_ids JSONB,
  meta_description TEXT,
  is_published BOOLEAN DEFAULT TRUE,
  generation_model TEXT DEFAULT 'deepseek-chat',
  CONSTRAINT uq_birthday_entity_year UNIQUE (entity_slug, published_date)
);

CREATE INDEX IF NOT EXISTS idx_birthday_published ON birthday_articles(published_date DESC);
CREATE INDEX IF NOT EXISTS idx_birthday_mmdd ON birthday_articles(birth_date_mmdd);
CREATE INDEX IF NOT EXISTS idx_birthday_slug ON birthday_articles(article_slug);

ALTER TABLE birthday_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON birthday_articles;
CREATE POLICY "public read" ON birthday_articles
  FOR SELECT
  USING (is_published = TRUE);

-- ============================================
-- 123programmitv.it
-- ============================================

CREATE TABLE IF NOT EXISTS channels (
  id SERIAL PRIMARY KEY,
  channel_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  logo_url TEXT,
  channel_number INTEGER,
  category TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id TEXT NOT NULL REFERENCES channels(channel_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  date DATE NOT NULL,
  time_slot TEXT NOT NULL CHECK (time_slot IN ('oggi', 'stasera', 'stanotte')),
  genre TEXT,
  rating TEXT,
  poster_url TEXT,
  replay_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_id ON channels(channel_id);
CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name);
CREATE INDEX IF NOT EXISTS idx_programs_date ON programs(date);
CREATE INDEX IF NOT EXISTS idx_programs_channel ON programs(channel_id);
CREATE INDEX IF NOT EXISTS idx_programs_channel_slug ON programs(channel_id, slug);
CREATE INDEX IF NOT EXISTS idx_programs_slug ON programs(slug);
CREATE INDEX IF NOT EXISTS idx_programs_timeslot ON programs(time_slot);
CREATE INDEX IF NOT EXISTS idx_programs_datetime ON programs(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_programs_channel_date ON programs(channel_id, date);
CREATE INDEX IF NOT EXISTS idx_programs_date_timeslot ON programs(date, time_slot);
CREATE INDEX IF NOT EXISTS idx_programs_genre ON programs(genre);

CREATE OR REPLACE FUNCTION slugify_program_title(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' from regexp_replace(
    regexp_replace(
      lower(unaccent(coalesce(input, ''))),
      '[^a-z0-9\\s-]', '', 'g'
    ),
    '\\s+', '-', 'g'
  ));
$$;

CREATE OR REPLACE FUNCTION set_program_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.slug := slugify_program_title(NEW.title);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS programs_set_slug ON programs;
CREATE TRIGGER programs_set_slug
BEFORE INSERT OR UPDATE OF title ON programs
FOR EACH ROW
EXECUTE FUNCTION set_program_slug();

-- ============================================
-- programmecesoir.fr
-- ============================================

CREATE TABLE IF NOT EXISTS channels_fr (
  id SERIAL PRIMARY KEY,
  channel_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  logo_url TEXT,
  channel_number INTEGER,
  category TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS programs_fr (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id TEXT NOT NULL REFERENCES channels_fr(channel_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  date DATE NOT NULL,
  time_slot TEXT NOT NULL CHECK (time_slot IN ('aujourdhui', 'ce-soir', 'nuit')),
  genre TEXT,
  rating TEXT,
  poster_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_fr_id ON channels_fr(channel_id);
CREATE INDEX IF NOT EXISTS idx_channels_fr_name ON channels_fr(name);
CREATE INDEX IF NOT EXISTS idx_programs_fr_date ON programs_fr(date);
CREATE INDEX IF NOT EXISTS idx_programs_fr_channel ON programs_fr(channel_id);
CREATE INDEX IF NOT EXISTS idx_programs_fr_channel_slug ON programs_fr(channel_id, slug);
CREATE INDEX IF NOT EXISTS idx_programs_fr_slug ON programs_fr(slug);
CREATE INDEX IF NOT EXISTS idx_programs_fr_timeslot ON programs_fr(time_slot);
CREATE INDEX IF NOT EXISTS idx_programs_fr_datetime ON programs_fr(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_programs_fr_channel_date ON programs_fr(channel_id, date);
CREATE INDEX IF NOT EXISTS idx_programs_fr_date_timeslot ON programs_fr(date, time_slot);
CREATE INDEX IF NOT EXISTS idx_programs_fr_genre ON programs_fr(genre);

-- ============================================
-- fernsehheute.de
-- ============================================

CREATE TABLE IF NOT EXISTS channels_de (
  id SERIAL PRIMARY KEY,
  channel_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  logo_url TEXT,
  channel_number INTEGER,
  category TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS programs_de (
  id SERIAL PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels_de(channel_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  date DATE NOT NULL,
  time_slot TEXT NOT NULL CHECK (time_slot IN ('heute', 'heute-abend', 'nacht')),
  genre TEXT,
  rating TEXT,
  poster_url TEXT,
  slug TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content_enrichment_de (
  id BIGSERIAL PRIMARY KEY,
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('program', 'channel')),
  entity_id TEXT NOT NULL,
  program_id INTEGER REFERENCES programs_de(id) ON DELETE CASCADE,
  channel_id TEXT REFERENCES channels_de(channel_id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  enrichment_type TEXT NOT NULL CHECK (
    enrichment_type IN ('program_metadata', 'image', 'channel_stream', 'channel_website', 'external_link')
  ),
  dedupe_key TEXT NOT NULL DEFAULT 'default',
  external_id TEXT,
  external_url TEXT,
  title TEXT,
  synopsis TEXT,
  image_url TEXT,
  image_local_path TEXT,
  stream_url TEXT,
  link_url TEXT,
  link_label TEXT,
  license_name TEXT NOT NULL DEFAULT 'unknown',
  license_url TEXT,
  attribution_required BOOLEAN NOT NULL DEFAULT FALSE,
  attribution_text TEXT,
  usage_scope TEXT NOT NULL DEFAULT 'unknown' CHECK (usage_scope IN ('editorial', 'commercial', 'both', 'unknown')),
  confidence NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'failed', 'expired')),
  last_verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (entity_kind = 'program' AND program_id IS NOT NULL AND channel_id IS NOT NULL)
    OR
    (entity_kind = 'channel' AND channel_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_channels_de_id ON channels_de(channel_id);
CREATE INDEX IF NOT EXISTS idx_channels_de_name ON channels_de(name);
CREATE INDEX IF NOT EXISTS idx_programs_de_date ON programs_de(date);
CREATE INDEX IF NOT EXISTS idx_programs_de_channel ON programs_de(channel_id);
CREATE INDEX IF NOT EXISTS idx_programs_de_timeslot ON programs_de(time_slot);
CREATE INDEX IF NOT EXISTS idx_programs_de_datetime ON programs_de(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_programs_de_channel_date ON programs_de(channel_id, date);
CREATE INDEX IF NOT EXISTS idx_programs_de_date_timeslot ON programs_de(date, time_slot);
CREATE INDEX IF NOT EXISTS idx_programs_de_genre ON programs_de(genre);
CREATE INDEX IF NOT EXISTS idx_programs_de_slug ON programs_de(slug);
CREATE INDEX IF NOT EXISTS idx_programs_de_channel_slug ON programs_de(channel_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_enrichment_de_unique
  ON content_enrichment_de (entity_kind, entity_id, provider, enrichment_type, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_content_enrichment_de_program_id ON content_enrichment_de(program_id);
CREATE INDEX IF NOT EXISTS idx_content_enrichment_de_channel_id ON content_enrichment_de(channel_id);
CREATE INDEX IF NOT EXISTS idx_content_enrichment_de_provider ON content_enrichment_de(provider);
CREATE INDEX IF NOT EXISTS idx_content_enrichment_de_verification ON content_enrichment_de(verification_status, last_verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_enrichment_de_updated ON content_enrichment_de(updated_at DESC);

CREATE OR REPLACE FUNCTION set_content_enrichment_de_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_content_enrichment_de_updated_at ON content_enrichment_de;
CREATE TRIGGER trg_content_enrichment_de_updated_at
BEFORE UPDATE ON content_enrichment_de
FOR EACH ROW
EXECUTE FUNCTION set_content_enrichment_de_updated_at();

CREATE OR REPLACE VIEW content_enrichment_active_de AS
SELECT *
FROM content_enrichment_de
WHERE verification_status = 'verified'
  AND license_name IS NOT NULL
  AND btrim(license_name) <> ''
  AND lower(license_name) <> 'unknown'
  AND (
    attribution_required = FALSE
    OR (attribution_text IS NOT NULL AND btrim(attribution_text) <> '')
  )
  AND (
    usage_scope IS NULL
    OR usage_scope IN ('editorial', 'both')
  )
  AND (expires_at IS NULL OR expires_at > NOW());

-- ============================================
-- Grants and RLS
-- ============================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

ALTER TABLE import_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels_fr ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs_fr ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels_de ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs_de ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_enrichment_de ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON import_status;
DROP POLICY IF EXISTS "Enable read access for all users" ON channels;
DROP POLICY IF EXISTS "Enable read access for all users" ON programs;
DROP POLICY IF EXISTS "Enable read access for all users" ON channels_fr;
DROP POLICY IF EXISTS "Enable read access for all users" ON programs_fr;
DROP POLICY IF EXISTS "Enable read access for all users" ON channels_de;
DROP POLICY IF EXISTS "Enable read access for all users" ON programs_de;
DROP POLICY IF EXISTS "Enable read access for all users" ON content_enrichment_de;

CREATE POLICY "Enable read access for all users" ON import_status
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON channels
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON programs
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON channels_fr
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON programs_fr
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON channels_de
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON programs_de
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON content_enrichment_de
  FOR SELECT USING (true);
