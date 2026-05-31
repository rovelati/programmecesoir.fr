-- Remove all Antena channels and their programs from the database
-- This script removes all channels whose name starts with "Antena" (case-insensitive)

-- First, delete all programs from Antena channels
DELETE FROM programs 
WHERE channel_id IN (
    SELECT channel_id FROM channels 
    WHERE LOWER(name) LIKE 'antena%'
       OR LOWER(channel_id) LIKE '%antena%'
);

-- Then, delete the channels themselves
DELETE FROM channels 
WHERE LOWER(name) LIKE 'antena%'
   OR LOWER(channel_id) LIKE '%antena%';

-- Verify deletion (should return 0 rows)
SELECT COUNT(*) as remaining_antena_channels 
FROM channels 
WHERE LOWER(name) LIKE 'antena%'
   OR LOWER(channel_id) LIKE '%antena%';

SELECT COUNT(*) as remaining_antena_programs 
FROM programs 
WHERE channel_id IN (
    SELECT channel_id FROM channels 
    WHERE LOWER(name) LIKE 'antena%' 
       OR LOWER(channel_id) LIKE '%antena%'
);

-- Show what was deleted (for reference)
-- Note: This won't show anything after deletion, but useful to run before deletion
-- SELECT channel_id, name FROM channels WHERE LOWER(name) LIKE 'antena%' OR LOWER(channel_id) LIKE '%antena%';
