#!/bin/bash
set -euo pipefail

BASE_DIR="${BASE_DIR:-/home/u914016995/programmecesoir_social}"

exec env MODE=film "$BASE_DIR/run_social_x_reco_server.sh"
