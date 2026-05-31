#!/bin/bash
set -euo pipefail

BASE_DIR="${BASE_DIR:-/home/u914016995/programmecesoir_birthday}"
PYTHON_BIN="${PYTHON_BIN:-/home/u914016995/epg_importer_fr/venv/bin/python}"
SCRIPT_PATH="${SCRIPT_PATH:-$BASE_DIR/generate_birthday_article.py}"
ENV_FILE="${ENV_FILE:-$BASE_DIR/.env}"
ACTORS_DIR="${ACTORS_DIR:-/home/u914016995/domains/programmecesoir.fr/public_html/entities-data/actors}"
REPORT_FILE="${REPORT_FILE:-$BASE_DIR/last-run.json}"
PUBLIC_FILE="${PUBLIC_FILE:-/home/u914016995/domains/programmecesoir.fr/public_html/birthday-data/current.json}"
LOG_DIR="${LOG_DIR:-$BASE_DIR/logs}"
RUN_MODE="${RUN_MODE:-live}" # live | dry

export DEEPSEEK_TIMEOUT_SECONDS="${DEEPSEEK_TIMEOUT_SECONDS:-120}"
export DEEPSEEK_MAX_TOKENS="${DEEPSEEK_MAX_TOKENS:-2600}"
export ALLOW_UPCOMING_FALLBACK="${ALLOW_UPCOMING_FALLBACK:-false}"
export FORCE_REGENERATE="${FORCE_REGENERATE:-false}"
export DRY_RUN="${DRY_RUN:-false}"

mkdir -p "$LOG_DIR"

if [[ "$RUN_MODE" == "dry" ]]; then
  export DRY_RUN=true
fi

exec "$PYTHON_BIN" "$SCRIPT_PATH" \
  --env-file="$ENV_FILE" \
  --actors-dir="$ACTORS_DIR" \
  --report-file="$REPORT_FILE" \
  --public-file="$PUBLIC_FILE"
