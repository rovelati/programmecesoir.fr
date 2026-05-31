#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import psycopg2
from dotenv import load_dotenv


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Refresh static entity airings from Postgres in one bulk query.")
    parser.add_argument("--env-file", default="", help="Path to .env containing DATABASE_URL")
    parser.add_argument("--entities-dir", default="", help="Path to entities-data directory")
    parser.add_argument("--horizon-days", type=int, default=int(os.getenv("ENTITY_AIRINGS_HORIZON_DAYS", "7")))
    parser.add_argument("--past-hours", type=int, default=int(os.getenv("ENTITY_AIRINGS_PAST_HOURS", "2")))
    parser.add_argument("--max-airings", type=int, default=int(os.getenv("ENTITY_AIRINGS_MAX", "18")))
    parser.add_argument("--dry-run", action="store_true", help="Do not write files")
    return parser.parse_args()


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_CANDIDATES = [
    ROOT / "scripts" / ".env",
    ROOT / "frontend" / ".env",
]
DEFAULT_ENTITIES_DIR = ROOT / "frontend" / "public" / "entities-data"


SERIES_EPISODE_PATTERNS = [
    re.compile(r"\s*---\s*s\d+(?:e\d+)?.*$", re.IGNORECASE),
    re.compile(r"\s+\bs\d+(?:e\d+)?\b.*$", re.IGNORECASE),
    re.compile(r"\s+\d+-\d+(?:-\d+)*\s*$", re.IGNORECASE),
    re.compile(r"\([^)]*(?:st\.?|saison|season|ep\.?|episode|épisode)[^)]*\)", re.IGNORECASE),
    re.compile(r"\s*[-:]\s*(?:saison|season|st\.?|episode|ep\.?|épisode)\s*\d+.*$", re.IGNORECASE),
    re.compile(r"\s+\b(?:saison|season|st\.?)\s*\d+\b.*$", re.IGNORECASE),
]


def normalize_text(value: Any) -> str:
    import unicodedata

    text = str(value or "").lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[^a-z0-9\s-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def slugify(value: Any) -> str:
    text = normalize_text(value).replace(" ", "-")
    text = re.sub(r"-{2,}", "-", text)
    return text.strip("-")


def canonical_series_title(title: Any) -> str:
    source = str(title or "").strip()
    for pattern in SERIES_EPISODE_PATTERNS:
        source = pattern.sub("", source)
    return source.strip()


def infer_program_kind(program: Dict[str, Any]) -> Optional[str]:
    genre = normalize_text(program.get("genre"))
    title = str(program.get("title") or "")
    if any(token in genre for token in ("film", "cinema", "movie", "telefilm")):
        return "film"
    if "serie" in genre or re.search(r"(?:st\.?|saison|season|ep\.?|episode|épisode)\s*\d+", title, re.IGNORECASE):
        return "series"
    return None


def canonical_title(entity_type: str, title: Any) -> str:
    if entity_type == "series":
        return canonical_series_title(title)
    return str(title or "").strip()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.write_text(f"{json.dumps(payload, indent=2, ensure_ascii=False)}\n", encoding="utf-8")


def load_environment(env_file: str) -> None:
    if os.getenv("DATABASE_URL"):
        return

    candidates: List[Path] = []
    if env_file:
        candidates.append(Path(env_file))
    candidates.extend(DEFAULT_ENV_CANDIDATES)

    for candidate in candidates:
        if candidate.exists():
            load_dotenv(candidate, override=False)

    if not os.getenv("DATABASE_URL"):
        raise RuntimeError("DATABASE_URL mancante per update_entity_airings.py")


def load_entity_lookup(entities_dir: Path, entity_type: str) -> Dict[str, Dict[str, Any]]:
    entity_dir = entities_dir / {"film": "films", "series": "series", "actor": "actors"}[entity_type]
    lookup: Dict[str, Dict[str, Any]] = {}

    if not entity_dir.exists():
        return lookup

    for file_path in sorted(entity_dir.glob("*.json")):
        entity = read_json(file_path)
        aliases = {
            entity.get("slug"),
            slugify(canonical_title(entity_type, entity.get("title") or entity.get("name"))),
        }
        for title in entity.get("sourceTitles") or []:
            aliases.add(slugify(canonical_title(entity_type, title)))

        record = {
            "type": entity_type,
            "slug": entity["slug"],
            "href": f"/{'film' if entity_type == 'film' else 'serie' if entity_type == 'series' else 'acteur'}/{entity['slug']}",
            "file_path": file_path,
            "entity": entity,
        }

        for alias in aliases:
            if not alias or alias in lookup:
                continue
            lookup[alias] = record

    return lookup


def build_airing(program: Dict[str, Any]) -> Dict[str, Any]:
    channel_slug = slugify(program.get("channel_id"))
    title = str(program.get("title") or "")
    program_slug = slugify(title)
    return {
        "id": str(program.get("id") or ""),
        "title": title,
        "programSlug": program_slug,
        "programUrl": f"/programme/{channel_slug}/{program_slug}",
        "channelId": str(program.get("channel_id") or ""),
        "channelName": str(program.get("channel_name") or program.get("channel_id") or ""),
        "channelSlug": channel_slug,
        "startTime": str(program.get("start_time") or ""),
        "endTime": str(program.get("end_time") or ""),
        "date": str(program.get("date") or ""),
    }


def sort_and_trim_airings(airings: Iterable[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
    now = datetime.now(timezone.utc)
    seen = set()
    ordered = []
    for airing in sorted(airings, key=lambda item: item.get("startTime", "")):
        end_value = str(airing.get("endTime") or "")
        start_value = str(airing.get("startTime") or "")
        try:
            end_at = datetime.fromisoformat(end_value.replace("Z", "+00:00")) if end_value else None
        except ValueError:
            end_at = None
        try:
            start_at = datetime.fromisoformat(start_value.replace("Z", "+00:00")) if start_value else None
        except ValueError:
            start_at = None

        if end_at is not None and end_at < now:
            continue
        if end_at is None and start_at is not None and start_at < now:
            continue

        airing_id = airing.get("id")
        if airing_id in seen:
            continue
        seen.add(airing_id)
        ordered.append(airing)
        if len(ordered) >= limit:
            break
    return ordered


def update_entity_record(record: Dict[str, Any], airings: List[Dict[str, Any]], synced_at: str, max_airings: int, dry_run: bool) -> bool:
    next_airings = sort_and_trim_airings(airings, max_airings)
    next_entity = dict(record["entity"])
    next_entity["upcomingAirings"] = next_airings
    next_entity["nextAiringAt"] = next_airings[0]["startTime"] if next_airings else None
    next_entity["lastProgramRefreshAt"] = synced_at

    before = json.dumps(record["entity"], sort_keys=True, ensure_ascii=False)
    after = json.dumps(next_entity, sort_keys=True, ensure_ascii=False)
    if before == after:
        return False

    if not dry_run:
        write_json(record["file_path"], next_entity)
    record["entity"] = next_entity
    return True


def update_actor_record(record: Dict[str, Any], work_map: Dict[str, Dict[str, Any]], synced_at: str, dry_run: bool) -> bool:
    aggregated: List[Dict[str, Any]] = []
    for item in record["entity"].get("knownFor") or []:
        key = f"{item['type']}:{item['slug']}"
        work = work_map.get(key)
        if not work:
            continue
        aggregated.extend(work["entity"].get("upcomingAirings") or [])

    next_airings = sort_and_trim_airings(aggregated, 12)
    next_entity = dict(record["entity"])
    next_entity["upcomingAirings"] = next_airings
    next_entity["nextAiringAt"] = next_airings[0]["startTime"] if next_airings else None
    next_entity["lastProgramRefreshAt"] = synced_at

    before = json.dumps(record["entity"], sort_keys=True, ensure_ascii=False)
    after = json.dumps(next_entity, sort_keys=True, ensure_ascii=False)
    if before == after:
        return False

    if not dry_run:
        write_json(record["file_path"], next_entity)
    record["entity"] = next_entity
    return True


def fetch_programs(horizon_days: int, past_hours: int) -> List[Dict[str, Any]]:
    sql = f"""
    SELECT
      p.id::text AS id,
      p.channel_id,
      p.title,
      COALESCE(p.genre, '') AS genre,
      p.start_time::text AS start_time,
      p.end_time::text AS end_time,
      p.date::text AS date,
      COALESCE(c.name, p.channel_id) AS channel_name
    FROM programs_fr p
    LEFT JOIN channels_fr c ON c.channel_id = p.channel_id
    WHERE p.end_time >= NOW()
      AND p.start_time < NOW() + INTERVAL '{int(horizon_days)} days'
      AND (
        p.genre ILIKE '%film%'
        OR p.genre ILIKE '%cinéma%'
        OR p.genre ILIKE '%cinema%'
        OR p.genre ILIKE '%movie%'
        OR p.genre ILIKE '%téléfilm%'
        OR p.genre ILIKE '%telefilm%'
        OR p.genre ILIKE '%série%'
        OR p.genre ILIKE '%serie%'
      )
    ORDER BY p.start_time ASC
    """

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cursor:
            cursor.execute(sql)
            columns = [description[0] for description in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
    finally:
        conn.close()


def actor_records(entities_dir: Path) -> List[Dict[str, Any]]:
    actor_dir = entities_dir / "actors"
    if not actor_dir.exists():
        return []

    records = []
    for file_path in sorted(actor_dir.glob("*.json")):
        entity = read_json(file_path)
        records.append({
            "type": "actor",
            "slug": entity["slug"],
            "href": f"/acteur/{entity['slug']}",
            "file_path": file_path,
            "entity": entity,
        })
    return records


def main() -> None:
    args = parse_args()
    entities_dir = Path(args.entities_dir) if args.entities_dir else DEFAULT_ENTITIES_DIR
    load_environment(args.env_file)

    if not entities_dir.exists():
        raise RuntimeError(f"entities-data directory not found: {entities_dir}")

    synced_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    film_lookup = load_entity_lookup(entities_dir, "film")
    series_lookup = load_entity_lookup(entities_dir, "series")

    programs = fetch_programs(args.horizon_days, args.past_hours)
    matched_airings: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    for program in programs:
        entity_type = infer_program_kind(program)
        if not entity_type:
            continue
        slug = slugify(canonical_title(entity_type, program.get("title")))
        record = film_lookup.get(slug) if entity_type == "film" else series_lookup.get(slug)
        if not record:
            continue
        matched_airings[f"{entity_type}:{record['slug']}"].append(build_airing(program))

    changed = {"film": [], "series": [], "actor": []}
    work_map: Dict[str, Dict[str, Any]] = {}

    unique_work_records = {}
    for record in list(film_lookup.values()) + list(series_lookup.values()):
        unique_work_records.setdefault(f"{record['type']}:{record['slug']}", record)

    for key, record in unique_work_records.items():
        if update_entity_record(record, matched_airings.get(key, []), synced_at, args.max_airings, args.dry_run):
            changed[record["type"]].append(record["href"])
        work_map[key] = record

    for record in actor_records(entities_dir):
        if update_actor_record(record, work_map, synced_at, args.dry_run):
            changed["actor"].append(record["href"])

    payload = {
        "syncedAt": synced_at,
        "horizonDays": args.horizon_days,
        "pastHours": args.past_hours,
        "queryCount": 1,
        "programRowsFetched": len(programs),
        "matchedEntityPrograms": sum(len(items) for items in matched_airings.values()),
        "changedCounts": {
            "film": len(changed["film"]),
            "series": len(changed["series"]),
            "actor": len(changed["actor"]),
        },
        "changedRoutes": changed["film"] + changed["series"] + changed["actor"],
        "dryRun": args.dry_run,
    }

    meta_file = entities_dir / "airings-sync-meta.json"
    changed_file = entities_dir / "changed-entities.json"
    if not args.dry_run:
        write_json(meta_file, payload)
        write_json(changed_file, payload)

    print(f"✅ Entity airings sync completed{' (dry-run)' if args.dry_run else ''}")
    print("   Supabase / Postgres queries: 1")
    print(f"   Program rows fetched: {payload['programRowsFetched']}")
    print(f"   Matched entity programs: {payload['matchedEntityPrograms']}")
    print(f"   Changed films: {payload['changedCounts']['film']}")
    print(f"   Changed series: {payload['changedCounts']['series']}")
    print(f"   Changed actors: {payload['changedCounts']['actor']}")
    if args.dry_run:
        print("   No files written")
    else:
        print(f"   Wrote: {meta_file}")
        print(f"   Wrote: {changed_file}")


if __name__ == "__main__":
    main()
