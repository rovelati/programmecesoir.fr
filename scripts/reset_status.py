import os
import sys
from supabase import create_client
from dotenv import load_dotenv
from datetime import datetime

def main():
    load_dotenv()
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_KEY')
    supabase = create_client(url, key)

    print("Resetting import status for 'epg_fr'...")
    res = supabase.table('import_status').update({
        'status': 'success', # Reset to success so it can be triggered again or just clear the 'running' state
        'finished_at': datetime.utcnow().isoformat(),
        'error_message': 'Manual reset of hung process'
    }).eq('id', 'epg_fr').execute()
    
    if res.data:
        print("Status reset successfully.")
    else:
        print("Failed to reset status or record not found.")

if __name__ == "__main__":
    main()
