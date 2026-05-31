#!/usr/bin/env python3
"""Filesystem image download/store utilities."""

from __future__ import annotations

import io
import logging
import os
from pathlib import Path

import requests
from PIL import Image


class ImageStore:
    def __init__(self, base_path: str, base_url: str, timeout: int, logger: logging.Logger) -> None:
        self.base_path = Path(base_path)
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.logger = logger
        self.session = requests.Session()

    def _target_paths(self, source: str, identifier: str) -> tuple[Path, str]:
        filename = f"{identifier}.jpg"
        target_dir = self.base_path / source
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / filename
        public_url = f"{self.base_url}/{source}/{filename}"
        return target_path, public_url

    def save_from_remote(self, source: str, identifier: str | int, source_url: str) -> str:
        target_path, public_url = self._target_paths(source, str(identifier))
        if target_path.exists():
            return public_url

        response = self.session.get(source_url, timeout=self.timeout, stream=True)
        response.raise_for_status()
        content = response.content

        image = Image.open(io.BytesIO(content))
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        elif image.mode == "L":
            image = image.convert("RGB")
        image.save(target_path, format="JPEG", quality=85, optimize=True)
        self.logger.info("Saved image %s -> %s", source_url, target_path)
        return public_url
