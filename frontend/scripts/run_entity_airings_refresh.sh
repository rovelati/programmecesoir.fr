#!/bin/bash
set -euo pipefail

BASE_DIR="${BASE_DIR:-/home/u914016995/epg_importer_fr}"
PYTHON_BIN="${PYTHON_BIN:-$BASE_DIR/venv/bin/python}"
SCRIPT_PATH="${SCRIPT_PATH:-$BASE_DIR/update_entity_airings.py}"
ENV_FILE="${ENV_FILE:-$BASE_DIR/.env}"
ENTITIES_DIR="${ENTITIES_DIR:-/home/u914016995/domains/programmecesoir.fr/public_html/entities-data}"
HORIZON_DAYS="${HORIZON_DAYS:-7}"
PAST_HOURS="${PAST_HOURS:-2}"
MAX_AIRINGS="${MAX_AIRINGS:-18}"
LOG_DIR="${LOG_DIR:-$BASE_DIR/logs}"

mkdir -p "$LOG_DIR"

exec "$PYTHON_BIN" "$SCRIPT_PATH" \
  --env-file="$ENV_FILE" \
  --entities-dir="$ENTITIES_DIR" \
  --horizon-days="$HORIZON_DAYS" \
  --past-hours="$PAST_HOURS" \
  --max-airings="$MAX_AIRINGS"
