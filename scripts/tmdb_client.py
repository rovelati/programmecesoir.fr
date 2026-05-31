#!/usr/bin/env python3
"""TMDB client for program image enrichment."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

import requests


TMDB_API_BASE = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500"


def normalize_text(value: str | None) -> str:
    return " ".join((value or "").strip().lower().split())


@dataclass
class TMDBMatch:
    tmdb_id: int
    poster_url: str
    title: str
    year: int | None = None


class TMDBClient:
    def __init__(
        self,
        api_key: str,
        logger: logging.Logger,
        timeout: int = 20,
        sleep_between_requests: float = 0.25,
        max_retries: int = 3,
    ) -> None:
        self.api_key = api_key
        self.logger = logger
        self.timeout = timeout
        self.sleep_between_requests = sleep_between_requests
        self.max_retries = max_retries
        self.session = requests.Session()

    def _request(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        url = f"{TMDB_API_BASE}{path}"
        merged_params = {"api_key": self.api_key, **params}
        last_error: Exception | None = None

        for attempt in range(1, self.max_retries + 1):
            try:
                response = self.session.get(url, params=merged_params, timeout=self.timeout)
                if response.status_code in (429, 500, 502, 503, 504):
                    raise requests.HTTPError(
                        f"TMDB transient error {response.status_code}: {response.text[:200]}",
                        response=response,
                    )
                response.raise_for_status()
                return response.json()
            except Exception as exc:  # pragma: no cover - defensive retry branch
                last_error = exc
                if attempt >= self.max_retries:
                    break
                sleep_seconds = (2 ** (attempt - 1)) * self.sleep_between_requests
                self.logger.warning("TMDB retry %s/%s after error: %s", attempt, self.max_retries, exc)
                time.sleep(sleep_seconds)

        raise RuntimeError(f"TMDB request failed for {path}: {last_error}")

    def _search(self, path: str, query: str, year: int | None = None) -> list[dict[str, Any]]:
        query = (query or "").strip()
        if not query:
            return []

        results: list[dict[str, Any]] = []
        for language in ("fr-FR", None):
            params: dict[str, Any] = {"query": query}
            if language:
                params["language"] = language
            if year and path == "/search/movie":
                params["year"] = year

            payload = self._request(path, params)
            batch = payload.get("results") or []
            results.extend(batch)
            if any(item.get("poster_path") for item in batch):
                break
            time.sleep(self.sleep_between_requests)

        return results

    def _pick_best_match(
        self,
        results: list[dict[str, Any]],
        query: str,
        year: int | None,
        title_keys: tuple[str, ...],
        year_key: str,
    ) -> TMDBMatch | None:
        normalized_query = normalize_text(query)
        best_item: dict[str, Any] | None = None
        best_score = float("-inf")

        for item in results:
            poster_path = item.get("poster_path")
            if not poster_path:
                continue

            candidate_title = ""
            for key in title_keys:
                if item.get(key):
                    candidate_title = str(item.get(key))
                    break
            normalized_title = normalize_text(candidate_title)
            candidate_year = None
            raw_year = item.get(year_key) or ""
            if isinstance(raw_year, str) and raw_year[:4].isdigit():
                candidate_year = int(raw_year[:4])

            score = 0.0
            if normalized_title == normalized_query:
                score += 10
            elif normalized_query and normalized_query in normalized_title:
                score += 6
            elif normalized_title and normalized_title in normalized_query:
                score += 4

            popularity = float(item.get("popularity") or 0)
            score += min(popularity / 100.0, 2.0)

            if year and candidate_year:
                if candidate_year == year:
                    score += 4
                else:
                    score -= min(abs(candidate_year - year), 5)

            if score > best_score:
                best_score = score
                best_item = item

        if not best_item:
            return None

        tmdb_id = int(best_item["id"])
        poster_path = str(best_item["poster_path"])
        title = next((str(best_item.get(k)) for k in title_keys if best_item.get(k)), query)
        raw_year = best_item.get(year_key) or ""
        match_year = int(raw_year[:4]) if isinstance(raw_year, str) and raw_year[:4].isdigit() else None
        return TMDBMatch(
            tmdb_id=tmdb_id,
            poster_url=f"{TMDB_IMAGE_BASE}{poster_path}",
            title=title,
            year=match_year,
        )

    def search_movie(self, title: str, year: int | None = None) -> TMDBMatch | None:
        results = self._search("/search/movie", title, year=year)
        return self._pick_best_match(results, title, year, ("title", "original_title"), "release_date")

    def search_tv(self, title: str) -> TMDBMatch | None:
        results = self._search("/search/tv", title)
        return self._pick_best_match(results, title, None, ("name", "original_name"), "first_air_date")
