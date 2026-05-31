import os
import re
import unicodedata
from supabase import create_client
from dotenv import load_dotenv

def slugify(value: str) -> str:
    """Unified slugification logic matching frontend."""
    value = (value or '').lower().strip()
    value = unicodedata.normalize('NFD', value)
    value = ''.join(ch for ch in value if unicodedata.category(ch) != 'Mn')
    value = re.sub(r'[^a-z0-9\s-]', '', value)
    value = re.sub(r'\s+', '-', value)
    value = re.sub(r'-+', '-', value)
    return value.strip('-')

def main():
    load_dotenv()
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_KEY')
    supabase = create_client(url, key)

    print("Fetching all channels...")
    channels = supabase.table('channels_fr').select('*').execute().data or []
    print(f"Found {len(channels)} channels.")

    for ch in channels:
        old_id = ch['channel_id']
        name = ch['name']
        new_id = slugify(name)
        
        if old_id != new_id:
            print(f"Updating: '{name}' | {old_id} -> {new_id}")
            
            # 1. Create new channel record (copy of old)
            new_ch = ch.copy()
            new_ch['channel_id'] = new_id
            
            try:
                # Upsert new channel
                supabase.table('channels_fr').upsert(new_ch).execute()
                
                # 2. Update all programs pointing to old_id
                # Note: This might be slow if many programs exist.
                # We do it by date to be safer or just in bulk if possible.
                res = supabase.table('programs_fr').update({'channel_id': new_id}).eq('channel_id', old_id).execute()
                print(f"  Updated {len(res.data or [])} programs.")
                
                # 3. Delete old channel record if it's different
                if old_id != new_id:
                    supabase.table('channels_fr').delete().eq('channel_id', old_id).execute()
                    print(f"  Deleted old channel record: {old_id}")
                    
            except Exception as e:
                print(f"  FAILED to update {old_id}: {str(e)}")

    print("\nRefresh complete.")

if __name__ == "__main__":
    main()
