
import os
import sys
import json
import re
import unicodedata
import urllib.request
import urllib.error
import time

def load_env(env_path):
    config = {}
    try:
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'): continue
                if '=' in line:
                    key, value = line.split('=', 1)
                    config[key.strip()] = value.strip().strip("'").strip('"')
    except Exception as e:
        print(f"Warning: Could not load .env from {env_path}: {e}")
    return config

# Load config
# Try current dir then parent dir
config = load_env('.env')
if not config:
    config = load_env('../.env')

SUPABASE_URL = config.get('SUPABASE_URL')
SUPABASE_KEY = config.get('SUPABASE_SERVICE_KEY')
PROGRAMS_TABLE = config.get('SUPABASE_PROGRAMS_TABLE', 'programs_fr')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
    sys.exit(1)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

def slugify(value):
    value = (value or '').lower().strip()
    value = unicodedata.normalize('NFD', value)
    value = ''.join(ch for ch in value if unicodedata.category(ch) != 'Mn')
    value = re.sub(r'[^a-z0-9\s-]', '', value)
    value = re.sub(r'\s+', '-', value)
    value = re.sub(r'-+', '-', value)
    return value.strip('-')

def fetch_programs_without_slug(limit=1000):
    # GET /programs_fr?select=*&slug=is.null&limit=1000
    # Must fetch ALL columns to respect NOT NULL constraints during UPSERT
    url = f"{SUPABASE_URL}/rest/v1/{PROGRAMS_TABLE}?select=*&slug=is.null&limit={limit}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        print(f"Error fetching programs: {e} {e.read().decode()}")
        return []

def bulk_update_slugs(programs):
    # Use UPSERT via POST with Prefer: resolution=merge-duplicates
    # Payload: [Full Record + Slug]
    # MUST specify on_conflict=id for UPSERT to work on PK match
    url = f"{SUPABASE_URL}/rest/v1/{PROGRAMS_TABLE}?on_conflict=id"
    
    payload = []
    for p in programs:
        if not p.get('title'): continue
        p['slug'] = slugify(p['title'])
        payload.append(p)
    
    if not payload:
        return 0
        
    data = json.dumps(payload).encode('utf-8')
    headers = HEADERS.copy()
    headers['Prefer'] = 'resolution=merge-duplicates,return=minimal'  # return=minimal is faster for bulk operations
    
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as response:
            # 201 Created is typical for insert/upsert
            return len(payload)
    except urllib.error.HTTPError as e:
        print(f"Error updating slugs: {e} {e.read().decode()}")
        return 0

def main():
    print(f"Starting backfill_slugs_native for {PROGRAMS_TABLE}...")
    total_updated = 0
    
    while True:
        programs = fetch_programs_without_slug(1000)
        if not programs:
            print("No more programs without slug found.")
            break
            
        print(f"Processing {len(programs)} programs...")
        count = bulk_update_slugs(programs)
        total_updated += count
        print(f"Updated {count} records. Total: {total_updated}")
        
        # Sleep slightly to avoid overwhelming DB?
        time.sleep(0.5)
        
    print(f"Backfill complete. Total records updated: {total_updated}")

if __name__ == "__main__":
    main()
