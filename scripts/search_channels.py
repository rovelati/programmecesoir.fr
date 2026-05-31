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
    
    # 1. Search for channels with names containing common keywords
    keywords = ['canal', 'c8', 'rue', 'nrj']
    
    print("\nChannel search results:")
    for kw in keywords:
        print(f"\nKeyword: {kw}")
        res = supabase.table('channels_fr').select('channel_id, name').ilike('name', f'%{kw}%').execute()
        for c in res.data or []:
            print(f"  ID: {c['channel_id']:<25} | Name: {c['name']}")

if __name__ == "__main__":
    main()
