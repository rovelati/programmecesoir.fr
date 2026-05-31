#!/usr/bin/env python3
"""
Script to create French tables (channels_fr, programs_fr) in Supabase
"""

import os
import sys
from supabase import create_client, Client
from dotenv import load_dotenv

def read_sql_file(file_path: str) -> str:
    """Read SQL file content"""
    with open(file_path, 'r', encoding='utf-8') as f:
        return f.read()

def execute_sql(supabase: Client, sql: str):
    """Execute SQL statements"""
    # Split by semicolon and execute each statement
    statements = [s.strip() for s in sql.split(';') if s.strip() and not s.strip().startswith('--')]
    
    for statement in statements:
        if not statement:
            continue
        try:
            # Use RPC or direct SQL execution
            # Note: Supabase Python client doesn't support raw SQL directly
            # We need to use the REST API or Supabase dashboard
            print(f"Executing: {statement[:100]}...")
        except Exception as e:
            print(f"Error executing statement: {str(e)}")
            print(f"Statement: {statement[:200]}")

def main():
    print("=" * 60)
    print("Creating French tables in Supabase")
    print("=" * 60)
    
    # Load environment variables
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'scripts', '.env'))
    
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_KEY')
    
    if not supabase_url or not supabase_key:
        print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
        print("Please set these in scripts/.env")
        return 1
    
    sql_file = os.path.join(os.path.dirname(__file__), 'setup_fr.sql')
    if not os.path.exists(sql_file):
        print(f"ERROR: SQL file not found: {sql_file}")
        return 1
    
    sql_content = read_sql_file(sql_file)
    
    print("\n" + "=" * 60)
    print("IMPORTANT: Supabase Python client doesn't support raw SQL execution")
    print("Please execute the SQL manually in Supabase Dashboard:")
    print("=" * 60)
    print("\n1. Go to: https://supabase.com/dashboard")
    print("2. Select your project")
    print("3. Go to SQL Editor")
    print("4. Copy and paste the following SQL:")
    print("\n" + "-" * 60)
    print(sql_content)
    print("-" * 60)
    print("\n5. Click 'Run' to execute")
    print("\nAlternatively, you can use psql or Supabase CLI")
    print("=" * 60)
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
