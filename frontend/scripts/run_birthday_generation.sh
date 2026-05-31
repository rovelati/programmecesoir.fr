#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="${BASE_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
ROOT_DIR="${ROOT_DIR:-$(cd "$BASE_DIR/.." && pwd)}"
LOG_DIR="${LOG_DIR:-$BASE_DIR/logs}"
ENV_FILE="${ENV_FILE:-$BASE_DIR/.env}"
ROOT_ENV_FILE="${ROOT_ENV_FILE:-$ROOT_DIR/scripts/.env}"
DEEPSEEK_FILE="${DEEPSEEK_FILE:-$ROOT_DIR/DEEPSEEK.md}"
TOGETHER_FILE="${TOGETHER_FILE:-$ROOT_DIR/together-api.md}"
NPM_BIN="${NPM_BIN:-npm}"
RUN_MODE="${RUN_MODE:-live}" # live | dry

# Safe defaults for production cron.
export DEEPSEEK_TIMEOUT_MS="${DEEPSEEK_TIMEOUT_MS:-120000}"
export DEEPSEEK_MAX_TOKENS="${DEEPSEEK_MAX_TOKENS:-2600}"
export SKIP_IMAGE="${SKIP_IMAGE:-true}"
export ALLOW_UPCOMING_FALLBACK="${ALLOW_UPCOMING_FALLBACK:-false}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a && source "$ENV_FILE" && set +a
fi

if [[ -f "$ROOT_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a && source "$ROOT_ENV_FILE" && set +a
fi

if [[ -z "${DEEPSEEK_API_KEY:-}" && -f "$DEEPSEEK_FILE" ]]; then
  export DEEPSEEK_API_KEY="$(sed -n 's/^DEEPSEEK_API_KEY=//p' "$DEEPSEEK_FILE" | head -n 1)"
fi

if [[ -z "${TOGETHER_API_KEY:-}" && -f "$TOGETHER_FILE" ]]; then
  export TOGETHER_API_KEY="$(sed -n 's/^api-user-programmecesoir:[[:space:]]*//p' "$TOGETHER_FILE" | head -n 1)"
fi

mkdir -p "$LOG_DIR"

if [[ -z "${VITE_SUPABASE_URL:-}" ]]; then
  echo "Missing VITE_SUPABASE_URL" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" && -z "${SUPABASE_SERVICE_ROLE_KEY:-}" && -z "${SUPABASE_SERVICE_KEY:-}" ]]; then
  echo "Missing DATABASE_URL or SUPABASE service role key" >&2
  exit 1
fi

if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
  echo "Missing DEEPSEEK_API_KEY" >&2
  exit 1
fi

cd "$BASE_DIR"

if [[ "$RUN_MODE" == "dry" ]]; then
  exec "$NPM_BIN" run generate:birthday:dry
fi

exec "$NPM_BIN" run generate:birthday
