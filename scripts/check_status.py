#!/usr/bin/env python3
"""Script per verificare lo stato dell'importer e del database"""
import os
import sys
from datetime import datetime, timedelta
import pytz
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Errore: SUPABASE_URL o SUPABASE_SERVICE_KEY non trovati")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Verifica import_status
print("=== IMPORT STATUS ===")
status = supabase.table('import_status').select('*').eq('id', 'epg_fr').execute()
if status.data:
    s = status.data[0]
    print(f"Status: {s.get('status')}")
    print(f"Last run: {s.get('last_run_at')}")
    print(f"Started at: {s.get('started_at')}")
    print(f"Finished at: {s.get('finished_at')}")
    print(f"Programs inserted: {s.get('programs_inserted')}")
    print(f"Programs deleted: {s.get('programs_deleted')}")
    print(f"Channels processed: {s.get('channels_processed')}")
else:
    print("Nessuno status trovato")

# Conta programmi totali
total = supabase.table('programs_fr').select('id', count='exact').execute()
print(f"\nTotal programs: {total.count}")

# Conta programmi per data (ultimi 14 giorni)
print("\n=== PROGRAMMI PER DATA (ultimi 14 giorni) ===")
tz = pytz.timezone('Europe/Paris')
today = datetime.now(tz).date()
for i in range(14):
    date = today - timedelta(days=i)
    count = supabase.table('programs_fr').select('id', count='exact').eq('date', date.isoformat()).execute()
    weekday = date.strftime('%A')
    date_str = date.strftime('%d/%m')
    print(f"{weekday:12} {date_str}: {count.count:>6} programmi")
