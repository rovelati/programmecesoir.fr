import os
import sys
from supabase import create_client
from dotenv import load_dotenv
from datetime import datetime
import pytz

def main():
    load_dotenv()
    
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_KEY')
    
    if not url or not key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
        return
    
    print(f"Connecting to: {url}")
    supabase = create_client(url, key)
    
    major_channels = ['tf1', 'france-2', 'france-3', 'canal-plus', 'm6', 'arte', 'c8', 'w9', 'tmc', 'tfx', 'nrj12', 'lci', 'bfm-tv', 'cnews']
    
    print(f"\nChecking major channels status:")
    for cid in major_channels:
        # Check channel info
        ch_res = supabase.table('channels_fr').select('channel_id, name, logo_url').eq('channel_id', cid).execute()
        ch_data = ch_res.data or []
        
        if not ch_data:
            print(f"  [MISSING] {cid}: Not found in channels_fr table")
            continue
        
        # Check today's programs
        today = datetime.now(pytz.timezone('Europe/Paris')).date().isoformat()
        prog_res = supabase.table('programs_fr').select('id', count='exact').eq('channel_id', cid).eq('date', today).execute()
        prog_count = prog_res.count
        
        logo_status = "OK" if ch_data[0].get('logo_url') else "NO LOGO"
        print(f"  [FOUND] {cid:<15} | Programs today: {prog_count:<4} | Logo: {logo_status}")

    # Check for any channel with MOST programs today
    print("\nChannels with most programs today:")
    res = supabase.table('programs_fr').select('channel_id').eq('date', today).execute()
    counts = {}
    for p in res.data or []:
        cid = p['channel_id']
        counts[cid] = counts.get(cid, 0) + 1
    
    sorted_counts = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    for cid, count in sorted_counts[:10]:
        print(f"  {cid:<20}: {count} programs")

if __name__ == "__main__":
    main()
