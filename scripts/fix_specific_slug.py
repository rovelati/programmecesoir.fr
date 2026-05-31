
import os
import sys
from supabase import create_client
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
load_dotenv()

url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_KEY')
programs_table = os.getenv('SUPABASE_PROGRAMS_TABLE', 'programs_fr')

supabase = create_client(url, key)

program_id = '985cf9e3-0466-4d20-9ce6-30bf3c11f289'
slug = 'jeux-olympiques-dhiver-rediffusions'

print(f"Manually updating slug for program {program_id} to '{slug}'...")
try:
    res = supabase.table(programs_table).update({'slug': slug}).eq('id', program_id).execute()
    print("Update successful.")
    print(res.data)
except Exception as e:
    print(f"Update failed: {e}")
