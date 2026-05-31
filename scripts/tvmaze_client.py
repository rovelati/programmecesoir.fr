#!/usr/bin/env python3
"""TVmaze client for program image enrichment fallback."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import requests


@dataclass
class TVMazeMatch:
    tvmaze_id: int
    image_url: str
    title: str


class TVMazeClient:
    def __init__(
        self,
        logger: logging.Logger,
        timeout: int = 20,
        sleep_between_requests: float = 0.25,
        max_retries: int = 3,
    ) -> None:
        self.logger = logger
        self.timeout = timeout
        self.sleep_between_requests = sleep_between_requests
        self.max_retries = max_retries
        self.session = requests.Session()

    def search_show(self, title: str) -> TVMazeMatch | None:
        query = (title or "").strip()
        if not query:
            return None

        url = "https://api.tvmaze.com/singlesearch/shows"
        last_error: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                response = self.session.get(
                    url,
                    params={"q": query},
                    timeout=self.timeout,
                    headers={"Accept": "application/json"},
                )
                if response.status_code == 404:
                    return None
                if response.status_code in (429, 500, 502, 503, 504):
                    raise requests.HTTPError(
                        f"TVmaze transient error {response.status_code}: {response.text[:200]}",
                        response=response,
                    )
                response.raise_for_status()
                payload = response.json()
                image = payload.get("image") or {}
                image_url = image.get("original") or image.get("medium")
                if not image_url:
                    return None
                return TVMazeMatch(
                    tvmaze_id=int(payload["id"]),
                    image_url=str(image_url),
                    title=str(payload.get("name") or query),
                )
            except Exception as exc:  # pragma: no cover - defensive retry branch
                last_error = exc
                if attempt >= self.max_retries:
                    break
                sleep_seconds = (2 ** (attempt - 1)) * self.sleep_between_requests
                self.logger.warning("TVmaze retry %s/%s after error: %s", attempt, self.max_retries, exc)
                time.sleep(sleep_seconds)

        raise RuntimeError(f"TVmaze request failed for {query}: {last_error}")
