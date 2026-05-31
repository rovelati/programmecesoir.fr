#!/usr/bin/env python3
"""Enrich program images in programs_fr using TMDB and TVmaze."""

from __future__ import annotations

import logging
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from psycopg2 import sql
from dotenv import load_dotenv
from supabase import Client, create_client

from image_store import ImageStore
from pg_adapter import create_postgres_client
from tmdb_client import TMDBClient
from tvmaze_client import TVMazeClient


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_LOG_FILE = SCRIPT_DIR / "enricher.log"
HEAD_CHANNELS = (
    "tf1",
    "france-2",
    "france-3",
    "france-4",
    "france-5",
    "m6",
    "arte",
    "canal-plus",
    "w9",
    "tmc",
    "tfx",
    "6ter",
    "c8",
    "cstar",
)


def setup_logging() -> logging.Logger:
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    log_file = Path(os.getenv("IMAGE_ENRICHER_LOG_FILE", str(DEFAULT_LOG_FILE)))
    log_file.parent.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger("image_enricher")
    logger.setLevel(getattr(logging, log_level, logging.INFO))
    logger.handlers.clear()

    formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)

    file_handler = logging.FileHandler(log_file)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return logger


def normalize_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def strip_episode_markers(title: str) -> str:
    cleaned = title or ""
    patterns = [
        r"\s*[-–:]\s*saison\s*\d+.*$",
        r"\s*[-–:]\s*season\s*\d+.*$",
        r"\s*[-–:]\s*st\.?\s*\d+.*$",
        r"\s*[-–:]\s*ep\.?\s*\d+.*$",
        r"\s*\(\s*saison\s*\d+.*?\)\s*$",
        r"\s*\(\s*st\.?\s*\d+.*?\)\s*$",
    ]
    for pattern in patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip(" -:")


def infer_program_kind(title: str, genre: str | None) -> str:
    normalized_title = normalize_text(title)
    normalized_genre = normalize_text(genre)

    if any(token in normalized_genre for token in ("sport", "journal", "information", "info", "actualité", "actualite", "news")):
        return "skip"

    if any(token in normalized_genre for token in ("film", "cinéma", "cinema", "movie", "téléfilm", "telefilm")):
        return "movie"

    if any(token in normalized_genre for token in ("série", "serie", "fiction", "sitcom", "soap", "dessin animé", "dessin anime", "animation")):
        if re.search(r"(saison|season|st\.?|episode|épisode|ep\.?)\s*\d+", normalized_title, re.IGNORECASE):
            return "episode"
        return "series"

    if re.search(r"(saison|season|st\.?|episode|épisode|ep\.?)\s*\d+", normalized_title, re.IGNORECASE):
        return "episode"

    return "skip"


def coerce_year(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    raw = str(value).strip()
    if len(raw) >= 4 and raw[:4].isdigit():
        return int(raw[:4])
    return None


@dataclass
class ProgramRow:
    id: str
    title: str
    slug: str | None
    genre: str | None
    description: str | None
    channel_id: str
    start_time: str
    poster_url: str | None
    tmdb_id: int | None
    tvmaze_id: int | None
    production_year: int | None


class ProgramImageEnricher:
    def __init__(self) -> None:
        load_dotenv()
        self.logger = setup_logging()

        self.database_url = os.getenv("DATABASE_URL")
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_READ_KEY")
        self.programs_table = os.getenv("SUPABASE_PROGRAMS_TABLE", "programs_fr")
        self.batch_size = int(os.getenv("IMAGE_ENRICHER_BATCH_SIZE", os.getenv("BATCH_SIZE", "100")))
        self.request_sleep = float(os.getenv("SLEEP_BETWEEN_REQUESTS", "0.25"))
        self.timeout = int(os.getenv("IMAGE_ENRICHER_TIMEOUT", "20"))
        self.image_base_path = os.getenv("IMAGE_BASE_PATH")
        self.image_base_url = os.getenv("IMAGE_BASE_URL")
        self.tmdb_api_key = os.getenv("TMDB_API_KEY")

        if not self.image_base_path or not self.image_base_url:
            raise RuntimeError("Missing IMAGE_BASE_PATH or IMAGE_BASE_URL")
        if not self.tmdb_api_key:
            raise RuntimeError("Missing TMDB_API_KEY")

        self.db: Client | Any
        self.db = None
        if self.database_url:
            try:
                self.logger.info("Trying PostgreSQL adapter for image enrichment updates")
                self.db = create_postgres_client(self.database_url)
                with self.db.cursor() as cur:
                    cur.execute("SELECT 1")
                    cur.fetchone()
                self.logger.info("Using PostgreSQL adapter for image enrichment updates")
            except Exception as e:
                self.logger.warning(f"DATABASE_URL unavailable for image enrichment, falling back to Supabase REST: {str(e)}")
                try:
                    self.db.close()
                except Exception:
                    pass
                self.db = None

        if self.db is None and self.supabase_url and self.supabase_key:
            self.logger.info("Using Supabase client for image enrichment updates")
            self.db = create_client(self.supabase_url, self.supabase_key)
        if self.db is None:
            raise RuntimeError("Missing working DATABASE_URL or SUPABASE_URL with SUPABASE_SERVICE_KEY/SUPABASE_READ_KEY")

        self.tmdb = TMDBClient(
            api_key=self.tmdb_api_key,
            logger=self.logger,
            timeout=self.timeout,
            sleep_between_requests=self.request_sleep,
        )
        self.tvmaze = TVMazeClient(
            logger=self.logger,
            timeout=self.timeout,
            sleep_between_requests=self.request_sleep,
        )
        self.image_store = ImageStore(
            base_path=self.image_base_path,
            base_url=self.image_base_url,
            timeout=self.timeout,
            logger=self.logger,
        )
        self.series_cache: dict[str, tuple[str | None, str | None, int | None, int | None]] = {}

    def fetch_batch(self) -> list[ProgramRow]:
        if hasattr(self.db, "cursor"):
            return self.fetch_priority_batch_postgres()

        now = datetime.now(timezone.utc).isoformat()
        query = (
            self.db.table(self.programs_table)
            .select("id,title,slug,genre,description,channel_id,start_time,poster_url,tmdb_id,tvmaze_id,production_year")
            .is_("poster_url", "null")
            .is_("image_fetched_at", "null")
            .gt("end_time", now)
            .order("start_time", desc=False)
            .limit(self.batch_size)
        )
        response = query.execute()
        rows = response.data or []
        return self.rows_to_programs(rows)

    def fetch_priority_batch_postgres(self) -> list[ProgramRow]:
        columns = "id,title,slug,genre,description,channel_id,start_time,poster_url,tmdb_id,tvmaze_id,production_year"
        genre_patterns = (
            "%film%",
            "%cinéma%",
            "%cinema%",
            "%movie%",
            "%téléfilm%",
            "%telefilm%",
            "%série%",
            "%serie%",
            "%fiction%",
            "%sitcom%",
            "%soap%",
            "%dessin animé%",
            "%dessin anime%",
            "%animation%",
        )
        query = sql.SQL(
            """
            SELECT {columns}
            FROM {table}
            WHERE poster_url IS NULL
              AND image_fetched_at IS NULL
              AND end_time > NOW()
              AND (
                LOWER(COALESCE(genre, '')) LIKE ANY(%s)
                OR LOWER(COALESCE(title, '')) ~ %s
              )
            ORDER BY
              CASE
                WHEN start_time >= DATE_TRUNC('day', NOW()) + INTERVAL '16 hours'
                  AND start_time < DATE_TRUNC('day', NOW()) + INTERVAL '1 day' THEN 0
                WHEN start_time >= NOW() AND start_time < NOW() + INTERVAL '12 hours' THEN 1
                WHEN start_time >= NOW() AND start_time < NOW() + INTERVAL '36 hours' THEN 2
                WHEN start_time < NOW() + INTERVAL '7 days' THEN 3
                ELSE 4
              END,
              CASE WHEN channel_id = ANY(%s) THEN 0 ELSE 1 END,
              CASE
                WHEN LOWER(COALESCE(genre, '')) LIKE ANY(%s) THEN 0
                ELSE 1
              END,
              start_time ASC
            LIMIT {limit}
            """
        ).format(
            columns=sql.SQL(", ").join(sql.Identifier(col.strip()) for col in columns.split(",")),
            table=sql.Identifier(self.programs_table),
            limit=sql.Literal(self.batch_size),
        )
        with self.db.cursor() as cursor:
            cursor.execute(
                query,
                (
                    list(genre_patterns),
                    r"(saison|season|st\.?|episode|épisode|ep\.?)\s*\d+",
                    list(HEAD_CHANNELS),
                    ["%film%", "%cinéma%", "%cinema%", "%movie%", "%téléfilm%", "%telefilm%"],
                ),
            )
            rows = cursor.fetchall()
            names = [desc[0] for desc in cursor.description]
        return self.rows_to_programs([dict(zip(names, row)) for row in rows])

    def rows_to_programs(self, rows: list[dict[str, Any]]) -> list[ProgramRow]:
        return [
            ProgramRow(
                id=str(row["id"]),
                title=str(row.get("title") or ""),
                slug=row.get("slug"),
                genre=row.get("genre"),
                description=row.get("description"),
                channel_id=str(row.get("channel_id") or ""),
                start_time=str(row.get("start_time") or ""),
                poster_url=row.get("poster_url"),
                tmdb_id=row.get("tmdb_id"),
                tvmaze_id=row.get("tvmaze_id"),
                production_year=coerce_year(row.get("production_year")),
            )
            for row in rows
        ]

    def update_program(self, program_id: str, **fields: Any) -> None:
        payload = {**fields, "image_fetched_at": datetime.now(timezone.utc).isoformat()}
        self.db.table(self.programs_table).update(payload).eq("id", program_id).execute()

    def series_cache_key(self, program: ProgramRow) -> str:
        return normalize_text(strip_episode_markers(program.title))

    def resolve_image(self, program: ProgramRow) -> tuple[str | None, str | None, int | None, int | None]:
        kind = infer_program_kind(program.title, program.genre)
        if kind == "skip":
            return None, None, None, None

        search_title = strip_episode_markers(program.title) if kind in ("series", "episode") else program.title
        if kind in ("series", "episode"):
            cache_key = self.series_cache_key(program)
            if cache_key in self.series_cache:
                return self.series_cache[cache_key]

        image_url: str | None = None
        image_source: str | None = None
        tmdb_id: int | None = None
        tvmaze_id: int | None = None

        if kind == "movie":
            tmdb_match = self.tmdb.search_movie(search_title, year=program.production_year)
            if tmdb_match:
                image_url = self.image_store.save_from_remote("tmdb", tmdb_match.tmdb_id, tmdb_match.poster_url)
                image_source = "tmdb"
                tmdb_id = tmdb_match.tmdb_id
        else:
            tmdb_match = self.tmdb.search_tv(search_title)
            if tmdb_match:
                image_url = self.image_store.save_from_remote("tmdb", tmdb_match.tmdb_id, tmdb_match.poster_url)
                image_source = "tmdb"
                tmdb_id = tmdb_match.tmdb_id
            else:
                tvmaze_match = self.tvmaze.search_show(search_title)
                if tvmaze_match:
                    image_url = self.image_store.save_from_remote("tvmaze", tvmaze_match.tvmaze_id, tvmaze_match.image_url)
                    image_source = "tvmaze"
                    tvmaze_id = tvmaze_match.tvmaze_id

        result = (image_url, image_source, tmdb_id, tvmaze_id)
        if kind in ("series", "episode"):
            self.series_cache[self.series_cache_key(program)] = result
        return result

    def run(self) -> int:
        batch = self.fetch_batch()
        self.logger.info("Fetched %s programs to enrich from %s", len(batch), self.programs_table)
        processed = 0

        for program in batch:
            processed += 1
            try:
                image_url, image_source, tmdb_id, tvmaze_id = self.resolve_image(program)
                self.update_program(
                    program.id,
                    poster_url=image_url,
                    image_source=image_source,
                    tmdb_id=tmdb_id,
                    tvmaze_id=tvmaze_id,
                )
                self.logger.info(
                    "[%s/%s] %s -> poster=%s source=%s",
                    processed,
                    len(batch),
                    program.title,
                    image_url or "none",
                    image_source or "none",
                )
            except Exception as exc:
                self.logger.exception("Failed enriching %s (%s): %s", program.title, program.id, exc)
                try:
                    self.update_program(program.id, image_source=None)
                except Exception:
                    self.logger.exception("Failed writing failure marker for %s", program.id)
            time.sleep(self.request_sleep)

        return processed


def main() -> int:
    enricher = ProgramImageEnricher()
    try:
        return enricher.run()
    finally:
        close_method = getattr(enricher.db, "close", None)
        if callable(close_method):
            close_method()


if __name__ == "__main__":
    raise SystemExit(main())
