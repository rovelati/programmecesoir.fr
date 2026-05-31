#!/usr/bin/env python3
"""
Execute SQL via Supabase Management API
"""

import os
import sys
import requests
from dotenv import load_dotenv

def read_sql_file(file_path: str) -> str:
    """Read SQL file content"""
    with open(file_path, 'r', encoding='utf-8') as f:
        return f.read()

def execute_sql_via_management_api(supabase_url: str, service_key: str, sql: str):
    """Execute SQL via Supabase Management API"""
    # Supabase Management API endpoint
    # Format: https://api.supabase.com/v1/projects/{project_ref}/database/query
    
    # Extract project ref from URL
    # URL format: https://[project_ref].supabase.co
    project_ref = supabase_url.replace('https://', '').replace('.supabase.co', '').split('.')[0]
    
    management_api_url = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"
    
    headers = {
        'Authorization': f'Bearer {service_key}',
        'Content-Type': 'application/json'
    }
    
    # Note: The Management API might require different authentication
    # Let's try the REST API approach first
    
    # Actually, Supabase doesn't expose SQL execution via REST API for security
    # We need to use psql or the dashboard
    
    return False

def main():
    env_path = os.path.join(os.path.dirname(__file__), '..', 'scripts', '.env')
    load_dotenv(env_path)
    
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_KEY')
    
    if not supabase_url or not supabase_key:
        print("ERROR: Missing environment variables")
        return 1
    
    sql_file = os.path.join(os.path.dirname(__file__), 'setup_fr.sql')
    sql_content = read_sql_file(sql_file)
    
    print("=" * 70)
    print("CREAZIONE TABELLE FRANCESI IN SUPABASE")
    print("=" * 70)
    print("\n⚠️  IMPORTANTE: Le tabelle devono essere create manualmente")
    print("   perché Supabase non permette l'esecuzione SQL via API REST")
    print("\n" + "=" * 70)
    print("ISTRUZIONI:")
    print("=" * 70)
    print("\n1. Vai su: https://supabase.com/dashboard")
    print("2. Seleziona il tuo progetto")
    print("3. Vai su 'SQL Editor' (menu laterale)")
    print("4. Clicca su 'New query'")
    print("5. Copia e incolla il seguente SQL:")
    print("\n" + "-" * 70)
    print(sql_content)
    print("-" * 70)
    print("\n6. Clicca su 'Run' (o premi Cmd/Ctrl + Enter)")
    print("\n7. Verifica che le tabelle siano state create:")
    print("   - Vai su 'Table Editor'")
    print("   - Dovresti vedere 'channels_fr' e 'programs_fr'")
    print("\n" + "=" * 70)
    print("Dopo aver creato le tabelle, esegui di nuovo l'importer:")
    print("=" * 70)
    print("cd /Users/romolovelati/Desktop/programmitnt.fr/scripts")
    print("source venv/bin/activate")
    print("python3 epg_importer.py")
    print("=" * 70)
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
