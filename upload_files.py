#!/usr/bin/env python3
"""Script per caricare file sul server via SSH"""
import base64
import subprocess
import sys

def upload_file(local_path, remote_path, ssh_script):
    """Carica un file sul server usando base64"""
    print(f"📤 Caricamento {local_path} -> {remote_path}...")
    
    # Leggi e codifica il file
    with open(local_path, 'rb') as f:
        content_b64 = base64.b64encode(f.read()).decode('utf-8')
    
    # Crea script Python per scrivere sul server
    python_script = f'''
import base64
import os

content = """{content_b64}"""
os.makedirs(os.path.dirname("{remote_path}"), exist_ok=True)
with open("{remote_path}", "wb") as f:
    f.write(base64.b64decode(content))
os.chmod("{remote_path}", 0o755)
print("✅ File scritto: {remote_path}")
'''
    
    # Esegui via SSH
    cmd = f'bash {ssh_script} "python3"'
    proc = subprocess.Popen(cmd, shell=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    stdout, stderr = proc.communicate(input=python_script)
    
    if proc.returncode == 0:
        print(f"✅ {local_path} caricato con successo")
        return True
    else:
        print(f"❌ Errore caricamento {local_path}: {stderr}")
        return False

if __name__ == '__main__':
    ssh_script = 'ssh-pf.bash'
    
    # Upload epg_importer.py
    upload_file('scripts/epg_importer.py', '/home/u914016995/epg_importer_fr/epg_importer.py', ssh_script)
    
    # Upload check_and_cleanup_duplicates.py
    upload_file('scripts/check_and_cleanup_duplicates.py', '/home/u914016995/epg_importer_fr/scripts/check_and_cleanup_duplicates.py', ssh_script)
    
    print("\n✅ Upload completato!")
