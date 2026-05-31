
import os
import sys
from supabase import create_client
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
load_dotenv()

url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_KEY')
supabase = create_client(url, key)

tables = ['programs', 'programs_fr']

print("--- Checking Table Columns ---")
for table in tables:
    print(f"\nScanning table: {table}")
    try:
        res = supabase.table(table).select('*').limit(1).execute()
        if res.data:
            keys = list(res.data[0].keys())
            print(f"✅ Found {len(keys)} columns: {keys}")
            if 'slug' in keys:
                print(f"🎉 'slug' column EXISTS in {table}!")
            else:
                print(f"❌ 'slug' column MISSING in {table}.")
        else:
            print(f"⚠️ Table {table} is empty or not accessible.")
    except Exception as e:
        print(f"⚠️ Error checking {table}: {e}")
