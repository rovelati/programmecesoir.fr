#!/usr/bin/env python3
"""
Check if French tables exist in Supabase
"""

import os
import sys
from supabase import create_client
from dotenv import load_dotenv

def main():
    env_path = os.path.join(os.path.dirname(__file__), '..', 'scripts', '.env')
    load_dotenv(env_path)
    
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_KEY')
    
    if not supabase_url or not supabase_key:
        print("ERROR: Missing environment variables")
        return 1
    
    try:
        supabase = create_client(supabase_url, supabase_key)
        
        # Try to query channels_fr
        try:
            result = supabase.table('channels_fr').select('*').limit(1).execute()
            print("✅ Tabella 'channels_fr' esiste")
        except Exception as e:
            if 'PGRST205' in str(e) or 'not found' in str(e).lower():
                print("❌ Tabella 'channels_fr' NON esiste")
            else:
                print(f"⚠️  Errore verificando 'channels_fr': {str(e)}")
        
        # Try to query programs_fr
        try:
            result = supabase.table('programs_fr').select('*').limit(1).execute()
            print("✅ Tabella 'programs_fr' esiste")
        except Exception as e:
            if 'PGRST205' in str(e) or 'not found' in str(e).lower():
                print("❌ Tabella 'programs_fr' NON esiste")
            else:
                print(f"⚠️  Errore verificando 'programs_fr': {str(e)}")
        
        return 0
        
    except Exception as e:
        print(f"ERROR: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
