#!/bin/bash
# Script di deploy per programmecesoir.fr

set -e

SERVER="u914016995@89.116.147.83"
PORT="65002"
REMOTE_DIR="/home/u914016995/domains/programmecesoir.fr/public_html"
FRONTEND_DIR="frontend"
SNAPSHOT_LOG="/home/u914016995/.logs/deploy_snapshot_refresh.log"

echo "🚀 Deploy programmecesoir.fr"
echo "=========================="
echo ""

# Verifica che il build esista
if [ ! -d "$FRONTEND_DIR/dist" ]; then
    echo "❌ Directory dist/ non trovata. Esegui prima: cd frontend && npm run build"
    exit 1
fi

echo "📦 Upload frontend files..."
# Important: do not overwrite remote-only datasets/snapshots generated server-side
# such as /programme/*, /birthday-data/* and /entities-data/*.
rsync -az --exclude='birthday-data/' --exclude='entities-data/' -e "ssh -p $PORT" $FRONTEND_DIR/dist/ $SERVER:$REMOTE_DIR/

echo "📄 Upload public files (robots.txt, .htaccess, sitemap)..."
scp -P $PORT $FRONTEND_DIR/public/robots.txt $SERVER:$REMOTE_DIR/
scp -P $PORT $FRONTEND_DIR/public/.htaccess $SERVER:$REMOTE_DIR/
scp -P $PORT $FRONTEND_DIR/public/sitemap*.xml $SERVER:$REMOTE_DIR/

echo "🎂 Upload birthday generation scripts..."
scp -P $PORT $FRONTEND_DIR/scripts/generate_birthday_article.py $SERVER:/home/u914016995/programmecesoir_birthday/generate_birthday_article.py
scp -P $PORT $FRONTEND_DIR/scripts/run_birthday_generation_server.sh $SERVER:/home/u914016995/programmecesoir_birthday/run_birthday_generation_server.sh
ssh -p $PORT $SERVER "chmod +x /home/u914016995/programmecesoir_birthday/run_birthday_generation_server.sh"

echo "📺 Regenerate channel snapshots and launch program snapshots in background..."
ssh -p $PORT $SERVER "mkdir -p /home/u914016995/.logs && /home/u914016995/epg_importer_fr/venv/bin/python - <<'PY' > $SNAPSHOT_LOG 2>&1
import sys
from datetime import datetime
sys.path.insert(0, '/home/u914016995/epg_importer_fr')
import epg_importer
content = epg_importer.fetch_xmltv()
channels, programs = epg_importer.parse_xmltv(content)
epg_importer.regenerate_head_root_routes(channels, programs)
epg_importer.regenerate_head_channel_routes(channels, programs)
run_state = epg_importer.init_import_run_state()
run_state['runId'] = f\"deploy-{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}\"
epg_importer.launch_detached_program_share_snapshots(run_state)
PY" || {
  echo "❌ Snapshot refresh failed after deploy. Tail of $SNAPSHOT_LOG:"
  ssh -p $PORT $SERVER "tail -n 40 $SNAPSHOT_LOG" || true
  exit 1
}

echo "🔎 Verify refreshed channel snapshot points to current bundle..."
EXPECTED_INDEX_JS=$(cd "$FRONTEND_DIR/dist/assets" && ls -1 index-*.js | head -n1)
REMOTE_INDEX_JS=$(ssh -p $PORT $SERVER "python3 - <<'PY'
import re
from pathlib import Path
html = Path('$REMOTE_DIR/ce-soir/france-2.html').read_text(encoding='utf-8', errors='ignore')
match = re.search(r'/assets/(index-[^\"\\']+\\.js)', html)
print(match.group(1) if match else '')
PY")
if [ "$REMOTE_INDEX_JS" != "$EXPECTED_INDEX_JS" ]; then
  echo "❌ Snapshot bundle mismatch: expected $EXPECTED_INDEX_JS, found $REMOTE_INDEX_JS"
  echo "Tail of $SNAPSHOT_LOG:"
  ssh -p $PORT $SERVER "tail -n 40 $SNAPSHOT_LOG" || true
  exit 1
fi
echo "✅ Channel snapshot bundle verified: $REMOTE_INDEX_JS"

echo "🎂 Regenerate birthday public payload after deploy..."
ssh -p $PORT $SERVER /home/u914016995/programmecesoir_birthday/run_birthday_generation_server.sh >/dev/null 2>&1 || \
  echo "⚠️ Birthday refresh failed after deploy; check /home/u914016995/.logs/cronjob_* on server"

echo "🎭 Regenerate entity airings after deploy..."
ssh -p $PORT $SERVER /home/u914016995/epg_importer_fr/run_entity_airings_refresh.sh >/dev/null 2>&1 || \
  echo "⚠️ Entity airings refresh failed after deploy; check /home/u914016995/.logs/cronjob_* on server"

echo ""
echo "✅ Deploy completato!"
echo ""
echo "Verifica:"
echo "  curl -I https://programmecesoir.fr"
echo "  curl https://programmecesoir.fr/sitemap.xml"
