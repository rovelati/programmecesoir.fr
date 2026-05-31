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
    
    # Simulate Ce Soir Page fetch
    # Tonight range: 18:00 today to 02:00 tomorrow
    now = datetime.now(pytz.timezone('Europe/Paris'))
    tonight_start = now.replace(hour=18, minute=0, second=0, microsecond=0)
    tonight_end = tonight_start.replace(day=tonight_start.day + 1, hour=2)
    
    print(f"\nSimulating 'Ce Soir' fetch:")
    print(f"Range: {tonight_start.isoformat()} to {tonight_end.isoformat()}")
    
    limit = 2000
    res = supabase.table('programs_fr') \
        .select('channel_id, start_time') \
        .gte('start_time', tonight_start.isoformat()) \
        .lte('start_time', tonight_end.isoformat()) \
        .order('start_time', desc=False) \
        .limit(limit) \
        .execute()
    
    data = res.data or []
    print(f"Fetched {len(data)} programs (limit: {limit})")
    
    unique_channels = set(p['channel_id'] for p in data)
    print(f"Unique channels in these {len(data)} programs: {len(unique_channels)}")
    
    if len(data) > 0:
        last_start = data[-1]['start_time']
        print(f"Last program fetched starts at: {last_start}")

    # Now simulate "Maintenant" fetch
    # -2 hours to +6 hours
    maintenant_start = now.replace(hour=now.hour - 2)
    maintenant_end = now.replace(hour=now.hour + 6)
    
    print(f"\nSimulating 'Maintenant' fetch:")
    print(f"Range: {maintenant_start.isoformat()} to {maintenant_end.isoformat()}")
    
    res_m = supabase.table('programs_fr') \
        .select('channel_id, start_time') \
        .gte('start_time', maintenant_start.isoformat()) \
        .lte('start_time', maintenant_end.isoformat()) \
        .order('start_time', desc=False) \
        .limit(limit) \
        .execute()
        
    data_m = res_m.data or []
    print(f"Fetched {len(data_m)} programs (limit: {limit})")
    
    unique_channels_m = set(p['channel_id'] for p in data_m)
    print(f"Unique channels in these {len(data_m)} programs: {len(unique_channels_m)}")
    
    if len(data_m) > 0:
        last_start_m = data_m[-1]['start_time']
        print(f"Last program fetched starts at: {last_start_m}")

if __name__ == "__main__":
    main()
