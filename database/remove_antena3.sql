-- Remove Antena 3 channel and all its programs from the database
-- Run this script to clean up existing data

-- First, delete all programs from Antena 3
DELETE FROM programs 
WHERE channel_id IN (
    SELECT channel_id FROM channels 
    WHERE LOWER(name) LIKE '%antena 3%' 
       OR LOWER(channel_id) LIKE '%antena-3%'
       OR LOWER(channel_id) LIKE '%antena3%'
);

-- Then, delete the channel itself
DELETE FROM channels 
WHERE LOWER(name) LIKE '%antena 3%' 
   OR LOWER(channel_id) LIKE '%antena-3%'
   OR LOWER(channel_id) LIKE '%antena3%';

-- Verify deletion (should return 0 rows)
SELECT COUNT(*) as remaining_antena3_channels 
FROM channels 
WHERE LOWER(name) LIKE '%antena 3%' 
   OR LOWER(channel_id) LIKE '%antena-3%'
   OR LOWER(channel_id) LIKE '%antena3%';

SELECT COUNT(*) as remaining_antena3_programs 
FROM programs 
WHERE channel_id IN (
    SELECT channel_id FROM channels 
    WHERE LOWER(name) LIKE '%antena 3%' 
       OR LOWER(channel_id) LIKE '%antena-3%'
       OR LOWER(channel_id) LIKE '%antena3%'
);
