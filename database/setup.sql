-- 123ProgrammiTV Database Setup
-- Execute this in Supabase SQL Editor

-- ============================================
-- 1. CREATE TABLES
-- ============================================

-- Table: channels
-- Stores information about TV channels
CREATE TABLE IF NOT EXISTS channels (
  id SERIAL PRIMARY KEY,
  channel_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  logo_url TEXT,
  channel_number INTEGER,
  category TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table: programs
-- Stores TV program schedules with time slots
CREATE TABLE IF NOT EXISTS programs (
  id SERIAL PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(channel_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  date DATE NOT NULL,
  time_slot TEXT NOT NULL CHECK (time_slot IN ('oggi', 'stasera', 'stanotte')),
  genre TEXT,
  rating TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 2. CREATE INDEXES
-- ============================================

-- Indexes for channels table
CREATE INDEX IF NOT EXISTS idx_channels_id ON channels(channel_id);
CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name);

-- Indexes for programs table
CREATE INDEX IF NOT EXISTS idx_programs_date ON programs(date);
CREATE INDEX IF NOT EXISTS idx_programs_channel ON programs(channel_id);
CREATE INDEX IF NOT EXISTS idx_programs_timeslot ON programs(time_slot);
CREATE INDEX IF NOT EXISTS idx_programs_datetime ON programs(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_programs_channel_date ON programs(channel_id, date);
CREATE INDEX IF NOT EXISTS idx_programs_date_timeslot ON programs(date, time_slot);

-- ============================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Enable read access for all users" ON channels
  FOR SELECT
  USING (true);

CREATE POLICY "Enable read access for all users" ON programs
  FOR SELECT
  USING (true);

-- Service role can do everything (for Python script)
-- No additional policies needed as service_role bypasses RLS

-- ============================================
-- 4. COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE channels IS 'TV channels (RAI, Mediaset, digitale terrestre)';
COMMENT ON TABLE programs IS 'TV program schedules with time slots (oggi/stasera/stanotte)';

COMMENT ON COLUMN programs.time_slot IS 'Time slot: oggi (06:00-17:59), stasera (18:00-23:59), stanotte (00:00-05:59)';
COMMENT ON COLUMN programs.date IS 'Program date in Europe/Rome timezone';
