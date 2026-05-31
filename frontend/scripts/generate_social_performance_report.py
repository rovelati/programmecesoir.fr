#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import json
import os
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import requests
from requests_oauthlib import OAuth1


TIMEZONE = "Europe/Paris"
PARIS_TZ = ZoneInfo(TIMEZONE)
SITE_URL = "https://programmecesoir.fr"
DEFAULT_X_HANDLE = "programmecesoir"
DEFAULT_BLUESKY_IDENTIFIER = "programmecesoir.bsky.social"
X_TWEET_LOOKUP_URL = "https://api.x.com/2/tweets/{tweet_id}"
BLUESKY_POST_LOOKUP_URL = "https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts"


@dataclass
class SocialRow:
    created_at: str | None
    post_date: str | None
    post_type: str
    platform: str
    post_text: str | None
    post_id: str | None
    status: str
    error_msg: str | None


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


def get_env(*names: str, required: bool = False) -> str | None:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    if required:
        raise RuntimeError(f"Missing env: {names[0]}")
    return None


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


def sql_text(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def fetch_recent_social_rows(limit: int, platforms: list[str] | None = None) -> list[SocialRow]:
    platforms = [platform for platform in (platforms or ["bluesky"]) if platform]
    platform_sql = ", ".join(sql_text(platform) for platform in platforms)
    sql = f"""
      SELECT COALESCE(json_agg(row_to_json(t) ORDER BY created_at DESC), '[]'::json)
      FROM (
        SELECT
          created_at,
          post_date::text AS post_date,
          post_type,
          platform,
          post_text,
          post_id,
          status,
          error_msg
        FROM social_posts_log
        WHERE platform IN ({platform_sql})
        ORDER BY created_at DESC
        LIMIT {max(1, int(limit))}
      ) t;
    """
    rows = run_psql_json(sql, [])
    result: list[SocialRow] = []
    for row in rows or []:
        result.append(
            SocialRow(
                created_at=row.get("created_at"),
                post_date=row.get("post_date"),
                post_type=row.get("post_type") or "unknown",
                platform=row.get("platform") or "unknown",
                post_text=row.get("post_text"),
                post_id=row.get("post_id"),
                status=row.get("status") or "unknown",
                error_msg=row.get("error_msg"),
            )
        )
    return result


def get_x_auth() -> OAuth1 | None:
    consumer_key = get_env("X_CONSUMER_KEY", "X_API_KEY")
    consumer_secret = get_env("X_CONSUMER_KEY_SECRET", "X_API_KEY_SECRET")
    access_token = get_env("X_ACCESS_TOKEN")
    access_token_secret = get_env("X_ACCESS_TOKEN_SECRET")
    if not (consumer_key and consumer_secret and access_token and access_token_secret):
        return None
    return OAuth1(consumer_key, consumer_secret, access_token, access_token_secret)


def build_x_post_url(post_id: str | None) -> str | None:
    if not post_id:
        return None
    handle = get_env("X_ACCOUNT_HANDLE", "X_HANDLE") or DEFAULT_X_HANDLE
    return f"https://x.com/{handle}/status/{post_id}"


def fetch_x_metrics(post_id: str, auth: OAuth1 | None) -> dict[str, Any]:
    if not auth:
        return {}
    try:
        response = requests.get(
            X_TWEET_LOOKUP_URL.format(tweet_id=post_id),
            params={"tweet.fields": "created_at,public_metrics,organic_metrics,non_public_metrics"},
            auth=auth,
            timeout=30,
        )
        if not response.ok:
            return {"error": f"{response.status_code}: {response.text[:240]}"}
        data = response.json().get("data", {})
        public_metrics = data.get("public_metrics") or {}
        organic_metrics = data.get("organic_metrics") or {}
        non_public_metrics = data.get("non_public_metrics") or {}
        return {
            "createdAt": data.get("created_at"),
            "impressions": organic_metrics.get("impression_count") or public_metrics.get("impression_count") or non_public_metrics.get("impression_count"),
            "linkClicks": organic_metrics.get("url_link_clicks") or non_public_metrics.get("url_link_clicks"),
            "profileClicks": organic_metrics.get("user_profile_clicks") or non_public_metrics.get("user_profile_clicks"),
            "engagements": non_public_metrics.get("engagements"),
            "likes": public_metrics.get("like_count") or organic_metrics.get("like_count"),
            "reposts": public_metrics.get("retweet_count") or organic_metrics.get("retweet_count"),
            "replies": public_metrics.get("reply_count") or organic_metrics.get("reply_count"),
            "quotes": public_metrics.get("quote_count"),
            "bookmarks": public_metrics.get("bookmark_count"),
        }
    except Exception as exc:
        return {"error": str(exc)}


def parse_bluesky_rkey(uri: str | None) -> str | None:
    if not uri:
        return None
    match = re.search(r"/app\.bsky\.feed\.post/([^/]+)$", uri)
    return match.group(1) if match else None


def build_bluesky_fallback_url(uri: str | None) -> str | None:
    rkey = parse_bluesky_rkey(uri)
    if not rkey:
        return None
    handle = get_env("BLUESKY_IDENTIFIER", "BLUESKY_HANDLE") or DEFAULT_BLUESKY_IDENTIFIER
    return f"https://bsky.app/profile/{handle}/post/{rkey}"


def fetch_bluesky_metrics(uri: str) -> dict[str, Any]:
    try:
        response = requests.get(
            BLUESKY_POST_LOOKUP_URL,
            params={"uris": uri},
            timeout=30,
        )
        if not response.ok:
            return {"error": f"{response.status_code}: {response.text[:240]}", "url": build_bluesky_fallback_url(uri)}
        posts = response.json().get("posts") or []
        if not posts:
            return {"url": build_bluesky_fallback_url(uri)}
        post = posts[0]
        handle = ((post.get("author") or {}).get("handle")) or (get_env("BLUESKY_IDENTIFIER", "BLUESKY_HANDLE") or DEFAULT_BLUESKY_IDENTIFIER)
        rkey = parse_bluesky_rkey(post.get("uri") or uri)
        url = f"https://bsky.app/profile/{handle}/post/{rkey}" if rkey else build_bluesky_fallback_url(uri)
        return {
            "createdAt": (post.get("record") or {}).get("createdAt") or post.get("indexedAt"),
            "indexedAt": post.get("indexedAt"),
            "likes": post.get("likeCount"),
            "reposts": post.get("repostCount"),
            "replies": post.get("replyCount"),
            "quotes": post.get("quoteCount"),
            "bookmarks": post.get("bookmarkCount"),
            "url": url,
            "handle": handle,
        }
    except Exception as exc:
        return {"error": str(exc), "url": build_bluesky_fallback_url(uri)}


def build_empty_summary() -> dict[str, Any]:
    return {
        "posts": 0,
        "success": 0,
        "errors": 0,
        "skipped": 0,
        "impressions": 0,
        "linkClicks": 0,
        "engagements": 0,
        "likes": 0,
        "reposts": 0,
        "replies": 0,
        "quotes": 0,
    }


def to_int(value: Any) -> int:
    try:
        return int(value)
    except Exception:
        return 0


def enrich_rows(rows: list[SocialRow]) -> dict[str, Any]:
    x_auth = get_x_auth()
    results: list[dict[str, Any]] = []
    by_platform = {
        "x": build_empty_summary(),
        "bluesky": build_empty_summary(),
    }

    for row in rows:
        platform_key = row.platform if row.platform in by_platform else "bluesky"
        by_platform.setdefault(platform_key, build_empty_summary())
        by_platform[platform_key]["posts"] += 1
        if row.status == "success":
            by_platform[platform_key]["success"] += 1
        elif row.status == "error":
            by_platform[platform_key]["errors"] += 1
        elif row.status == "skipped":
            by_platform[platform_key]["skipped"] += 1

        metrics: dict[str, Any] = {}
        post_url: str | None = None
        if row.platform == "x" and row.post_id and row.status == "success":
            metrics = fetch_x_metrics(row.post_id, x_auth)
            post_url = build_x_post_url(row.post_id)
        elif row.platform == "bluesky" and row.post_id and row.status == "success":
            metrics = fetch_bluesky_metrics(row.post_id)
            post_url = metrics.get("url") or build_bluesky_fallback_url(row.post_id)

        by_platform[platform_key]["impressions"] += to_int(metrics.get("impressions"))
        by_platform[platform_key]["linkClicks"] += to_int(metrics.get("linkClicks"))
        by_platform[platform_key]["engagements"] += to_int(metrics.get("engagements"))
        by_platform[platform_key]["likes"] += to_int(metrics.get("likes"))
        by_platform[platform_key]["reposts"] += to_int(metrics.get("reposts"))
        by_platform[platform_key]["replies"] += to_int(metrics.get("replies"))
        by_platform[platform_key]["quotes"] += to_int(metrics.get("quotes"))

        impressions = to_int(metrics.get("impressions"))
        link_clicks = to_int(metrics.get("linkClicks"))
        ctr = round((link_clicks / impressions) * 100, 2) if impressions > 0 else None

        results.append(
            {
                "platform": row.platform,
                "postType": row.post_type,
                "status": row.status,
                "createdAt": row.created_at,
                "postDate": row.post_date,
                "postText": row.post_text,
                "postId": row.post_id,
                "postUrl": post_url,
                "errorMsg": row.error_msg,
                "metrics": {
                    "impressions": metrics.get("impressions"),
                    "linkClicks": metrics.get("linkClicks"),
                    "profileClicks": metrics.get("profileClicks"),
                    "engagements": metrics.get("engagements"),
                    "likes": metrics.get("likes"),
                    "reposts": metrics.get("reposts"),
                    "replies": metrics.get("replies"),
                    "quotes": metrics.get("quotes"),
                    "bookmarks": metrics.get("bookmarks"),
                    "ctr": ctr,
                    "sourceCreatedAt": metrics.get("createdAt"),
                    "indexedAt": metrics.get("indexedAt"),
                    "error": metrics.get("error"),
                },
            }
        )

    total_posts = len(results)
    total_success = sum(1 for row in results if row["status"] == "success")
    total_errors = sum(1 for row in results if row["status"] == "error")
    total_skipped = sum(1 for row in results if row["status"] == "skipped")

    return {
        "summary": {
            "total": total_posts,
            "success": total_success,
            "errors": total_errors,
            "skipped": total_skipped,
            "x": by_platform.get("x", build_empty_summary()),
            "bluesky": by_platform.get("bluesky", build_empty_summary()),
        },
        "posts": results,
    }


def build_payload(rows: list[SocialRow]) -> dict[str, Any]:
    enriched = enrich_rows(rows)
    return {
        "ok": True,
        "generatedAt": datetime.now(PARIS_TZ).isoformat(),
        "source": "social_posts_log + Bluesky public API",
        "notes": {
            "description": "Suivi éditorial des derniers posts Bluesky avec métriques publiques quand disponibles.",
            "clicksTrackedOnX": False,
            "blueskyPublicMetricsOnly": True,
        },
        "summary": enriched["summary"],
        "posts": enriched["posts"],
    }


def write_payload(output_path: Path, payload: dict[str, Any]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate social performance report for admin console")
    parser.add_argument("--env-file", default=None)
    parser.add_argument("--output", default=None)
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--stdout", action="store_true")
    args = parser.parse_args()

    load_default_env()
    if args.env_file:
        load_env_file(Path(args.env_file))

    root_dir = Path(__file__).resolve().parents[2]
    default_output = root_dir / "frontend" / "scripts" / ".cache" / "social-performance-latest.json"
    output_path = Path(args.output) if args.output else default_output

    rows = fetch_recent_social_rows(args.limit, platforms=["bluesky"])
    payload = build_payload(rows)
    write_payload(output_path, payload)

    if args.stdout:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(f"✅ Social performance report written: {output_path}")


if __name__ == "__main__":
    main()
