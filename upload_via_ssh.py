#!/usr/bin/env python3
"""Carica file sul server usando ssh-pf.bash"""
import subprocess
import base64
import os

def upload_file(local_path, remote_path):
    """Carica un file sul server"""
    print(f"📤 Caricamento {local_path}...")
    
    # Leggi e codifica
    with open(local_path, 'rb') as f:
        content_b64 = base64.b64encode(f.read()).decode()
    
    # Crea comando Python breve
    python_cmd = f"import base64,os;os.makedirs(os.path.dirname('{remote_path}'),exist_ok=True);open('{remote_path}','wb').write(base64.b64decode('{content_b64}'));os.chmod('{remote_path}',0o755);print('OK')"
    
    # Esegui via SSH
    cmd = f'bash ssh-pf.bash "python3 -c \\"{python_cmd}\\""'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    
    if 'OK' in result.stdout:
        print(f"✅ {os.path.basename(local_path)} caricato")
        return True
    else:
        print(f"❌ Errore: {result.stderr[:200]}")
        return False

if __name__ == '__main__':
    upload_file('scripts/epg_importer.py', '/home/u914016995/epg_importer_fr/epg_importer.py')
    upload_file('scripts/check_and_cleanup_duplicates.py', '/home/u914016995/epg_importer_fr/scripts/check_and_cleanup_duplicates.py')
    print("\n✅ Upload completato!")
