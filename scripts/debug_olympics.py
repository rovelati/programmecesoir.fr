
import os
import sys
from supabase import create_client
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
load_dotenv()

url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_KEY')
programs_table = os.getenv('SUPABASE_PROGRAMS_TABLE', 'programs_fr')
channels_table = os.getenv('SUPABASE_CHANNELS_TABLE', 'channels_fr')

supabase = create_client(url, key)

print("--- Searching for Program ---")
# 1. Get Channel ID
res = supabase.table(channels_table).select('*').ilike('channel_id', 'france-2').execute()
if not res.data:
    print("Channel 'france-2' not found")
    sys.exit(1)
channel_id = res.data[0]['channel_id']
print(f"Channel ID: {channel_id}")

# 2. Search Program by Title
term = "Jeux Olympiques"
print(f"Searching for '{term}'...")
res = supabase.table(programs_table)\
    .select('id, title, start_time, date, slug')\
    .eq('channel_id', channel_id)\
    .ilike('title', f'%{term}%')\
    .order('start_time', desc=True)\
    .limit(10)\
    .execute()

for p in res.data:
    print(f"ID: {p['id']} | Date: {p['date']} | Slug: {p['slug']} | Title: {p['title']}")
