-- 123ProgrammiTV Database Cleanup
-- Use this to remove old data or reset database

-- Delete programs older than 7 days
DELETE FROM programs 
WHERE date < CURRENT_DATE - INTERVAL '7 days';

-- Drop all tables (CAUTION: Use only for full reset)
-- Uncomment to use:
-- DROP TABLE IF EXISTS programs CASCADE;
-- DROP TABLE IF EXISTS channels CASCADE;
