# Task: Image Enricher per programmi TV — programmecesoir.fr

## Contesto

Il sito `programmecesoir.fr` è una guida TV francese che recupera il palinsesto da sorgenti EPG e lo salva su **Supabase** (PostgreSQL). I programmi sono già strutturati in tabella. Mancano le immagini associate (poster/thumbnail di film, serie, episodi).

Lo scopo di questo task è costruire uno **script Python autonomo** che:
1. Legga i programmi privi di immagine da Supabase
2. Cerchi l'immagine corrispondente su fonti esterne (TMDB come primario, TVmaze come fallback)
3. Scarichi l'immagine sul **filesystem locale** del server (Hostinger, Linux)
4. Salvi solo il **percorso/URL pubblico** dell'immagine su Supabase (nessun blob nel DB)
5. Gestisca la **deduplicazione per serie**: un poster per serie, non uno per episodio

---

## Stack tecnico

- **Python 3.10+**
- **Supabase Python SDK** (`supabase-py`) per lettura/scrittura
- **httpx** o **requests** per chiamate API esterne
- **Variabili d'ambiente** via `.env` (gestite con `python-dotenv`)
- Il sito gira su **Hostinger** (Linux shared/VPS), il cron è gestito via hPanel o crontab di sistema

---

## Schema Supabase rilevante

Lo script deve assumere che la tabella principale si chiami `programs` con almeno questi campi (chiedere conferma prima di generare migrazioni):

```sql
-- Campi esistenti (assunti)
id           UUID PRIMARY KEY
title        TEXT         -- titolo del programma (potrebbe essere il titolo dell'episodio)
show_title   TEXT         -- titolo della serie (se diverso da title, altrimenti NULL)
year         INT          -- anno di produzione (può essere NULL)
type         VARCHAR(20)  -- 'movie' | 'series' | 'episode' | 'sport' | 'news' | 'other'
channel      TEXT         -- nome canale
start_time   TIMESTAMPTZ

-- Campi da aggiungere con migrazione
image_url         TEXT          -- URL pubblico dell'immagine servita dal sito
image_source      VARCHAR(20)   -- 'tmdb' | 'tvmaze' | NULL
image_fetched_at  TIMESTAMPTZ   -- timestamp dell'ultimo tentativo (anche se fallito)
tmdb_id           INT           -- opzionale, utile per re-fetch futuri
```

Fornire la **migrazione SQL** come file separato `migration_add_images.sql`.

---

## Fonti immagini

### 1. TMDB (primario)
- API key richiesta (gratuita su themoviedb.org)
- Endpoint film: `GET /3/search/movie?query={title}&year={year}&language=fr-FR`
- Endpoint serie: `GET /3/search/tv?query={title}&language=fr-FR`
- Immagine: `https://image.tmdb.org/t/p/w500{poster_path}`
- Rate limit: 40 req / 10s → aggiungere sleep di 0.25s tra chiamate

### 2. TVmaze (fallback per serie/episodi)
- Nessuna autenticazione richiesta
- Endpoint: `GET https://api.tvmaze.com/singlesearch/shows?q={title}`
- Campo immagine: `response["image"]["original"]`

### Logica di selezione fonte
```
type == 'movie'           → TMDB /search/movie
type in ('series', 'episode') → TMDB /search/tv, fallback TVmaze
type in ('sport', 'news', 'other') → SKIP (image_fetched_at = now(), image_url = NULL)
```

---

## Deduplicazione serie

Per evitare N chiamate API per N episodi della stessa serie:
- Usare `show_title` (o `title` se `show_title` è NULL) come chiave di cache in memoria
- La cache è un dizionario `series_cache: dict[str, str | None]` (titolo → url immagine locale)
- Se la chiave è già in cache, riusare direttamente il valore senza chiamate API
- La cache è locale alla singola esecuzione (non persistita)

---

## Filesystem immagini

**Percorso base**: `/home/u{account}/domains/programmecesoir.fr/public_html/images/programs/`  
(il percorso esatto va parametrizzato via `.env` come `IMAGE_BASE_PATH`)

**Struttura directory**:
```
images/programs/
  tmdb/
    {tmdb_id}.jpg
  tvmaze/
    {tvmaze_id}.jpg
```

**URL pubblico salvato su Supabase**:
```
https://programmecesoir.fr/images/programs/tmdb/{tmdb_id}.jpg
```
Anche l'URL base va parametrizzato via `.env` come `IMAGE_BASE_URL`.

**Comportamento download**:
- Se il file esiste già su disco, non ri-scaricarlo (skip silenzioso)
- Salvare in JPEG, qualità 85 (usare `Pillow` per conversione se necessario)
- Creare le directory se non esistono (`os.makedirs(..., exist_ok=True)`)

---

## Variabili d'ambiente (.env)

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=service_role_key
TMDB_API_KEY=xxxx
IMAGE_BASE_PATH=/home/u12345/domains/programmecesoir.fr/public_html/images/programs
IMAGE_BASE_URL=https://programmecesoir.fr/images/programs
BATCH_SIZE=100
SLEEP_BETWEEN_REQUESTS=0.25
```

---

## Comportamento script

1. **Lettura batch**: selezionare da Supabase i record dove `image_fetched_at IS NULL`, ordinati per `start_time DESC`, limite `BATCH_SIZE`
2. **Loop per record**:
   a. Classificare il tipo
   b. Controllare cache serie (se applicabile)
   c. Chiamare API esterna
   d. Scaricare immagine su disco
   e. Aggiornare record Supabase con `image_url`, `image_source`, `image_fetched_at = now()`
3. **Gestione errori**:
   - API non risponde o 429: retry con backoff esponenziale (max 3 tentativi)
   - Nessun risultato trovato: impostare `image_fetched_at = now()`, `image_url = NULL` (non ritentare)
   - Errore download immagine: loggare e continuare
4. **Logging**: usare il modulo `logging` standard, output su stdout + file `enricher.log` nella stessa directory dello script. Livello INFO di default, DEBUG se `LOG_LEVEL=DEBUG` in `.env`
5. **Idempotenza**: rieseguibile senza duplicati. I record già processati (con `image_fetched_at NOT NULL`) vengono saltati automaticamente dal filtro Supabase

---

## File da produrre

| File | Descrizione |
|------|-------------|
| `enricher.py` | Script principale |
| `tmdb_client.py` | Wrapper TMDB API |
| `tvmaze_client.py` | Wrapper TVmaze API |
| `image_store.py` | Download e salvataggio immagini su disco |
| `migration_add_images.sql` | Migrazione Supabase per aggiungere le colonne |
| `.env.example` | Template variabili d'ambiente |
| `requirements.txt` | Dipendenze Python |
| `README.md` | Istruzioni setup, configurazione cron su Hostinger |

---

## Cron su Hostinger

Il README deve includere la riga crontab da aggiungere via hPanel (o crontab -e su VPS):

```cron
0 3 * * * cd /home/u12345/domains/programmecesoir.fr && /usr/bin/python3 enricher.py >> enricher.log 2>&1
```

L'orario (03:00) è pensato per girare dopo l'import EPG notturno.

---

## Note aggiuntive

- Il titolo EPG francese può differire dal titolo originale TMDB: usare prima la ricerca in `fr-FR`, poi se zero risultati ritentare senza lingua (TMDB restituirà titolo originale)
- Non usare `asyncio` per semplicità di deploy su Hostinger; lo script è sincrono e sequenziale
- Non serve un DB di lock/semaforo: il cron è singolo e il filtro `image_fetched_at IS NULL` è sufficiente
