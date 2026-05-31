-- Birthday articles storage for programmecesoir.fr
-- Target project: xkrchvzeagoukkgpsnct
-- Run in Supabase SQL Editor or via psql against the production database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  CONSTRAINT uq_entity_year UNIQUE (entity_slug, published_date)
);

CREATE INDEX IF NOT EXISTS idx_birthday_published ON birthday_articles(published_date DESC);
CREATE INDEX IF NOT EXISTS idx_birthday_mmdd ON birthday_articles(birth_date_mmdd);
CREATE INDEX IF NOT EXISTS idx_birthday_slug ON birthday_articles(article_slug);

ALTER TABLE birthday_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON birthday_articles;
CREATE POLICY "public read" ON birthday_articles
  FOR SELECT
  USING (is_published = TRUE);
