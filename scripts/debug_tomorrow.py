
import os
import sys
from supabase import create_client
from dotenv import load_dotenv
import unicodedata
import re
from datetime import datetime
import pytz

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

load_dotenv()

url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_KEY')
programs_table = os.getenv('SUPABASE_PROGRAMS_TABLE', 'programs_fr')
channels_table = os.getenv('SUPABASE_CHANNELS_TABLE', 'channels_fr')

supabase = create_client(url, key)

def get_program_slug_new(title):
    value = (title or '').lower().strip()
    value = unicodedata.normalize('NFD', value)
    value = ''.join(ch for ch in value if unicodedata.category(ch) != 'Mn')
    value = re.sub(r'[^a-z0-9\s-]', '', value)
    value = re.sub(r'\s+', '-', value)
    value = re.sub(r'-+', '-', value)
    return value.strip('-')

print("--- Checking Schema ---")
res = supabase.table(programs_table).select('*').limit(1).execute()
if res.data:
    keys = res.data[0].keys()
    print(f"Columns: {list(keys)}")
    if 'slug' in keys:
        print("✅ 'slug' column EXISTS.")
    else:
        print("❌ 'slug' column MISSING.")
else:
    print("No data in table.")

print("\n--- Debugging TF1 Lookup for 'Familles nombreuses' (Tomorrow) ---")
# 1. Get Channel ID for TF1
res = supabase.table(channels_table).select('*').ilike('channel_id', 'tf1').execute()
if not res.data:
    print("TF1 channel not found")
    sys.exit(1)
channel_id = res.data[0]['channel_id']
print(f"Channel ID: {channel_id}")

# 2. Fetch programs for tomorrow
# Simple verify: get programs matching title
target_title_part = "Familles nombreuses"
res = supabase.table(programs_table)\
    .select('title, start_time, date')\
    .eq('channel_id', channel_id)\
    .ilike('title', f'%{target_title_part}%')\
    .order('start_time', desc=True)\
    .limit(10)\
    .execute()

print(f"Found {len(res.data)} variants of '{target_title_part}':")
target_slug = "familles-nombreuses-la-vie-en-xxl"
found = False
for p in res.data:
    title = p['title']
    slug = get_program_slug_new(title)
    match = (slug == target_slug)
    marker = "✅ MATCH" if match else "❌"
    print(f"{marker} [{p['date']} {p['start_time']}] {title} -> {slug}")
    if match: found = True

if not found:
    print("\n⚠️ Target program NOT FOUND in query results. Check title formatting or date range.")
else:
    print("\n✅ Target program exists in DB.")
