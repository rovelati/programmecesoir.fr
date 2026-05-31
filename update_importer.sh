#!/bin/bash

# Script per aggiornare l'importer sul server di produzione
# Usa scp direttamente con i parametri dello script SSH

REMOTE_HOST="89.116.147.83"
REMOTE_PORT="65002"
REMOTE_USER="u914016995"
REMOTE_DIR="/home/u914016995/epg_importer_fr"
SCRIPTS_DIR="$REMOTE_DIR/scripts"

echo "🚀 Aggiornamento EPG Importer su server produzione"
echo "=================================================="
echo ""

# Crea directory scripts se non esiste
echo "📁 Creazione directory..."
ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p ${SCRIPTS_DIR}"

# Upload importer principale
echo "📤 Upload epg_importer.py..."
scp -P ${REMOTE_PORT} scripts/epg_importer.py ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/

echo "📤 Upload update_entity_airings.py..."
scp -P ${REMOTE_PORT} frontend/scripts/update_entity_airings.py ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/

echo "📤 Upload run_entity_airings_refresh.sh..."
scp -P ${REMOTE_PORT} frontend/scripts/run_entity_airings_refresh.sh ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/

echo "📤 Upload image enricher files..."
scp -P ${REMOTE_PORT} scripts/image_enricher.py ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/
scp -P ${REMOTE_PORT} scripts/pg_adapter.py ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/
scp -P ${REMOTE_PORT} scripts/tmdb_client.py ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/
scp -P ${REMOTE_PORT} scripts/tvmaze_client.py ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/
scp -P ${REMOTE_PORT} scripts/image_store.py ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/
scp -P ${REMOTE_PORT} scripts/run_image_enricher.sh ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/

# Upload script di cleanup
echo "📤 Upload check_and_cleanup_duplicates.py..."
scp -P ${REMOTE_PORT} scripts/check_and_cleanup_duplicates.py ${REMOTE_USER}@${REMOTE_HOST}:${SCRIPTS_DIR}/

# Verifica che i file siano stati aggiornati
echo ""
echo "✅ Verifica file aggiornati:"
ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "cd ${REMOTE_DIR} && chmod +x run_entity_airings_refresh.sh run_image_enricher.sh && ls -lh epg_importer.py update_entity_airings.py run_entity_airings_refresh.sh image_enricher.py pg_adapter.py tmdb_client.py tvmaze_client.py image_store.py run_image_enricher.sh scripts/check_and_cleanup_duplicates.py && ./venv/bin/python -m py_compile epg_importer.py update_entity_airings.py image_enricher.py pg_adapter.py tmdb_client.py tvmaze_client.py image_store.py && echo '✅ File verificati correttamente'"

echo ""
echo "✅ Upload completato!"
echo ""
echo "Prossimi passi:"
echo "1. SSH sul server: ssh $SERVER"
echo "2. Verifica duplicati: cd $REMOTE_DIR && python3 scripts/check_and_cleanup_duplicates.py"
echo "3. Se necessario, ripulisci: python3 scripts/check_and_cleanup_duplicates.py --cleanup-duplicates --no-dry-run"
echo "4. Rilancia importer: cd $REMOTE_DIR && source venv/bin/activate && python epg_importer.py >> ~/.logs/epg_importer_fr.log 2>&1"
echo ""
echo "Vedi DEPLOY_IMPORTER.md per dettagli completi."
