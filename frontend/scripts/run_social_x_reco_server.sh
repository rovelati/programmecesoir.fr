#!/bin/bash
set -euo pipefail

BASE_DIR="${BASE_DIR:-/home/u914016995/programmecesoir_social}"
PYTHON_BIN="${PYTHON_BIN:-/home/u914016995/epg_importer_fr/venv/bin/python}"
BLUESKY_SCRIPT_PATH="${BLUESKY_SCRIPT_PATH:-$BASE_DIR/post_social_bluesky_reco.py}"
REPORT_SCRIPT_PATH="${REPORT_SCRIPT_PATH:-$BASE_DIR/generate_social_performance_report.py}"
ENV_FILE="${ENV_FILE:-$BASE_DIR/.env}"
REPORT_OUTPUT="${REPORT_OUTPUT:-/home/u914016995/domains/programmecesoir.fr/public_html/search-console/social-performance-latest.json}"
MODE="${MODE:-sport}" # sport | film
RUN_MODE="${RUN_MODE:-live}" # live | dry

ARGS=(--env-file="$ENV_FILE" --mode="$MODE")
if [[ "$RUN_MODE" == "dry" ]]; then
  ARGS+=(--dry-run)
fi

status=0
"$PYTHON_BIN" "$BLUESKY_SCRIPT_PATH" "${ARGS[@]}" || status=$?
"$PYTHON_BIN" "$REPORT_SCRIPT_PATH" --env-file="$ENV_FILE" --output="$REPORT_OUTPUT" >/dev/null 2>&1 || true
exit $status
