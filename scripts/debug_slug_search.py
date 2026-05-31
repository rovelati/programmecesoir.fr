#!/usr/bin/env python3
"""
Debug script to check if a program slug exists in database
"""

import os
import sys
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_KEY')
PROGRAMS_TABLE = os.getenv('SUPABASE_PROGRAMS_TABLE', 'programs_fr')

if not url or not key:
    print("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    sys.exit(1)

# Get slug from command line or use default
search_slug = sys.argv[1] if len(sys.argv) > 1 else 'surf-et-peche-au-perou-une-pratique-millenaire'
channel_slug = sys.argv[2] if len(sys.argv) > 2 else 'arte'

print(f"🔍 Searching for program:")
print(f"   Channel: {channel_slug}")
print(f"   Slug: {search_slug}")
print()

supabase = create_client(url, key)

# First, find channel_id from slug
channels_result = supabase.table('channels_fr').select('channel_id, name').execute()
channels_data = channels_result.data or []

# Find channel by slug (simple match)
found_channel = None
for ch in channels_data:
    ch_slug = str(ch.get('channel_id', '')).lower().replace('_', '-').replace(' ', '-')
    if ch_slug == channel_slug.lower() or str(ch.get('channel_id', '')).lower() == channel_slug.lower():
        found_channel = ch
        break

if not found_channel:
    print(f"❌ Channel '{channel_slug}' not found!")
    print(f"Available channels (first 10):")
    for ch in channels_data[:10]:
        print(f"  - {ch.get('channel_id')} ({ch.get('name')})")
    sys.exit(1)

channel_id = found_channel.get('channel_id')
print(f"✅ Found channel: {channel_id} ({found_channel.get('name')})")
print()

# Try exact slug match
print("1️⃣ Exact slug match:")
exact_result = supabase.table(PROGRAMS_TABLE)\
    .select('id, title, slug, start_time, date, channel_id')\
    .eq('channel_id', channel_id)\
    .eq('slug', search_slug)\
    .limit(5)\
    .execute()

exact_data = exact_result.data or []
print(f"   Found: {len(exact_data)} programs")
if exact_data:
    for p in exact_data:
        print(f"   ✅ {p.get('title')} | slug: {p.get('slug')} | date: {p.get('date')}")
else:
    print(f"   ❌ No exact match found")

print()

# Try case-insensitive search
print("2️⃣ Case-insensitive slug search:")
ci_result = supabase.table(PROGRAMS_TABLE)\
    .select('id, title, slug, start_time, date, channel_id')\
    .eq('channel_id', channel_id)\
    .ilike('slug', search_slug)\
    .limit(5)\
    .execute()

ci_data = ci_result.data or []
print(f"   Found: {len(ci_data)} programs")
if ci_data:
    for p in ci_data:
        print(f"   ✅ {p.get('title')} | slug: {p.get('slug')} | date: {p.get('date')}")

print()

# Try searching by title containing slug parts
print("3️⃣ Title search (slug parts):")
slug_parts = search_slug.split('-')
search_term = '%'.join(slug_parts[:3])
title_result = supabase.table(PROGRAMS_TABLE)\
    .select('id, title, slug, start_time, date, channel_id')\
    .eq('channel_id', channel_id)\
    .ilike('title', f'%{search_term}%')\
    .limit(10)\
    .execute()

title_data = title_result.data or []
print(f"   Found: {len(title_data)} programs")
if title_data:
    for p in title_data[:5]:
        print(f"   ✅ {p.get('title')} | slug: {p.get('slug')} | date: {p.get('date')}")

print()

# Check if slug exists at all (any channel)
print("4️⃣ Slug exists anywhere:")
any_result = supabase.table(PROGRAMS_TABLE)\
    .select('id, title, slug, channel_id, date')\
    .eq('slug', search_slug)\
    .limit(5)\
    .execute()

any_data = any_result.data or []
print(f"   Found: {len(any_data)} programs")
if any_data:
    for p in any_data:
        print(f"   ✅ {p.get('title')} | channel: {p.get('channel_id')} | slug: {p.get('slug')} | date: {p.get('date')}")
