# Deploy programmecesoir.fr

Guida rapida al deploy. Per l'architettura completa vedi `ARCHITECTURE.md`.

## 1. Build frontend

```bash
cd frontend
npm install
npm run build
```

## 2. Upload frontend

```bash
# Script automatico (raccomandato)
./deploy.sh

# Oppure manuale:
scp -P 65002 -r frontend/dist/* u914016995@89.116.147.83:/home/u914016995/domains/programmecesoir.fr/public_html/
scp -P 65002 frontend/public/robots.txt u914016995@89.116.147.83:/home/u914016995/domains/programmecesoir.fr/public_html/
scp -P 65002 frontend/public/.htaccess u914016995@89.116.147.83:/home/u914016995/domains/programmecesoir.fr/public_html/
```

## 3. Post-deploy

```bash
# Rigenerare compleanni del giorno
ssh -p 65002 u914016995@89.116.147.83 /home/u914016995/programmecesoir_birthday/run_birthday_generation_server.sh
```

## 4. Aggiornamento EPG Importer

```bash
scp -P 65002 scripts/epg_importer.py u914016995@89.116.147.83:~/epg_importer_fr/
scp -P 65002 frontend/scripts/generate-sitemap.js u914016995@89.116.147.83:~/epg_importer_fr/
```

## 5. Verifica

```bash
curl -I https://programmecesoir.fr
curl https://programmecesoir.fr/robots.txt
curl -s https://programmecesoir.fr/sitemap.xml | head -20
```

## Credenziali

Non in chiaro qui. Riferimenti:

- **Server-side**: `scripts/.env`
- **Frontend**: `frontend/.env`
- **Server remoto**: `~/epg_importer_fr/.env`
- **Backup**: `database/connection_backup_20260319.md`

## Setup iniziale server

Vedi sezione "Deploy" in `ARCHITECTURE.md` per setup venv, Node.js e crontab.
