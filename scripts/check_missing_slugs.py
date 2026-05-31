#!/usr/bin/env python3
"""
Quick script to check how many programs are missing slugs
"""

import os
import sys
from supabase import create_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_KEY')
PROGRAMS_TABLE = os.getenv('SUPABASE_PROGRAMS_TABLE', 'programs_fr')

if not url or not key:
    print("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    sys.exit(1)

print("🔌 Connecting to Supabase...")
supabase = create_client(url, key)

# Count total programs
print("📊 Counting programs...")
total_result = supabase.table(PROGRAMS_TABLE).select('id', count='exact', head=True).execute()
total_count = total_result.count or 0

# Count programs without slug
without_slug_result = supabase.table(PROGRAMS_TABLE).select('id', count='exact', head=True).is_('slug', 'null').execute()
without_slug_count = without_slug_result.count or 0

# Count programs with slug
with_slug_count = total_count - without_slug_count

print("\n" + "="*60)
print("📈 STATISTICHE SLUG")
print("="*60)
print(f"Total programmes:        {total_count:,}")
print(f"Programmes avec slug:    {with_slug_count:,} ({with_slug_count/total_count*100:.1f}%)" if total_count > 0 else "Programmes avec slug:    0")
print(f"Programmes sans slug:     {without_slug_count:,} ({without_slug_count/total_count*100:.1f}%)" if total_count > 0 else "Programmes sans slug:     0")
print("="*60)

if without_slug_count > 0:
    print(f"\n⚠️  {without_slug_count:,} programmes n'ont pas de slug et doivent être mis à jour.")
else:
    print("\n✅ Tous les programmes ont un slug!")
