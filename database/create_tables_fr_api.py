#!/usr/bin/env python3
"""
Script to create French tables (channels_fr, programs_fr) in Supabase via REST API
"""

import os
import sys
import requests
from dotenv import load_dotenv

def read_sql_file(file_path: str) -> str:
    """Read SQL file content"""
    with open(file_path, 'r', encoding='utf-8') as f:
        return f.read()

def execute_sql_via_api(supabase_url: str, service_key: str, sql: str):
    """Execute SQL via Supabase REST API"""
    # Supabase REST API endpoint for SQL execution
    # Note: This requires the SQL to be executed via the management API
    # We'll use the PostgREST API with rpc or direct SQL endpoint
    
    # For Supabase, we need to use the management API or psql
    # The REST API doesn't support arbitrary SQL execution for security reasons
    
    # Alternative: Use Supabase CLI or psql connection
    print("Supabase REST API doesn't support arbitrary SQL execution.")
    print("We'll need to use psql or Supabase CLI.")
    print("\nAttempting to use psql if available...")
    
    # Try to extract connection details from Supabase URL
    # Supabase projects have a connection string format
    # We can construct a psql connection string
    
    return False

def main():
    print("=" * 60)
    print("Creating French tables in Supabase")
    print("=" * 60)
    
    # Load environment variables
    env_path = os.path.join(os.path.dirname(__file__), '..', 'scripts', '.env')
    load_dotenv(env_path)
    
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_KEY')
    
    if not supabase_url or not supabase_key:
        print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
        print(f"Looking for .env at: {env_path}")
        return 1
    
    sql_file = os.path.join(os.path.dirname(__file__), 'setup_fr.sql')
    if not os.path.exists(sql_file):
        print(f"ERROR: SQL file not found: {sql_file}")
        return 1
    
    sql_content = read_sql_file(sql_file)
    
    print(f"\nSupabase URL: {supabase_url}")
    print(f"SQL file: {sql_file}")
    print("\n" + "=" * 60)
    print("OPTION 1: Execute via Supabase Dashboard (Recommended)")
    print("=" * 60)
    print("1. Go to: https://supabase.com/dashboard")
    print("2. Select your project")
    print("3. Go to SQL Editor")
    print("4. Copy and paste the SQL below")
    print("5. Click 'Run'")
    
    print("\n" + "=" * 60)
    print("OPTION 2: Use Supabase CLI")
    print("=" * 60)
    print("If you have Supabase CLI installed:")
    print(f"  supabase db execute --file {sql_file}")
    
    print("\n" + "=" * 60)
    print("SQL TO EXECUTE:")
    print("=" * 60)
    print(sql_content)
    print("=" * 60)
    
    # Try to check if psql is available
    import subprocess
    try:
        result = subprocess.run(['which', 'psql'], capture_output=True, text=True)
        if result.returncode == 0:
            print("\n" + "=" * 60)
            print("OPTION 3: Use psql (if you have connection string)")
            print("=" * 60)
            print("You can connect to Supabase using psql with:")
            print("  psql 'postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres'")
            print(f"  Then execute: \\i {sql_file}")
    except:
        pass
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
