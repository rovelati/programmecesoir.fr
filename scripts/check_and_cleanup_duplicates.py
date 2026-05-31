#!/usr/bin/env python3
"""
Script per verificare e ripulire duplicati nel database dopo un import errato
"""

import os
import sys
from datetime import datetime, timedelta
import pytz
from dotenv import load_dotenv
from supabase import create_client, Client
from postgrest import APIError

load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')
PROGRAMS_TABLE = os.getenv('SUPABASE_PROGRAMS_TABLE', 'programs_fr')
TIMEZONE = pytz.timezone('Europe/Paris')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def check_duplicates():
    """Verifica duplicati nel database"""
    print("=" * 60)
    print("Verifica duplicati nel database")
    print("=" * 60)
    
    # Conta totale programmi
    try:
        result = supabase.table(PROGRAMS_TABLE).select('id', count='exact').execute()
        total = result.count if hasattr(result, 'count') else len(result.data) if result.data else 0
        print(f"Totale programmi nel database: {total}")
    except Exception as e:
        print(f"Errore nel conteggio: {e}")
        return
    
    # Trova duplicati per channel_id + start_time + end_time
    print("\nCercando duplicati per (channel_id, start_time, end_time)...")
    try:
        # Query per trovare duplicati
        # Usiamo una query SQL raw se possibile, altrimenti iteriamo
        result = supabase.table(PROGRAMS_TABLE).select('channel_id, start_time, end_time, id').execute()
        
        if not result.data:
            print("Nessun programma trovato")
            return
        
        # Raggruppa per chiave
        from collections import defaultdict
        groups = defaultdict(list)
        for p in result.data:
            key = (p.get('channel_id'), p.get('start_time'), p.get('end_time'))
            groups[key].append(p.get('id'))
        
        duplicates = {k: v for k, v in groups.items() if len(v) > 1}
        
        if duplicates:
            print(f"\nTrovati {len(duplicates)} gruppi di duplicati:")
            total_duplicates = sum(len(v) - 1 for v in duplicates.values())
            print(f"Totale record duplicati da rimuovere: {total_duplicates}")
            
            # Mostra alcuni esempi
            print("\nEsempi di duplicati:")
            for i, (key, ids) in enumerate(list(duplicates.items())[:5]):
                print(f"  {key[0]} - {key[1]}: {len(ids)} occorrenze (IDs: {ids[:3]}...)")
            
            return duplicates
        else:
            print("Nessun duplicato trovato!")
            return None
            
    except Exception as e:
        print(f"Errore nella ricerca duplicati: {e}")
        return None

def cleanup_duplicates(dry_run=True):
    """Rimuove duplicati, mantenendo solo il record più recente"""
    duplicates = check_duplicates()
    
    if not duplicates:
        print("\nNessun duplicato da rimuovere.")
        return
    
    print("\n" + "=" * 60)
    if dry_run:
        print("DRY RUN - Nessuna modifica verrà applicata")
    else:
        print("RIMOZIONE DUPLICATI")
    print("=" * 60)
    
    total_removed = 0
    
    for (channel_id, start_time, end_time), ids in duplicates.items():
        # Mantieni solo il primo ID (più recente), rimuovi gli altri
        ids_to_remove = ids[1:]
        
        if dry_run:
            print(f"  [DRY RUN] Rimuoverei {len(ids_to_remove)} duplicati per {channel_id} - {start_time}")
        else:
            for id_to_remove in ids_to_remove:
                try:
                    supabase.table(PROGRAMS_TABLE).delete().eq('id', id_to_remove).execute()
                    total_removed += 1
                except Exception as e:
                    print(f"  Errore rimuovendo ID {id_to_remove}: {e}")
    
    if not dry_run:
        print(f"\nRimossi {total_removed} record duplicati")
    else:
        print(f"\n[DRY RUN] Rimuoverei {sum(len(v) - 1 for v in duplicates.values())} record duplicati")

def cleanup_old_programs(days=7, dry_run=True):
    """Rimuove programmi più vecchi di N giorni"""
    cutoff_date = (datetime.now(TIMEZONE).date() - timedelta(days=days))
    print(f"\nRimozione programmi più vecchi di {days} giorni (prima del {cutoff_date})...")
    
    try:
        result = supabase.table(PROGRAMS_TABLE).select('id').lt('date', cutoff_date.isoformat()).execute()
        count = len(result.data) if result.data else 0
        
        if dry_run:
            print(f"[DRY RUN] Rimuoverei {count} programmi vecchi")
        else:
            if count > 0:
                supabase.table(PROGRAMS_TABLE).delete().lt('date', cutoff_date.isoformat()).execute()
                print(f"Rimossi {count} programmi vecchi")
            else:
                print("Nessun programma vecchio da rimuovere")
    except Exception as e:
        print(f"Errore nella rimozione programmi vecchi: {e}")

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Verifica e ripulisce duplicati nel database')
    parser.add_argument('--cleanup-duplicates', action='store_true', help='Rimuovi duplicati (non dry-run)')
    parser.add_argument('--cleanup-old', type=int, metavar='DAYS', help='Rimuovi programmi più vecchi di N giorni')
    parser.add_argument('--dry-run', action='store_true', default=True, help='Dry run (default)')
    parser.add_argument('--no-dry-run', action='store_false', dest='dry_run', help='Esegui realmente')
    
    args = parser.parse_args()
    
    if args.cleanup_duplicates:
        cleanup_duplicates(dry_run=args.dry_run)
    
    if args.cleanup_old:
        cleanup_old_programs(days=args.cleanup_old, dry_run=args.dry_run)
    
    if not args.cleanup_duplicates and not args.cleanup_old:
        # Solo verifica
        check_duplicates()
