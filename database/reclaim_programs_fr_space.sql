-- Reclaim disk space for programs_fr after heavy delete/insert churn.
-- Run statements one by one in Supabase SQL Editor (not all at once).
-- Best window: low traffic.

-- 1) Baseline sizes
select
  now() as checked_at,
  pg_size_pretty(pg_relation_size('public.programs_fr')) as programs_heap,
  pg_size_pretty(pg_indexes_size('public.programs_fr')) as programs_indexes,
  pg_size_pretty(pg_total_relation_size('public.programs_fr')) as programs_total,
  pg_size_pretty(pg_database_size(current_database())) as db_total;

-- 2) Quick/online index compaction (low lock)
-- Rebuild all indexes for programs_fr concurrently.
reindex table concurrently public.programs_fr;

-- 3) Refresh planner stats
vacuum (analyze, verbose) public.programs_fr;

-- 4) Hard reclaim of table heap (blocking lock on programs_fr)
-- This is the operation that really shrinks table file size.
-- Schedule at night/low traffic.
vacuum (full, analyze, verbose) public.programs_fr;

-- 5) Optional: compact channels/import metadata tables too
vacuum (full, analyze, verbose) public.channels_fr;
vacuum (full, analyze, verbose) public.import_status;

-- 6) Post-check sizes
select
  now() as checked_at,
  pg_size_pretty(pg_relation_size('public.programs_fr')) as programs_heap,
  pg_size_pretty(pg_indexes_size('public.programs_fr')) as programs_indexes,
  pg_size_pretty(pg_total_relation_size('public.programs_fr')) as programs_total,
  pg_size_pretty(pg_database_size(current_database())) as db_total;
