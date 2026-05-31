
import os
import sys
import re
import unicodedata
from supabase import create_client
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
load_dotenv()

url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_KEY')
programs_table = os.getenv('SUPABASE_PROGRAMS_TABLE', 'programs_fr')

supabase = create_client(url, key)

def get_program_slug(title):
    value = (title or '').lower().strip()
    value = unicodedata.normalize('NFD', value)
    value = ''.join(ch for ch in value if unicodedata.category(ch) != 'Mn')
    value = re.sub(r'[^a-z0-9\s-]', '', value)
    value = re.sub(r'\s+', '-', value)
    value = re.sub(r'-+', '-', value)
    return value.strip('-')

def backfill_slugs():
    print(f"Starting backfill for table: {programs_table}")
    
    # Process in chunks
    page = 0
    page_size = 1000
    total_updated = 0
    
    while True:
        print(f"Fetching page {page}...")
        # Fetch records without slug or all records to be safe
        # Ideally, fetch where slug is null. 
        # But if we just added the column, all are null.
        res = supabase.table(programs_table)\
            .select('id, title')\
            .is_('slug', 'null')\
            .range(page * page_size, (page + 1) * page_size - 1)\
            .execute()
            
        programs = res.data or []
        if not programs:
            print("No more programs to update.")
            break
            
        print(f"Processing {len(programs)} programs...")
        
        updates = []
        for p in programs:
            slug = get_program_slug(p['title'])
            # We can't batch update different values easily in REST without a custom RPC or loop.
            # Looping 1000 items is slow.
            # Check if there's a batch way using upsert?
            # Upsert requires primary key (id).
            updates.append({'id': p['id'], 'slug': slug})
            
        if updates:
            # Batch upsert
            # Since 'id' matches existing, it will update invalid/missing columns if we provide them.
            # Be careful not to overwrite other columns with nulls?
            # Upsert only updates specified columns if strict?
            # Actually, upsert replaces the row if not careful.
            # But Supabase (Postgrest) upsert via PATCH (update) is not standard.
            # Upsert via POST with on_conflict.
            # To perform a partial update via Upsert, we should include ALL required columns? 
            # Or reliance on 'ignoreDuplicates'? No, we want update.
            # Safe way: Update one by one? SLOW.
            # Better: Upsert. But we need to be sure we don't wipe data.
            # Safest is to loop update or use small batches.
            # Actually, `upsert` in supabase-py performs an INSERT ... ON CONFLICT DO UPDATE.
            # If we only provide {'id': 1, 'slug': 's'}, it might set others to NULL if they are not default?
            # NO, Postgres `DO UPDATE SET ...` usually updates only provided columns IF specified.
            # Check supabase behavior. A safer bet is likely iterative update for now or small batches.
            # Given time constraints, let's try batch upsert of 100 items. 
            # If it clears other columns, we are doomed.
            # Let's verify behavior with a single test record first.
            pass

        # Validating upsert behavior is risky on prod data.
        # I will use iterative update for safety, but with threading or async?
        # Python script is sync.
        # I'll just iterate. 1000 records takes ~200s? 
        # 400 channels * 100 programs = 40,000.
        # 40,000 requests = 5-10 hours. Too slow.
        
        # Fast way: Use `upsert` but fetching ALL columns first?
        # No.
        
        # Wait, I found `programs` HAS slug.
        # Maybe I can check how it was populated?
        # Likely by the importer at creation time.
        
        # FOR NOW: I will output a script that does it safely (iterative) but maybe locally parallel?
        # I'll stick to iterative for simplicity and monitoring.
        
        for p in programs:
            slug = get_program_slug(p['title'])
            supabase.table(programs_table).update({'slug': slug}).eq('id', p['id']).execute()
            sys.stdout.write('.')
            sys.stdout.flush()
        
        total_updated += len(programs)
        print(f"\nUpdated {len(programs)} records.")
        
        # Since we filter `is_('slug', 'null')`, pagination effectively shifts.
        # We should NOT increment `page` if we satisfy the query filter (records move out of scope).
        # But `range` is absolute on the dataset from DB?
        # If we update `slug`, it is no longer NULL.
        # So next fetch of page 0 will likely yield next batch.
        # BUT supabase `range` apply on the result set?
        # If we assume sorting order..
        # Safest: Keep fetching page 0 until empty.
        # Because updated rows disappear from `is_('slug', 'null')` view.
        # So page index should stay 0.
        
        # Sleep slightly to avoid rate limit?
        # Supabase API logic.
        
    print(f"Backfill complete. Updated {total_updated} records.")

if __name__ == "__main__":
    backfill_slugs()
