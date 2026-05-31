
import os
import sys
from supabase import create_client
from dotenv import load_dotenv

# Add scripts dir to path to import slug helper if needed, but I'll copy the logic for independence
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import unicodedata
import re

load_dotenv()

url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_KEY')
programs_table = os.getenv('SUPABASE_PROGRAMS_TABLE', 'programs_fr')
channels_table = os.getenv('SUPABASE_CHANNELS_TABLE', 'channels_fr')

supabase = create_client(url, key)

def get_program_slug_legacy(title):
    ascii_val = (title or '').lower()
    # rough approximation of the legacy frontend logic
    # ascii = (title || '').toLowerCase().split('').filter(ch => ch.charCodeAt(0) < 128).join('');
    # return ascii.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    
    # Python equivalent roughly:
    ascii_chars = [c for c in ascii_val if ord(c) < 128]
    ascii_str = "".join(ascii_chars)
    slug = re.sub(r'[^\w\s-]', '', ascii_str)
    slug = re.sub(r'\s+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    return slug.strip('-')

def get_program_slug_new(title): # slugify_for_url
    value = (title or '').lower().strip()
    value = unicodedata.normalize('NFD', value)
    value = ''.join(ch for ch in value if unicodedata.category(ch) != 'Mn')
    value = re.sub(r'[^a-z0-9\s-]', '', value)
    value = re.sub(r'\s+', '-', value)
    value = re.sub(r'-+', '-', value)
    return value.strip('-')

print(f"Searching for 'Jeux' in programs_fr for channel 'france-2'...")

# 1. Get Channel ID
res = supabase.table(channels_table).select('*').eq('channel_id', 'france-2').execute()
if not res.data:
    print("Channel 'france-2' not found!")
    # Try searching by name
    res = supabase.table(channels_table).select('*').ilike('name', '%France 2%').execute()
    if res.data:
        print(f"Found channels: {[c['channel_id'] for c in res.data]}")
        channel_id = res.data[0]['channel_id']
    else:
        sys.exit(1)
else:
    channel_id = res.data[0]['channel_id']

print(f"Channel ID: {channel_id}")

# 2. Search Programs
res = supabase.table(programs_table)\
    .select('title, start_time, date')\
    .eq('channel_id', channel_id)\
    .ilike('title', '%Jeux%')\
    .order('start_time', desc=True)\
    .limit(20)\
    .execute()

print(f"Found {len(res.data)} programs:")
for p in res.data:
    title = p['title']
    slug_new = get_program_slug_new(title)
    slug_legacy = get_program_slug_legacy(title)
    print(f"- [{p['date']} {p['start_time']}] {title}")
    print(f"  New Slug: {slug_new}")
    print(f"  Legacy:   {slug_legacy}")
