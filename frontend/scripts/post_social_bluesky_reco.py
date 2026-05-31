#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import requests


TIMEZONE = "Europe/Paris"
PARIS_TZ = ZoneInfo(TIMEZONE)
SITE_URL = "https://programmecesoir.fr"
TOGETHER_MODEL = "black-forest-labs/FLUX.1-schnell"
DEFAULT_OG_IMAGE = f"{SITE_URL}/static/img/programmecesoir-social.jpg"
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
TOGETHER_URL = "https://api.together.xyz/v1/images/generations"
DEFAULT_BLUESKY_IDENTIFIER = "programmecesoir.bsky.social"
DEFAULT_BLUESKY_SERVICE = "https://bsky.social"
EDITORIAL_RECO_PROFILE = {
    "ages": [30, 42],
    "genders": ["Femme", "Homme"],
}
EDITORIAL_SPORT_PROFILE = {
    "ages": [28, 40],
    "genders": ["Homme", "Femme"],
}
HEAD_CHANNEL_IDS = {
    "tf1",
    "france-2",
    "france-3",
    "canal-plus",
    "canal",
    "france-5",
    "m6",
    "arte",
    "c8",
    "w9",
    "tmc",
    "tfx",
    "nrj12",
    "lci",
    "france-4",
    "bfm-tv",
    "bfmtv",
    "cnews",
    "cstar",
    "gulli",
    "6ter",
    "rmc-decouverte",
    "rmc-story",
    "franceinfo",
    "france-info",
}
CHANNEL_ROUTE_OVERRIDES = {
    "canal": "canal-plus",
    "canalplus": "canal-plus",
    "bfmtv": "bfm-tv",
    "france-info": "franceinfo",
}
DISALLOWED_CHANNEL_PATTERNS = (
    r"brazzers",
    r"dorcel",
    r"playboy",
    r"xxl",
    r"adult",
)


@dataclass
class ImageAsset:
    buffer: bytes
    mime_type: str
    source_url: str | None = None


@dataclass
class SocialPayload:
    post_type: str
    text: str
    image: ImageAsset | None
    image_url: str | None


PAYLOAD_CACHE_DIR = Path(__file__).resolve().parent / "payload-cache"


def load_env_file(env_path: Path) -> None:
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#") or "=" not in trimmed:
            continue
        key, value = trimmed.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def load_default_env() -> None:
    root_dir = Path(__file__).resolve().parents[2]
    env_files = [
        root_dir / "frontend" / ".env",
        root_dir / "scripts" / ".env",
        root_dir / ".env-x",
    ]
    for env_file in env_files:
        load_env_file(env_file)

    if "DEEPSEEK_API_KEY" not in os.environ:
        deepseek_path = root_dir / "DEEPSEEK.md"
        if deepseek_path.exists():
            match = re.search(r"DEEPSEEK_API_KEY\s*=\s*(.+)", deepseek_path.read_text())
            if match:
                os.environ["DEEPSEEK_API_KEY"] = match.group(1).strip()

    if "TOGETHER_API_KEY" not in os.environ:
        together_path = root_dir / "together-api.md"
        if together_path.exists():
            match = re.search(r"api-user-programmecesoir:\s*(.+)", together_path.read_text())
            if match:
                os.environ["TOGETHER_API_KEY"] = match.group(1).strip()


def get_env(*names: str, required: bool = False) -> str | None:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    if required:
        raise RuntimeError(f"Missing env: {names[0]}")
    return None


def get_bluesky_password(required: bool = False) -> str | None:
    return get_env("BLUESKY_P", "BLUESKY_APP_PASSWORD", "BLUESKYPASSWDAPP", required=required)


def run_psql(sql: str) -> str:
    database_url = get_env("DATABASE_URL", required=True)
    try:
        import psycopg

        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(sql)
                if cur.description is None:
                    return ""
                row = cur.fetchone()
                if row is None:
                    return ""
                value = row[0]
                if isinstance(value, (dict, list)):
                    return json.dumps(value)
                return "" if value is None else str(value)
    except ImportError:
        pass

    return subprocess.check_output(
        ["psql", "-v", "ON_ERROR_STOP=1", "-qAt", database_url, "-c", sql],
        text=True,
    ).strip()


def run_psql_json(sql: str, fallback: Any) -> Any:
    output = run_psql(sql)
    if not output:
        return fallback
    try:
        return json.loads(output)
    except json.JSONDecodeError:
        try:
            return ast.literal_eval(output)
        except Exception:
            return fallback


def ensure_social_log_table() -> None:
    run_psql(
        """
        CREATE TABLE IF NOT EXISTS social_posts_log (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          created_at timestamptz DEFAULT now(),
          post_date date NOT NULL,
          post_type text NOT NULL,
          platform text NOT NULL,
          post_text text,
          post_id text,
          status text NOT NULL,
          error_msg text,
          UNIQUE (post_date, post_type, platform)
        );
        """
    )


def sql_text(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def get_today_iso() -> str:
    return datetime.now(PARIS_TZ).strftime("%Y-%m-%d")


def was_already_posted(post_type: str, today_iso: str) -> bool:
    sql = f"""
      SELECT COALESCE(json_build_object('status', status), 'null'::json)
      FROM (
        SELECT status
        FROM social_posts_log
        WHERE post_date = DATE {sql_text(today_iso)}
          AND post_type = {sql_text(post_type)}
          AND platform = 'bluesky'
        ORDER BY created_at DESC
        LIMIT 1
      ) t;
    """
    result = run_psql_json(sql, None)
    return bool(result and result.get("status") == "success")


def save_log(post_type: str, today_iso: str, status: str, text: str, post_id: str | None, error_msg: str | None) -> None:
    sql = f"""
      INSERT INTO social_posts_log (
        post_date,
        post_type,
        platform,
        post_text,
        post_id,
        status,
        error_msg
      ) VALUES (
        DATE {sql_text(today_iso)},
        {sql_text(post_type)},
        'bluesky',
        {sql_text(text)},
        {sql_text(post_id)},
        {sql_text(status)},
        {sql_text(error_msg)}
      )
      ON CONFLICT (post_date, post_type, platform)
      DO UPDATE SET
        post_text = EXCLUDED.post_text,
        post_id = EXCLUDED.post_id,
        status = EXCLUDED.status,
        error_msg = EXCLUDED.error_msg;
    """
    run_psql(sql)


def truncate_text(value: str, max_chars: int) -> str:
    text = re.sub(r"\s+", " ", value or "").strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1].rstrip() + "…"


def strip_html(value: str | None) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", value or "")).strip()


def slugify(value: str) -> str:
    import unicodedata

    normalized = unicodedata.normalize("NFD", value.lower())
    normalized = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized)
    return normalized.strip("-")


def get_now_label(date_time: str | None) -> str:
    if not date_time:
        return ""
    dt = datetime.fromisoformat(date_time.replace("Z", "+00:00"))
    return dt.astimezone(PARIS_TZ).strftime("%H:%M")


def get_display_time(row: dict[str, Any]) -> str:
    display_time = row.get("display_time")
    if display_time:
        return str(display_time)[:5]
    return get_now_label(row.get("start_time"))


def normalize_channel_route(channel_id: str | None) -> str:
    raw = slugify(str(channel_id or ""))
    return CHANNEL_ROUTE_OVERRIDES.get(raw, raw)


def is_disallowed_channel(channel_id: str | None, channel_name: str | None = None) -> bool:
    haystack = " ".join(filter(None, [str(channel_id or ""), str(channel_name or "")])).lower()
    return any(re.search(pattern, haystack) for pattern in DISALLOWED_CHANNEL_PATTERNS)


def build_head_url(channel_id: str | None, fallback_path: str) -> str:
    normalized = normalize_channel_route(channel_id)
    if normalized and not is_disallowed_channel(normalized) and re.match(r"^[a-z0-9-]+$", normalized):
        return f"{SITE_URL}/{normalized}"
    if normalized and normalized in HEAD_CHANNEL_IDS:
        return f"{SITE_URL}/{normalized}"
    return f"{SITE_URL}{fallback_path}"


def infer_mime_type(url: str | None, content_type: str | None) -> str:
    content_type = (content_type or "").lower()
    if "png" in content_type:
        return "image/png"
    if "webp" in content_type:
        return "image/webp"
    if "gif" in content_type:
        return "image/gif"
    return "image/jpeg"


def extension_for_mime(mime_type: str | None) -> str:
    mime = (mime_type or "").lower()
    if "png" in mime:
        return "png"
    if "webp" in mime:
        return "webp"
    if "gif" in mime:
        return "gif"
    return "jpg"


def fetch_image_buffer(url: str | None) -> ImageAsset | None:
    if not url:
        return None
    try:
        response = requests.get(url, timeout=60)
        response.raise_for_status()
        return ImageAsset(
            buffer=response.content,
            mime_type=infer_mime_type(url, response.headers.get("content-type")),
            source_url=url,
        )
    except Exception:
        return None


def get_payload_cache_paths(today_iso: str, mode: str) -> tuple[Path, Path]:
    cache_dir = PAYLOAD_CACHE_DIR / today_iso
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / f"{mode}.json", cache_dir


def load_cached_payload(today_iso: str, mode: str) -> SocialPayload | None:
    json_path, cache_dir = get_payload_cache_paths(today_iso, mode)
    if not json_path.exists():
        return None
    try:
        payload = json.loads(json_path.read_text(encoding="utf-8"))
        image = None
        image_name = payload.get("image_name")
        if image_name:
            image_path = cache_dir / str(image_name)
            if image_path.exists():
                image = ImageAsset(
                    buffer=image_path.read_bytes(),
                    mime_type=str(payload.get("image_mime_type") or "image/jpeg"),
                    source_url=payload.get("image_url"),
                )
        return SocialPayload(
            post_type=str(payload.get("post_type") or ("post5" if mode == "film" else "post6")),
            text=str(payload.get("text") or ""),
            image=image,
            image_url=payload.get("image_url"),
        )
    except Exception:
        return None


def save_cached_payload(today_iso: str, mode: str, payload: SocialPayload) -> None:
    json_path, cache_dir = get_payload_cache_paths(today_iso, mode)
    image_name = None
    image_mime_type = None
    if payload.image:
        ext = extension_for_mime(payload.image.mime_type)
        image_name = f"{mode}.{ext}"
        (cache_dir / image_name).write_bytes(payload.image.buffer)
        image_mime_type = payload.image.mime_type
    data = {
        "cached_at": datetime.now(PARIS_TZ).isoformat(),
        "post_type": payload.post_type,
        "text": payload.text,
        "image_url": payload.image_url,
        "image_name": image_name,
        "image_mime_type": image_mime_type,
    }
    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def call_deepseek(prompt: str, fallback_text: str, max_chars: int) -> str:
    api_key = get_env("DEEPSEEK_API_KEY")
    if not api_key:
        return truncate_text(fallback_text, max_chars)
    try:
        response = requests.post(
            DEEPSEEK_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            json={
                "model": "deepseek-chat",
                "temperature": 0.8,
                "max_tokens": int(os.getenv("DEEPSEEK_MAX_TOKENS", "800")),
                "messages": [
                    {
                        "role": "system",
                        "content": f"Tu écris des posts Bluesky pour un guide TV français. Réponds uniquement avec le texte final du post, sans guillemets, sans markdown, en moins de {max_chars} caractères.",
                    },
                    {"role": "user", "content": prompt},
                ],
            },
            timeout=int(os.getenv("DEEPSEEK_TIMEOUT_MS", "120000")) / 1000,
        )
        if not response.ok:
            return truncate_text(fallback_text, max_chars)
        data = response.json()
        text = data.get("choices", [{}])[0].get("message", {}).get("content", fallback_text)
        return truncate_text(text, max_chars)
    except Exception:
        return truncate_text(fallback_text, max_chars)


def generate_together_image(prompt: str, width: int, height: int) -> ImageAsset | None:
    api_key = get_env("TOGETHER_API_KEY")
    if not api_key:
        return None
    try:
        response = requests.post(
            TOGETHER_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": TOGETHER_MODEL,
                "prompt": prompt,
                "width": width,
                "height": height,
                "steps": 4,
                "n": 1,
                "response_format": "url",
                "output_format": "jpeg",
            },
            timeout=120,
        )
        response.raise_for_status()
        image_url = response.json()["data"][0]["url"]
        return fetch_image_buffer(image_url)
    except Exception:
        return None


def get_recommended_genres(age: int, gender: str) -> dict[str, int]:
    scores: dict[str, int] = {}
    if age < 12:
        return {"Jeunesse": 10, "Animation": 10, "Éducatif": 8}
    if 12 <= age < 18:
        scores.update({"Série": 9, "Séries": 9, "Musique": 8, "Réalité": 7, "Divertissement": 6, "Cinéma": 6, "Film": 6, "Sitcom": 8, "Découverte": 5})
    if 18 <= age < 35:
        scores.update({"Série": 9, "Séries": 9, "Film": 8, "Cinéma": 8, "Sport": 7, "Divertissement": 6, "Crime": 7, "Musique": 6, "Découverte": 5})
    if 35 <= age < 60:
        scores.update({"Film": 8, "Cinéma": 8, "Actualités": 7, "Information": 7, "Sport": 7, "Crime": 6, "Divertissement": 6, "Documentaire": 5, "Découverte": 6, "Série": 5})
    if age >= 60:
        scores.update({"Information": 9, "Actualités": 9, "Soap": 8, "Magazine": 7, "Divertissement": 7, "Film": 6, "Théâtre": 6, "Découverte": 7, "Documentaire": 6})
    if gender in {"M", "Homme"}:
        for key, boost in {"Sport": 5, "Crime": 2, "Actualités": 2, "Information": 2, "Documentaire": 2, "Découverte": 1}.items():
            scores[key] = scores.get(key, 0) + boost
    if gender in {"F", "Femme"}:
        for key, boost in {"Soap": 5, "Lifestyle": 4, "Réalité": 3, "Série": 2, "Divertissement": 2, "Talk-show": 2, "Musique": 2, "Découverte": 2}.items():
            scores[key] = scores.get(key, 0) + boost
    return scores


def build_genre_scores(profile: dict[str, Any], boosts: list[str]) -> dict[str, int]:
    merged: dict[str, int] = {}
    for age in profile["ages"]:
        for gender in profile["genders"]:
            partial = get_recommended_genres(age, gender)
            for genre, score in partial.items():
                merged[genre] = max(merged.get(genre, 0), int(score))
    for genre in boosts:
        merged[genre] = merged.get(genre, 0) + 10
    merged["Generico"] = merged.get("Generico", 0) + 1
    return merged


def compute_score(row: dict[str, Any], genre_scores: dict[str, int]) -> int:
    genre = str(row.get("genre") or "").strip()
    genre_lower = genre.lower()
    base_score = genre_scores.get(genre, 0)
    if base_score == 0:
        for key, value in genre_scores.items():
            if key.lower() in genre_lower or genre_lower in key.lower():
                base_score = value
                break
    if base_score == 0:
        base_score = 1
    start_hour = 21
    try:
        start_hour = datetime.fromisoformat(row["start_time"].replace("Z", "+00:00")).astimezone(PARIS_TZ).hour
    except Exception:
        pass
    score = base_score
    if 20 <= start_hour < 22:
        score += 3
    if 21 <= start_hour < 22:
        score += 1
    if int(row.get("channel_number") or 999) <= 10:
        score += 2
    return score


def query_rows(sql: str) -> list[dict[str, Any]]:
    return run_psql_json(sql, [])


def query_film_candidates(today_iso: str) -> list[dict[str, Any]]:
    rows = query_rows(
        f"""
        SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
        FROM (
          SELECT
            p.title, p.slug, p.genre, p.description, p.poster_url, p.start_time, p.end_time,
            to_char((p.start_time AT TIME ZONE '{TIMEZONE}'), 'HH24:MI') AS display_time,
            c.channel_id, c.name AS channel_name, COALESCE(c.channel_number, 9999) AS channel_number
          FROM programs_fr p
          LEFT JOIN channels_fr c ON c.channel_id = p.channel_id
          WHERE (p.start_time AT TIME ZONE '{TIMEZONE}')::date = DATE {sql_text(today_iso)}
            AND (p.start_time AT TIME ZONE '{TIMEZONE}')::time >= TIME '18:00'
            AND (p.start_time AT TIME ZONE '{TIMEZONE}')::time < TIME '23:30'
            AND (
              COALESCE(p.genre, '') ILIKE '%film%'
              OR COALESCE(p.genre, '') ILIKE '%cinéma%'
              OR COALESCE(p.genre, '') ILIKE '%cinema%'
              OR COALESCE(p.genre, '') ILIKE '%téléfilm%'
              OR COALESCE(p.genre, '') ILIKE '%telefilm%'
            )
          ORDER BY COALESCE(c.channel_number, 9999) ASC, p.start_time ASC
        ) t;
        """
    )
    scores = build_genre_scores(EDITORIAL_RECO_PROFILE, ["Film", "Cinéma", "Cinema", "Films", "Film d'animation"])
    ranked = []
    for row in rows:
        if not (row.get("channel_id") and row.get("slug") and row.get("title")):
            continue
        if is_disallowed_channel(row.get("channel_id"), row.get("channel_name")):
            continue
        row["score"] = compute_score(row, scores)
        normalized_route = normalize_channel_route(row.get("channel_id"))
        row["channel_route"] = normalized_route
        if normalized_route in HEAD_CHANNEL_IDS:
            row["score"] += 8
        if int(row.get("channel_number") or 9999) <= 25:
            row["score"] += 3
        genre = str(row.get("genre") or "").lower()
        if "téléfilm" in genre or "telefilm" in genre:
            row["score"] -= 1
        ranked.append(row)
    ranked.sort(key=lambda r: (-r["score"], int(r.get("channel_number") or 9999), r.get("start_time") or ""))
    return ranked


def query_chosen_film(today_iso: str) -> dict[str, Any] | None:
    ranked = query_film_candidates(today_iso)
    if not ranked:
        return None

    for selector in (
        lambda row: str(row.get("channel_route") or "") in HEAD_CHANNEL_IDS,
        lambda row: int(row.get("channel_number") or 9999) <= 25,
        lambda row: True,
    ):
        subset = [row for row in ranked if selector(row)]
        if subset:
            return subset[0]
    return None


def query_chosen_sport(today_iso: str) -> dict[str, Any] | None:
    rows = query_rows(
        f"""
        SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
        FROM (
          SELECT
            p.title, p.slug, p.genre, p.description, p.poster_url, p.start_time, p.end_time,
            to_char((p.start_time AT TIME ZONE '{TIMEZONE}'), 'HH24:MI') AS display_time,
            c.channel_id, c.name AS channel_name, COALESCE(c.channel_number, 9999) AS channel_number
          FROM programs_fr p
          LEFT JOIN channels_fr c ON c.channel_id = p.channel_id
          WHERE (p.start_time AT TIME ZONE '{TIMEZONE}')::date = DATE {sql_text(today_iso)}
            AND (p.start_time AT TIME ZONE '{TIMEZONE}')::time >= TIME '18:00'
            AND (p.start_time AT TIME ZONE '{TIMEZONE}')::time < TIME '23:30'
            AND (
              COALESCE(p.genre, '') ILIKE '%sport%'
              OR COALESCE(p.genre, '') ILIKE '%football%'
              OR COALESCE(p.genre, '') ILIKE '%rugby%'
              OR COALESCE(p.genre, '') ILIKE '%tennis%'
              OR COALESCE(p.genre, '') ILIKE '%cyclisme%'
              OR COALESCE(p.genre, '') ILIKE '%basket%'
              OR COALESCE(p.genre, '') ILIKE '%golf%'
            )
          ORDER BY COALESCE(c.channel_number, 9999) ASC, p.start_time ASC
        ) t;
        """
    )
    scores = build_genre_scores(EDITORIAL_SPORT_PROFILE, ["Sport", "Magazine sportif", "Football", "Rugby", "Tennis", "Cyclisme", "Basket", "Golf", "Formule 1"])
    ranked = []
    for row in rows:
        title = str(row.get("title") or "").lower()
        channel = str(row.get("channel_name") or "").lower()
        if not (row.get("channel_id") and row.get("slug") and row.get("title")):
            continue
        if not row.get("description") and re.search(r"360|live\s+\d+|vivez en direct|a bient[oô]t", title):
            continue
        if re.match(r"^eurosport 360", title):
            continue
        if re.match(r"^ligue 1\+\s+\d+", title):
            continue
        if re.match(r"^vivez en direct les [ée]v[ée]nements", title):
            continue
        if re.search(r"brazzers|dorcel|playboy|xxl", channel):
            continue
        row["score"] = compute_score(row, scores)
        if row.get("description"):
            row["score"] += 3
        if int(row.get("channel_number") or 9999) <= 18:
            row["score"] += 4
        if re.search(r"stade 2|masters|tour des flandres|nba|ligue 1|roland|champions", title):
            row["score"] += 3
        if "quotidienne" in title:
            row["score"] -= 2
        ranked.append(row)
    ranked.sort(key=lambda r: (-r["score"], int(r.get("channel_number") or 9999), r.get("start_time") or ""))
    return ranked[0] if ranked else None


def resolve_film_image(row: dict[str, Any]) -> tuple[ImageAsset | None, str | None]:
    if row.get("poster_url"):
        image = fetch_image_buffer(row["poster_url"])
        if image:
            return image, row["poster_url"]
    image = generate_together_image(
        " ".join(
            [
                f"Vertical 9:16 cinematic poster inspired by the film '{row['title']}'.",
                f"Mood and story cues: {strip_html(row.get('description') or row.get('genre') or 'soirée cinéma française')}.",
                "Elegant editorial key art, premium French TV magazine style, strong central composition, dramatic lighting, refined color palette, theatrical poster feeling.",
                "Avoid generic television screens, avoid text, avoid watermark, avoid logos, no collage, no split panels.",
            ]
        ),
        1024,
        1792,
    )
    return image, image.source_url if image else None


def resolve_sport_image(row: dict[str, Any]) -> tuple[ImageAsset | None, str | None]:
    image = generate_together_image(
        " ".join(
            [
                f"Vertical 9:16 premium sports editorial poster inspired by '{row['title']}'.",
                f"Context: {strip_html(row.get('description') or row.get('genre') or 'grand rendez-vous sportif à la télévision')}.",
                "Dynamic composition, one iconic sporting moment, dramatic stadium or arena atmosphere, premium magazine cover style, strong subject focus, cinematic lighting.",
                "No television screens, no collage, no split layout, no text, no watermark, no logos.",
            ]
        ),
        1024,
        1792,
    )
    return image, image.source_url if image else None


def build_post5(today_iso: str) -> SocialPayload | None:
    row = query_chosen_film(today_iso)
    if not row:
        fallback_url = f"{SITE_URL}/film-ce-soir"
        fallback = "🎬 Choisi pour vous ce soir : notre sélection cinéma du jour est à retrouver sur Programme Ce Soir. Les films diffusés ce soir sont regroupés par chaîne pour aller vite à l’essentiel. "
        text = truncate_text(f"{fallback}{fallback_url} #ChoisiPourVous #ProgrammeCeSoir", 260)
        return SocialPayload("post5", text, None, DEFAULT_OG_IMAGE)
    hour = get_display_time(row)
    target_url = build_head_url(row.get("channel_id"), "/film-ce-soir")
    fallback = truncate_text(
        f"🎬 Choisi pour vous ce soir : {row['title']} à {hour} sur {row['channel_name']}. Le meilleur point d’entrée pour cette soirée cinéma reste la page {row['channel_name']} avec la programmation du diffuseur. {target_url} #ChoisiPourVous #ProgrammeCeSoir",
        260,
    )
    text = call_deepseek(
        "\n".join(
            [
                "Rédige un post Bluesky de moins de 300 caractères.",
                f"Titre: {row['title']}",
                f"Chaîne: {row['channel_name']}",
                f"Heure: {hour}",
                f"Genre: {row['genre']}",
                f"Description: {strip_html(row.get('description'))}",
                'Angle: "Choisi pour vous · film ce soir", sélection issue du moteur recommandations du site.',
                "Contraintes:",
                "- commencer par 🎬",
                '- inclure "Choisi pour vous ce soir"',
                "- ton éditorial, premium, pas criard",
                "- expliquer en une phrase pourquoi ce film mérite le prime time",
                "- orienter clairement vers la page du canal diffuseur, pas vers la fiche programme",
                f"- inclure l'URL {target_url}",
                "- finir avec #ChoisiPourVous #ProgrammeCeSoir",
            ]
        ),
        fallback,
        260,
    )
    if "#ProgrammeCeSoir" not in text or "choisi pour vous" not in text.lower() or target_url not in text:
        text = fallback
    image, image_url = resolve_film_image(row)
    return SocialPayload("post5", text, image, image_url)


def build_post6(today_iso: str) -> SocialPayload | None:
    row = query_chosen_sport(today_iso)
    if not row:
        return None
    hour = get_display_time(row)
    target_url = build_head_url(row.get("channel_id"), "/sport-ce-soir")
    fallback = truncate_text(
        f"🏅 Choisi pour vous ce soir : {row['title']} sur {row['channel_name']} à {hour}. Notre moteur recommandations retient ce rendez-vous sport pour une soirée intense et accessible. {target_url} #ChoisiPourVous #ProgrammeCeSoir",
        260,
    )
    text = call_deepseek(
        "\n".join(
            [
                "Rédige un post Bluesky de moins de 300 caractères.",
                f"Titre: {row['title']}",
                f"Chaîne: {row['channel_name']}",
                f"Heure: {hour}",
                f"Genre: {row['genre']}",
                f"Description: {strip_html(row.get('description'))}",
                'Angle: "Choisi pour vous · sport du soir", sélection issue du moteur recommandations du site.',
                "Contraintes:",
                "- commencer par 🏅",
                '- inclure "Choisi pour vous ce soir"',
                "- ton éditorial, dynamique, premium",
                "- expliquer en une phrase pourquoi ce rendez-vous sport vaut le détour",
                f"- inclure l'URL {target_url}",
                "- finir avec #ChoisiPourVous #ProgrammeCeSoir",
            ]
        ),
        fallback,
        260,
    )
    if "#ProgrammeCeSoir" not in text or "choisi pour vous" not in text.lower() or target_url not in text:
        text = fallback
    image, image_url = resolve_sport_image(row)
    return SocialPayload("post6", text, image, image_url)


def build_payload(mode: str, today_iso: str) -> SocialPayload | None:
    if mode == "film":
        return build_post5(today_iso)
    if mode == "sport":
        return build_post6(today_iso)
    raise RuntimeError(f"Unsupported mode: {mode}")


def get_or_build_payload(mode: str, today_iso: str, force_regenerate: bool = False) -> tuple[SocialPayload | None, str]:
    if not force_regenerate:
        cached = load_cached_payload(today_iso, mode)
        if cached and cached.text:
            return cached, "cache"
    payload = build_payload(mode, today_iso)
    if payload:
        save_cached_payload(today_iso, mode, payload)
    return payload, "generated"


def create_bluesky_session() -> dict[str, str]:
    identifier = get_env("BLUESKY_IDENTIFIER", "BLUESKY_HANDLE") or DEFAULT_BLUESKY_IDENTIFIER
    password = get_bluesky_password(required=True)
    service = get_env("BLUESKY_SERVICE_URL") or DEFAULT_BLUESKY_SERVICE
    response = requests.post(
        f"{service}/xrpc/com.atproto.server.createSession",
        json={"identifier": identifier, "password": password},
        timeout=60,
    )
    if not response.ok:
        raise RuntimeError(f"Bluesky login failed: {response.status_code} {response.text}")
    data = response.json()
    return {
        "did": data["did"],
        "accessJwt": data["accessJwt"],
        "serviceUrl": data.get("didDoc", {}).get("service", [{}])[0].get("serviceEndpoint") or service,
        "handle": data.get("handle") or identifier,
    }


def upload_bluesky_blob(session: dict[str, str], image: ImageAsset) -> dict[str, Any]:
    response = requests.post(
        f"{session['serviceUrl']}/xrpc/com.atproto.repo.uploadBlob",
        headers={
            "Authorization": f"Bearer {session['accessJwt']}",
            "Content-Type": image.mime_type,
        },
        data=image.buffer,
        timeout=120,
    )
    if not response.ok:
        raise RuntimeError(f"Bluesky blob upload failed: {response.status_code} {response.text}")
    return response.json()["blob"]


def post_to_bluesky(payload: SocialPayload, dry_run: bool) -> str | None:
    if dry_run:
        print("\n--- DRY RUN ---")
        print(payload.post_type)
        print(payload.text)
        print(f"image: {payload.image_url or 'generated-or-none'}")
        return None

    session = create_bluesky_session()
    record: dict[str, Any] = {
        "$type": "app.bsky.feed.post",
        "text": payload.text,
        "createdAt": datetime.utcnow().isoformat(timespec="milliseconds") + "Z",
    }
    if payload.image:
        blob = upload_bluesky_blob(session, payload.image)
        record["embed"] = {
            "$type": "app.bsky.embed.images",
            "images": [
                {
                    "alt": "Programme Ce Soir",
                    "image": blob,
                }
            ],
        }

    response = requests.post(
        f"{session['serviceUrl']}/xrpc/com.atproto.repo.createRecord",
        headers={
            "Authorization": f"Bearer {session['accessJwt']}",
            "Content-Type": "application/json",
        },
        json={
            "repo": session["did"],
            "collection": "app.bsky.feed.post",
            "record": record,
        },
        timeout=120,
    )
    if not response.ok:
        raise RuntimeError(f"Bluesky post failed: {response.status_code} {response.text}")
    return str(response.json().get("uri"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", default=None)
    parser.add_argument("--mode", choices=["film", "sport"], required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force-regenerate", action="store_true")
    args = parser.parse_args()

    load_default_env()
    if args.env_file:
        load_env_file(Path(args.env_file))

    ensure_social_log_table()

    today_iso = get_today_iso()
    post_type = "post5" if args.mode == "film" else "post6"
    payload, payload_source = get_or_build_payload(args.mode, today_iso, force_regenerate=args.force_regenerate)
    if not payload:
        save_log(post_type, today_iso, "skipped", "", None, "No content available")
        print(f"[social:bluesky:server] no payload for {args.mode}")
        return 0

    if was_already_posted(post_type, today_iso) and not args.dry_run:
        print(f"[social:bluesky:server] {post_type} already posted today, skipping")
        return 0

    try:
        post_id = post_to_bluesky(payload, args.dry_run)
        if not args.dry_run:
            save_log(post_type, today_iso, "success", payload.text, post_id, None)
        print(f"[social:bluesky:server] {payload.post_type} ready ({payload_source})" + (f" -> {post_id}" if post_id else ""))
        return 0
    except Exception as exc:
        if not args.dry_run:
            save_log(post_type, today_iso, "error", payload.text, None, str(exc))
        print(f"[social:bluesky:server] fatal: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
