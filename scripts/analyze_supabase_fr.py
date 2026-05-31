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
    
    # 1. Channels count
    ch_res = supabase.table('channels_fr').select('channel_id', count='exact').execute()
    ch_count = ch_res.count
    print(f"\nTotal channels in 'channels_fr': {ch_count}")
    
    # 2. Total Programs count (Exact)
    prog_res = supabase.table('programs_fr').select('id', count='exact').limit(1).execute()
    total_prog_count = prog_res.count
    print(f"Total programs in 'programs_fr' (exact count): {total_prog_count}")
    
    if total_prog_count == 0:
        print("No programs found!")
        return
        
    # 3. Analyze all programs distribution
    date_counts = {}
    all_channel_ids_with_programs = set()
    
    print("\nFetching all programs to analyze distribution (in batches of 1000)...")
    batch_size = 1000
    offset = 0
    while True:
        try:
            res = supabase.table('programs_fr').select('date, channel_id').range(offset, offset + batch_size - 1).execute()
            batch_data = res.data or []
            if not batch_data:
                break
            
            for p in batch_data:
                d = p.get('date')
                cid = p.get('channel_id')
                if d:
                    date_counts[d] = date_counts.get(d, 0) + 1
                if cid:
                    all_channel_ids_with_programs.add(cid)
            
            num_rows = len(batch_data)
            offset += num_rows
            
            if offset % 10000 == 0:
                print(f"  Processed {offset} programs...")
            
            # If we got fewer rows than requested, it's the last page
            if num_rows < batch_size:
                break
                
        except Exception as e:
            print(f"Error at offset {offset}: {str(e)}")
            break
            
    print(f"\nTotal programs analyzed: {offset}")
    
    print("\nDate distribution (All dates):")
    sorted_dates = sorted(date_counts.items(), key=lambda x: x[0])
    for d, count in sorted_dates:
        print(f"  {d}: {count} programs")
        
    print(f"\nUnique channels with ANY programs: {len(all_channel_ids_with_programs)}")
    
    # 4. Check for today specifically
    today = datetime.now(pytz.timezone('Europe/Paris')).date().isoformat()
    programs_today_count = date_counts.get(today, 0)
    print(f"\nPrograms for today ({today}): {programs_today_count}")
    
    # 5. Check mapping
    all_ch_ids_res = supabase.table('channels_fr').select('channel_id').execute()
    all_ch_ids = set(c['channel_id'] for c in all_ch_ids_res.data or [])
    
    orphans = all_channel_ids_with_programs - all_ch_ids
    if orphans:
        print(f"\nFound {len(orphans)} channels in programs that are NOT in channels table!")
        print(", ".join(list(orphans)[:20]))
    else:
        print("\nAll channel_ids in programs exist in 'channels_fr' table.")
    
    missing_channels = all_ch_ids - all_channel_ids_with_programs
    print(f"\nTotal missing channels (no programs): {len(missing_channels)}")
    if missing_channels:
        print("First 20 missing channels:")
        print(", ".join(list(missing_channels)[:20]))

if __name__ == "__main__":
    main()
