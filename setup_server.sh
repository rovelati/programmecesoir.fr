#!/bin/bash
# Script per setup iniziale dell'importer EPG sul server

set -e

SERVER="u914016995@89.116.147.83"
PORT="65002"
REMOTE_DIR="~/epg_importer_fr"

echo "🔧 Setup EPG Importer sul server"
echo "================================"
echo ""

echo "📁 Creazione directory..."
ssh -p $PORT $SERVER "mkdir -p ~/epg_importer_fr && mkdir -p ~/.logs"

echo "📤 Upload script Python..."
scp -P $PORT scripts/epg_importer.py $SERVER:$REMOTE_DIR/
scp -P $PORT scripts/requirements.txt $SERVER:$REMOTE_DIR/

echo "📤 Upload script Node.js..."
scp -P $PORT frontend/scripts/generate-sitemap.js $SERVER:$REMOTE_DIR/

echo "📤 Upload .env..."
scp -P $PORT scripts/.env $SERVER:$REMOTE_DIR/

echo ""
echo "✅ File caricati sul server!"
echo ""
echo "Prossimi passi sul server:"
echo "  1. ssh -p $PORT $SERVER"
echo "  2. cd ~/epg_importer_fr"
echo "  3. python3 -m venv venv"
echo "  4. source venv/bin/activate"
echo "  5. pip install -r requirements.txt"
echo "  6. npm init -y && npm install @supabase/supabase-js"
echo "  7. Verificare che .env contenga SITEMAP_PUBLIC_DIR"
echo "  8. Test: python3 epg_importer.py"
echo "  9. Configurare crontab: 0 * * * * ..."
