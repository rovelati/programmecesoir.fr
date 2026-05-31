#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="${BASE_DIR:-/home/u914016995/programmecesoir_social}"
PYTHON_BIN="${PYTHON_BIN:-/home/u914016995/epg_importer_fr/venv/bin/python}"
SCRIPT_PATH="${SCRIPT_PATH:-$BASE_DIR/post_social_bluesky_reco.py}"
ENV_FILE="${ENV_FILE:-$BASE_DIR/.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

exec "$PYTHON_BIN" "$SCRIPT_PATH" --mode film ${EXTRA_ARGS:-}
