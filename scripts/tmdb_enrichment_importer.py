#!/usr/bin/env python3
"""
TMDB Poster & Metadata Enrichment Importer for programmecesoir.fr

For each program in programs_fr that lacks a poster:
  1. Detects content type (Movie / TV Series / Doc)
  2. Queries TMDB API (French language preferred: 'fr-FR')
  3. Downloads high-res poster locally to astro/public/images/programs/tmdb/{tmdb_id}.jpg
  4. Updates programs_fr with local poster_url, tmdb_id, and metadata.
"""

from __future__ import annotations

import argparse
import io
import logging
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv

# Try importing PIL for local image optimization
try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# Try importing pg_adapter for direct Postgres connection
try:
    from pg_adapter import create_postgres_client
except ImportError:
    create_postgres_client = None

# Load .env
SCRIPT_DIR = Path(__file__).resolve().parent
for p in [
    SCRIPT_DIR / ".env",
    SCRIPT_DIR.parent / "astro" / ".env",
    Path("/root/epg_importers/programmecesoir/.env"),
    Path("/var/www/programmecesoir.fr/astro/.env"),
    Path("/var/www/programmecesoir.fr/scripts/.env"),
]:
    if p.is_file():
        load_dotenv(p)

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "f2a66cd75043fcfb7688948deb323d0e")
TMDB_API_BASE = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500"
TMDB_LANGUAGE = os.getenv("TMDB_LANGUAGE", "fr-FR")
TMDB_FALLBACK_LANG = "en-US"

PROGRAMS_TABLE = os.getenv("SUPABASE_PROGRAMS_TABLE", "programs_fr")
DATABASE_URL = os.getenv("DATABASE_URL", "")

# Image destinations
_VPS_NGINX_DIR = Path("/var/www/images/programmecesoir.fr/programs/tmdb")
_VPS_ASTRO_PUBLIC = Path("/var/www/programmecesoir.fr/astro/public/images/programs/tmdb")
_DEFAULT_ASTRO_PUBLIC = SCRIPT_DIR.parent / "astro" / "public" / "images" / "programs" / "tmdb"

if _VPS_NGINX_DIR.parent.is_dir():
    TMDB_POSTERS_DIR = _VPS_NGINX_DIR
elif _VPS_ASTRO_PUBLIC.parent.is_dir():
    TMDB_POSTERS_DIR = _VPS_ASTRO_PUBLIC
else:
    TMDB_POSTERS_DIR = _DEFAULT_ASTRO_PUBLIC


def setup_logging() -> logging.Logger:
    logger = logging.getLogger("tmdb_enrichment_fr")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")

    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(formatter)
    logger.addHandler(sh)

    log_file = SCRIPT_DIR / "tmdb_enrichment.log"
    try:
        fh = logging.FileHandler(log_file, encoding="utf-8")
        fh.setFormatter(formatter)
        logger.addHandler(fh)
    except Exception:
        pass

    return logger


logger = setup_logging()


def clean_title(raw_title: str) -> str:
    """Strip episode suffixes, seasons, and subtitles for higher search accuracy."""
    t = raw_title or ""
    patterns = [
        r"\s*[-–:]\s*saison\s*\d+.*$",
        r"\s*[-–:]\s*season\s*\d+.*$",
        r"\s*[-–:]\s*épisode\s*\d+.*$",
        r"\s*[-–:]\s*ep\s*\d+.*$",
        r"\s*[-–:]\s*partie\s*\d+.*$",
        r"\s*\(\s*saison\s*\d+.*?\)\s*$",
        r"\s*\(\s*\d{4}\s*\)\s*$",
        r"\s*:\s*.*$",  # strip secondary title if any
    ]
    for pat in patterns:
        t = re.sub(pat, "", t, flags=re.IGNORECASE)
    return t.strip(" -:.,")


def detect_type(genre: Optional[str], title: str) -> str:
    g = (genre or "").lower()
    t = (title or "").lower()
    if any(k in g for k in ("film", "cinéma", "cinema", "téléfilm", "telefilm", "long-métrage", "drame", "comédie", "thriller", "action", "policier", "western")):
        return "movie"
    if any(k in g for k in ("série", "serie", "feuilleton", "sitcom", "mini-série", "animation", "manga", "jeunesse", "téléréalité", "telerealite", "divertissement", "jeu", "doc", "documentaire", "découverte", "histoire", "nature", "société", "reportage", "magazine", "talk")):
        return "tv"
    return "all"


class TMDBEnricher:
    def __init__(self, api_key: str, db_url: str):
        self.api_key = api_key
        self.db_url = db_url
        self.session = requests.Session()
        TMDB_POSTERS_DIR.mkdir(parents=True, exist_ok=True)

        if create_postgres_client and db_url:
            logger.info("Connecting to Postgres via pg_adapter...")
            self.client = create_postgres_client(db_url)
        else:
            raise ValueError("DATABASE_URL is required for TMDB enrichment")

    def search_tmdb(self, query: str, content_type: str = "all") -> Optional[Dict[str, Any]]:
        cleaned = clean_title(query)
        if not cleaned or len(cleaned) < 2:
            return None

        endpoints = []
        if content_type == "movie":
            endpoints.append("/search/movie")
        elif content_type == "tv":
            endpoints.append("/search/tv")
        else:
            endpoints.extend(["/search/tv", "/search/movie", "/search/multi"])

        for ep in endpoints:
            url = f"{TMDB_API_BASE}{ep}"
            params = {
                "api_key": self.api_key,
                "query": cleaned,
                "language": TMDB_LANGUAGE,
                "include_adult": "false",
            }
            try:
                r = self.session.get(url, params=params, timeout=8)
                if r.status_code == 200:
                    data = r.json()
                    results = data.get("results") or []
                    if results:
                        # Prioritize results with a 16:9 backdrop or poster
                        for res in results:
                            if res.get("backdrop_path"):
                                return res
                        for res in results:
                            if res.get("poster_path"):
                                return res
                        return results[0]
            except Exception as e:
                logger.warning(f"TMDB search failed for '{cleaned}': {e}")
                time.sleep(0.3)

        return None

    def save_poster_locally(self, tmdb_id: int, image_path: str, is_backdrop: bool = False) -> Optional[str]:
        if not image_path:
            return None

        filename = f"{tmdb_id}.jpg"
        target_path = TMDB_POSTERS_DIR / filename
        public_url = f"/images/programs/tmdb/{filename}"

        if target_path.exists() and target_path.stat().st_size > 1000:
            return public_url

        base = "https://image.tmdb.org/t/p/w780" if is_backdrop else TMDB_IMAGE_BASE
        image_url = f"{base}{image_path}"
        try:
            r = self.session.get(image_url, timeout=12)
            if r.status_code == 200:
                raw_bytes = r.content
                if HAS_PIL:
                    img = Image.open(io.BytesIO(raw_bytes))
                    if img.mode not in ("RGB", "L"):
                        img = img.convert("RGB")
                    img.save(target_path, format="JPEG", quality=85, optimize=True)
                else:
                    with open(target_path, "wb") as f:
                        f.write(raw_bytes)
                logger.info(f"Saved local image: {target_path} (backdrop={is_backdrop})")
                return public_url
        except Exception as e:
            logger.warning(f"Failed to download image from {image_url}: {e}")
            # fallback to remote url if download fails
            return image_url

        return None

    def propagate_existing_posters(self) -> int:
        """Propagate posters from programs that have one to all other airings of the same title."""
        logger.info("Propagating existing posters across all matching titles...")
        with self.client.cursor() as cur:
            cur.execute("""
                WITH distinct_posters AS (
                    SELECT DISTINCT ON (title) title, poster_url, tmdb_id, image_source, production_year
                    FROM programs_fr
                    WHERE poster_url IS NOT NULL AND poster_url != ''
                    ORDER BY title, id DESC
                )
                UPDATE programs_fr p
                SET 
                    poster_url = dp.poster_url,
                    tmdb_id = dp.tmdb_id,
                    image_source = dp.image_source,
                    production_year = COALESCE(p.production_year, dp.production_year)
                FROM distinct_posters dp
                WHERE p.title = dp.title
                  AND (p.poster_url IS NULL OR p.poster_url = '')
            """)
            updated_count = cur.rowcount
        logger.info(f"Propagated {updated_count} poster assignments across matching titles.")
        return updated_count

    def enrich_batch(self, days_lookahead: int = 7, limit: int = 500, dry_run: bool = False):
        self.propagate_existing_posters()

        today = datetime.now(timezone.utc).date().isoformat()
        end_date = (datetime.now(timezone.utc).date() + timedelta(days=days_lookahead)).isoformat()

        logger.info(f"Fetching distinct un-enriched titles between {today} and {end_date} (priority prime-time)...")

        with self.client.cursor() as cur:
            cur.execute(f"""
                SELECT 
                    p.title,
                    p.genre,
                    CASE 
                        WHEN p.time_slot IN ('soirée', 'prime') THEN 1
                        WHEN p.time_slot = 'deuxième_partie' THEN 2
                        WHEN p.time_slot = 'access_prime' THEN 3
                        ELSE 4
                    END as priority_order,
                    COUNT(*) as airing_count
                FROM {PROGRAMS_TABLE} p
                WHERE p.date >= %s AND p.date <= %s
                  AND (p.poster_url IS NULL OR p.poster_url = '')
                GROUP BY p.title, p.genre, priority_order
                ORDER BY priority_order ASC, airing_count DESC
                LIMIT %s
            """, (today, end_date, limit))
            rows = cur.fetchall()

        logger.info(f"Found {len(rows)} distinct program titles needing poster search.")

        enriched_count = 0
        total_airings_updated = 0

        for idx, row in enumerate(rows, 1):
            title, genre, _, airing_count = row
            if not title:
                continue

            c_type = detect_type(genre, title)
            match = self.search_tmdb(title, c_type)

            if not match:
                continue

            tmdb_id = match.get("id")
            backdrop_path = match.get("backdrop_path")
            poster_path = match.get("poster_path")
            chosen_path = backdrop_path or poster_path
            is_backdrop = bool(backdrop_path)
            year_str = match.get("release_date") or match.get("first_air_date") or ""
            year = int(year_str[:4]) if len(year_str) >= 4 and year_str[:4].isdigit() else None

            if not tmdb_id or not chosen_path:
                continue

            local_poster_url = self.save_poster_locally(tmdb_id, chosen_path, is_backdrop=is_backdrop)
            if not local_poster_url:
                continue

            matched_title = match.get("title") or match.get("name")
            logger.info(f"[{idx}/{len(rows)}] MATCH: '{title}' ({airing_count} airings) -> TMDB #{tmdb_id} ('{matched_title}') -> {local_poster_url}")

            if not dry_run:
                try:
                    with self.client.cursor() as cur:
                        if year:
                            cur.execute(f"""
                                UPDATE {PROGRAMS_TABLE}
                                SET poster_url = %s, tmdb_id = %s, image_source = 'tmdb',
                                    image_fetched_at = NOW(), production_year = COALESCE(production_year, %s)
                                WHERE title = %s AND (poster_url IS NULL OR poster_url = '')
                            """, (local_poster_url, tmdb_id, year, title))
                        else:
                            cur.execute(f"""
                                UPDATE {PROGRAMS_TABLE}
                                SET poster_url = %s, tmdb_id = %s, image_source = 'tmdb',
                                    image_fetched_at = NOW()
                                WHERE title = %s AND (poster_url IS NULL OR poster_url = '')
                            """, (local_poster_url, tmdb_id, title))
                        total_airings_updated += cur.rowcount
                    enriched_count += 1
                except Exception as e:
                    logger.error(f"Failed to update title '{title}': {e}")

            time.sleep(0.15)

        logger.info(f"Enrichment finished: {enriched_count} unique titles found on TMDb, {total_airings_updated} total program airings updated.")


def main():
    parser = argparse.ArgumentParser(description="Enrich programs_fr with TMDb posters")
    parser.add_argument("--limit", type=int, default=500, help="Max distinct titles to enrich per run")
    parser.add_argument("--lookahead", type=int, default=7, help="Days lookahead")
    parser.add_argument("--dry-run", action="store_true", help="Do not write DB updates")
    args = parser.parse_args()

    enricher = TMDBEnricher(api_key=TMDB_API_KEY, db_url=DATABASE_URL)
    enricher.enrich_batch(
        days_lookahead=args.lookahead,
        limit=args.limit,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
