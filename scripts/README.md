# Program image enricher

This repo already uses `poster_url` on `programs_fr` for public program images.
So the enricher writes the final public URL into `poster_url` and adds tracking columns
via `/Users/romolovelati/Desktop/programmecesoir.fr/database/migration_add_images.sql`.

## Files

- `/Users/romolovelati/Desktop/programmecesoir.fr/scripts/image_enricher.py`
- `/Users/romolovelati/Desktop/programmecesoir.fr/scripts/tmdb_client.py`
- `/Users/romolovelati/Desktop/programmecesoir.fr/scripts/tvmaze_client.py`
- `/Users/romolovelati/Desktop/programmecesoir.fr/scripts/image_store.py`

## Expected env

Add these to your runtime env:

- `DATABASE_URL` (preferred, same path used by the importer)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` or `SUPABASE_READ_KEY` (fallback if `DATABASE_URL` is unavailable)
- `SUPABASE_PROGRAMS_TABLE=programs_fr`
- `TMDB_API_KEY`
- `IMAGE_BASE_PATH`
- `IMAGE_BASE_URL`
- `IMAGE_ENRICHER_BATCH_SIZE`
- `IMAGE_ENRICHER_TIMEOUT`
- `SLEEP_BETWEEN_REQUESTS`

The shared example file is:

- `/Users/romolovelati/Desktop/programmecesoir.fr/scripts/.env.example`

## Install

```bash
cd /Users/romolovelati/Desktop/programmecesoir.fr/scripts
python3 -m pip install -r requirements.txt
```

## Run

```bash
cd /Users/romolovelati/Desktop/programmecesoir.fr/scripts
python3 image_enricher.py
```

## Cron

Hostinger / crontab example:

```cron
0 3 * * * cd /home/u12345/domains/programmecesoir.fr/scripts && /usr/bin/python3 image_enricher.py >> /home/u12345/.logs/program_image_enricher.log 2>&1
```

## Current adaptation notes

- The enricher prefers `DATABASE_URL` and the existing PostgreSQL adapter for read/write consistency with the importer.
- The live schema does not expose `show_title` or `type`, so classification is heuristic from `genre` and title markers.
- The live schema already exposes `poster_url`, so the script updates `poster_url` instead of introducing a second public image column.
- Series/episode deduplication uses a normalized title stripped from season/episode markers.
