-- programmitnt.fr Database Setup (FR)
-- Execute this in Supabase SQL Editor

-- ============================================
-- 1. CREATE TABLES
-- ============================================

-- Table: channels_fr
-- Stores information about French TV channels (TNT)
CREATE TABLE IF NOT EXISTS channels_fr (
  id SERIAL PRIMARY KEY,
  channel_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  logo_url TEXT,
  channel_number INTEGER,
  category TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table: programs_fr
-- Stores TV program schedules with time slots (FR)
CREATE TABLE IF NOT EXISTS programs_fr (
  id SERIAL PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels_fr(channel_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  date DATE NOT NULL,
  time_slot TEXT NOT NULL CHECK (time_slot IN ('aujourdhui', 'ce-soir', 'nuit')),
  genre TEXT,
  rating TEXT,
  poster_url TEXT,
  replay_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table: import_status
-- Tracks EPG importer runs
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

-- ============================================
-- 2. CREATE INDEXES
-- ============================================

-- Indexes for channels_fr table
CREATE INDEX IF NOT EXISTS idx_channels_fr_id ON channels_fr(channel_id);
CREATE INDEX IF NOT EXISTS idx_channels_fr_name ON channels_fr(name);

-- Indexes for programs_fr table
CREATE INDEX IF NOT EXISTS idx_programs_fr_date ON programs_fr(date);
CREATE INDEX IF NOT EXISTS idx_programs_fr_channel ON programs_fr(channel_id);
CREATE INDEX IF NOT EXISTS idx_programs_fr_timeslot ON programs_fr(time_slot);
CREATE INDEX IF NOT EXISTS idx_programs_fr_datetime ON programs_fr(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_programs_fr_channel_date ON programs_fr(channel_id, date);
CREATE INDEX IF NOT EXISTS idx_programs_fr_date_timeslot ON programs_fr(date, time_slot);
CREATE INDEX IF NOT EXISTS idx_programs_fr_genre ON programs_fr(genre);

-- Indexes for import_status table
CREATE INDEX IF NOT EXISTS idx_import_status_updated ON import_status(updated_at);

-- ============================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE channels_fr ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs_fr ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_status ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Enable read access for all users" ON channels_fr;
DROP POLICY IF EXISTS "Enable read access for all users" ON programs_fr;
DROP POLICY IF EXISTS "Enable read access for all users" ON import_status;

-- Create policies for public read access
CREATE POLICY "Enable read access for all users" ON channels_fr
  FOR SELECT
  USING (true);

CREATE POLICY "Enable read access for all users" ON programs_fr
  FOR SELECT
  USING (true);

CREATE POLICY "Enable read access for all users" ON import_status
  FOR SELECT
  USING (true);

-- Service role can do everything (for Python script)
-- No additional policies needed as service_role bypasses RLS

-- ============================================
-- 4. COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE channels_fr IS 'French TV channels (TNT - Télévision Numérique Terrestre)';
COMMENT ON TABLE programs_fr IS 'French TV program schedules with time slots (aujourdhui/ce-soir/nuit)';
COMMENT ON TABLE import_status IS 'EPG import status and last run metadata';

COMMENT ON COLUMN programs_fr.time_slot IS 'Time slot: aujourdhui (06:00-17:59), ce-soir (18:00-23:59), nuit (00:00-05:59)';
COMMENT ON COLUMN programs_fr.date IS 'Program date in Europe/Paris timezone';
COMMENT ON COLUMN programs_fr.replay_url IS 'Official replay URL on the broadcaster platform when available';
