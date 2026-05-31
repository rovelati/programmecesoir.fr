#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${IMAGE_ENRICHER_LOG_FILE:-$SCRIPT_DIR/enricher.log}"

cd "$SCRIPT_DIR"
set -a
source "$SCRIPT_DIR/.env"
set +a

exec "$SCRIPT_DIR/venv/bin/python" "$SCRIPT_DIR/image_enricher.py" >> "$LOG_FILE" 2>&1
