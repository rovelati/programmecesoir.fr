import os
import sys
from supabase import create_client
from dotenv import load_dotenv

def main():
    load_dotenv()
    
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_KEY')
    
    if not url or not key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
        return
    
    print(f"Connecting to: {url}")
    supabase = create_client(url, key)
    
    # 1. Check import_status
    print("\nImport Status (epg_fr):")
    res = supabase.table('import_status').select('*').eq('id', 'epg_fr').execute()
    if res.data:
        status = res.data[0]
        for k, v in status.items():
            print(f"  {k}: {v}")
    else:
        print("  No status found for 'epg_fr'")
    
    # 2. Search for common IDs of missing channels
    missing_ids = ['c8', 'nrj12', 'nrj-12', 'canal-8', 'cstar', 'cherie-25', 'l-equipe', 'france-4', 'france-o']
    
    print("\nSearching for specific IDs:")
    for mid in missing_ids:
        res = supabase.table('channels_fr').select('channel_id, name').eq('channel_id', mid).execute()
        if res.data:
            print(f"  [FOUND] {mid}: {res.data[0]['name']}")
        else:
            print(f"  [NOT FOUND] {mid}")
            
    # 3. Search by name fragments
    fragments = ['8', '12', '25', 'star', 'equipe']
    print("\nSearching by name fragments:")
    for frag in fragments:
        res = supabase.table('channels_fr').select('channel_id, name').ilike('name', f'%{frag}%').execute()
        if res.data:
            print(f"  Fragment '{frag}': {', '.join([f'{c["name"]} ({c["channel_id"]})' for c in res.data])}")

if __name__ == "__main__":
    main()
