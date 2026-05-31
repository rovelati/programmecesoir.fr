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
    supabase = create_client(url, key)

    # Simulate Ce Soir Page fetch exactly as in usePrograms.js
    now = datetime.now(pytz.timezone('Europe/Paris'))
    tonight_start = now.replace(hour=18, minute=0, second=0, microsecond=0)
    tonight_end = tonight_start.replace(day=tonight_start.day + 1, hour=2)
    
    start_iso = tonight_start.isoformat()
    end_iso = tonight_end.isoformat()
    
    print(f"Testing join query for range: {start_iso} to {end_iso}")

    # The query from usePrograms.js
    try:
        res = supabase.from_('programs_fr').select('''
            id, channel_id, title, description, start_time, end_time, genre,
            channels:channels_fr (
                name,
                logo_url,
                channel_number
            )
        ''') \
        .gte('start_time', start_iso) \
        .lte('start_time', end_iso) \
        .order('start_time', desc=False) \
        .limit(10) \
        .execute()
        
        data = res.data or []
        print(f"Query returned {len(data)} results.")
        
        for i, p in enumerate(data):
            ch = p.get('channels')
            ch_info = f"Channel: {ch.get('name')} (Logo: {'YES' if ch.get('logo_url') else 'NO'})" if ch else "Channel: MISSING (Join failed!)"
            print(f"  {i+1}. {p['title']} | {p['start_time']} | {ch_info}")
            
    except Exception as e:
        print(f"ERROR: {str(e)}")

if __name__ == "__main__":
    main()
