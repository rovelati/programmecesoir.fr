# programmecesoir.fr — Architettura del progetto

## Panoramica

Sito SEO-first che risponde alle query "programme tv ce soir / maintenant / demain (sur chaîne)".
SPA React servita come pagine statiche su hosting condiviso (Hostinger),
con dati EPG importati ogni ora da XMLTVFR e conservati su Supabase.

---

## Stack

| Componente | Tecnologia |
|---|---|
| Frontend | React 18 + Vite, Tailwind CSS, React Router v6 |
| Database | Supabase (PostgreSQL) — tabelle `channels_fr`, `programs_fr` |
| Sorgente dati EPG | https://xmltvfr.fr/xmltv/xmltv_fr.xml.gz |
| EPG Importer | Python 3 (`scripts/epg_importer.py`) |
| Sitemap Generator | Node.js (`frontend/scripts/generate-sitemap.js`) |
| Hosting frontend | Hostinger (Apache + `.htaccess` SPA rewrite) |
| Cron EPG | Hostinger crontab, ogni ora alle :00 |
| Timezone di riferimento | `Europe/Paris` |

---

## Struttura repository

```
programmecesoir.fr/
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # Routing, state, fetch orchestration
│   │   ├── components/
│   │   │   ├── Footer.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── ChannelCard.tsx
│   │   │   ├── ChannelPage.tsx
│   │   │   ├── ProgramPage.tsx        # Pagina singolo programma
│   │   │   ├── Credits.tsx
│   │   │   └── Recommender.tsx
│   │   ├── hooks/
│   │   │   └── usePrograms.ts         # Fetch programmi da Supabase
│   │   ├── types/
│   │   │   ├── index.ts
│   │   │   ├── entities.ts
│   │   │   └── birthday.ts
│   │   └── utils/
│   │       ├── bootstrapData.ts       # Lettura dati pre-renderizzati
│   │       ├── channelSlug.ts         # Slug canale ↔ channel_id
│   │       ├── entityRoutes.ts        # Percorsi entità (film, serie, attore)
│   │       └── seo.ts                 # JSON-LD, title, meta
│   ├── scripts/
│   │   └── generate-sitemap.js        # Generatore sitemap XML + HTML
│   ├── public/
│   │   ├── robots.txt
│   │   ├── .htaccess
│   │   ├── sitemap.xml               # Indice (generato)
│   │   ├── sitemap-static.xml        # Pagine statiche (generato)
│   │   ├── sitemap-programmes.xml    # Programmi (generato)
│   │   ├── plan-du-site/index.html   # Sitemap HTML (generato)
│   │   ├── entities-data/            # JSON entità pre-generate
│   │   └── birthday-data/            # JSON compleanni
│   └── dist/                          # Output build (deploy)
├── scripts/
│   ├── epg_importer.py
│   ├── requirements.txt
│   └── .env                           # Credenziali server-side
├── database/
│   └── setup_fr.sql
├── deploy.sh
└── production.md                      # Credenziali produzione
```

---

## Database

### Tabella `channels_fr`

| Colonna | Tipo | Note |
|---|---|---|
| id | serial PK | |
| channel_id | text UNIQUE | Identificativo XMLTV (es. `TF1.fr`) |
| name | text | Nome display |
| logo_url | text | URL logo |
| channel_number | integer | Numero canale TNT |
| category | text | |

### Tabella `programs_fr`

| Colonna | Tipo | Note |
|---|---|---|
| id | serial PK | |
| channel_id | text FK | Riferimento a `channels_fr.channel_id` |
| title | text | |
| description | text | |
| start_time | timestamptz | |
| end_time | timestamptz | |
| date | date | Data di messa in onda |
| time_slot | text | `aujourdhui` / `ce-soir` / `nuit` |
| genre | text | |
| rating | text | |

### Indici

- `idx_programs_fr_date` su `date`
- `idx_programs_fr_channel` su `channel_id`
- `idx_programs_fr_timeslot` su `time_slot`
- `idx_programs_fr_datetime` su `(start_time, end_time)`

### RLS

Lettura pubblica abilitata su entrambe le tabelle (policy `SELECT … USING (true)`).

---

## Routing URL

### Pagine statiche

| URL | Descrizione |
|---|---|
| `/` | Homepage (programme TV ce soir) |
| `/en-direct` | Programmi in diretta |
| `/demain` | Programmi di domani |
| `/plan-du-site/` | Sitemap HTML |
| `/conditions-generales` | T&C |
| `/politique-cookies` | Cookie policy |
| `/credits` | Crediti |
| `/films` | Indice film |
| `/series` | Indice serie |
| `/acteurs` | Indice attori |
| `/anniversaire-du-jour` | Compleanni del giorno |
| `/anniversaires-acteurs` | Archivio compleanni |
| `/recommandes` | Raccomandati |
| `/recherche` | Ricerca |

### Canali

| Pattern | Esempio | Descrizione |
|---|---|---|
| `/:slug` | `/tf1` | Programmi oggi di un canale |
| `/ce-soir/:slug` | `/ce-soir/tf1` | Programmi stasera |
| `/en-direct/:slug` | `/en-direct/tf1` | In diretta su canale |
| `/demain/:slug` | `/demain/tf1` | Domani su canale |
| `/radio/:slug` | `/radio/france-inter` | Canale radio |

### Categorie

| Pattern | Esempio |
|---|---|
| `/film-ce-soir` | Film stasera |
| `/series-ce-soir` | Serie stasera |
| `/sport-ce-soir` | Sport stasera |
| `/documentaires-ce-soir` | Documentari stasera |
| `/infos-ce-soir` | Notizie stasera |
| `/divertissement-ce-soir` | Intrattenimento stasera |
| `/jeunesse-ce-soir` | Programmi per ragazzi stasera |
| `/culture-ce-soir` | Cultura stasera |

### Entità

| Pattern | Esempio |
|---|---|
| `/film/:slug` | `/film/le-grand-bleu` |
| `/serie/:slug` | `/serie/les-bracelets-rouges` |
| `/acteur/:slug` | `/acteur/jean-dujardin` |
| `/anniversaire/:slug` | `/anniversaire/jean-dujardin` |

### Programmi

| Pattern | Descrizione |
|---|---|
| `/programme/:channelSlug/:programSlug` | Pagina singolo programma |

Gli slug sono normalizzati: lowercase, rimozione accenti (NFD), solo `a-z0-9-`.

### Parole riservate (non interpretate come slug canale)

Definite in `frontend/src/utils/channelSlug.ts` → set `reserved`:

`ce-soir`, `maintenant`, `en-direct`, `demain`, `programme`, `recherche`,
`politique-cookies`, `conditions-generales`, `credits`, `films`, `film`,
`series`, `serie`, `acteurs`, `acteur`, `recommandes`, `film-ce-soir`,
`series-ce-soir`, `sport-ce-soir`, `documentaires-ce-soir`,
`jeunesse-ce-soir`, `culture-ce-soir`, `infos-ce-soir`, `divertissement-ce-soir`.

Quando si aggiunge una nuova route statica, aggiungerla anche a questo set.

---

## EPG Importer

### Funzionamento

`scripts/epg_importer.py`:

1. Scarica il feed XMLTV gzip da XMLTVFR.
2. Parsa canali e programmi dal XML.
3. Estrae il numero canale TNT dal dato `<display-name>` (con fallback da mappa statica).
4. Calcola il `time_slot` per ogni programma in base all'ora di inizio (fuso `Europe/Paris`):
   - `06:00–17:59` → `aujourdhui`
   - `18:00–23:59` → `ce-soir`
   - `00:00–05:59` → `nuit`
5. Upsert canali su `channels_fr` (on conflict `channel_id`).
6. Cancella programmi esistenti per le date che sta per importare, poi inserisce in batch.
7. Elimina programmi più vecchi di `RETENTION_DAYS` (default: 2 giorni).
8. Chiama `generate-sitemap.js` per rigenerare le sitemap.

### Variabili ambiente (`.env`)

| Variabile | Descrizione |
|---|---|
| `SUPABASE_URL` | URL progetto Supabase |
| `SUPABASE_SERVICE_KEY` | Chiave service_role |
| `EPG_XMLTV_URL` | URL feed XMLTV (default: xmltvfr.fr) |
| `SITEMAP_DOMAIN` | `https://programmecesoir.fr` |
| `SITEMAP_PUBLIC_DIR` | Directory pubblica sul server |
| `LOG_FILE` | Percorso file di log |

### Cron

```
0 * * * * /home/u914016995/epg_importer_fr/venv/bin/python /home/u914016995/epg_importer_fr/epg_importer.py >> /home/u914016995/.logs/epg_importer_fr.log 2>&1
```

Esecuzione: ogni ora alle :00.

### Dipendenze Python

```
requests
supabase
python-dotenv
pytz
```

---

## Sitemap

### File generati

| File | Contenuto | Generato da |
|---|---|---|
| `sitemap.xml` | Indice sitemap | `generate-sitemap.js` |
| `sitemap-static.xml` | Pagine statiche + canali `/demain/:slug` + entità + compleanni | `generate-sitemap.js` |
| `sitemap-programmes.xml` | Pagine programma (`/programme/...`) | `generate-sitemap.js` |
| `plan-du-site/index.html` | Sitemap HTML navigabile | `generate-sitemap.js` |

### Logica di priorità per programmi

Lo script assegna priorità in base alla distanza dal giorno corrente:

| Condizione | Priorità | changefreq |
|---|---|---|
| In onda oggi | 1.0 | daily |
| In onda domani | 0.9 | daily |
| In onda entro 3 giorni | 0.8 | daily |
| In onda entro 7 giorni | 0.7 | daily |
| In onda dopo 7 giorni | 0.6 | weekly |
| Solo passato (entro 2 giorni) | 0.6 | daily |
| Solo passato (oltre 2 giorni) | escluso | — |

L'indice mette `sitemap-programmes.xml` prima di `sitemap-static.xml` per dare precedenza ai contenuti dinamici.

### Limiti

- Max 50.000 URL per sitemap (limite standard).
- I programmi più vecchi di 2 giorni vengono rimossi dal DB e dalla sitemap.

### Pagine statiche incluse

`/`, `/en-direct`, `/demain`, `/plan-du-site/`, `/conditions-generales`,
`/politique-cookies`, `/credits`, `/anniversaire-du-jour`,
`/anniversaires-acteurs`, `/films`, `/series`, `/acteurs`.

Più: ogni canale con `/demain/:slug`, ogni entità da `entities-data/routes.json`,
e ogni articolo compleanno da `birthday-data/articles/`.

---

## robots.txt

```
User-agent: *
Allow: /

Sitemap: https://programmecesoir.fr/sitemap.xml

Disallow: /admin/
Disallow: /api/
```

---

## SEO e qualità dei contenuti

### Strategia noindex

Le pagine programma (`/programme/...`) usano `<meta name="robots" content="noindex">` se il contenuto è sotto soglia:
- manca la descrizione significativa
- il programma non ha abbastanza informazioni per generare copy utile

Questo evita indicizzazione di pagine "thin content".

### JSON-LD

Tipi usati:
- `WebSite` — homepage
- `BroadcastEvent` — singolo programma
- `BroadcastService` — canale
- `FAQPage` — FAQ generate sulle pagine programma
- `ItemList` — liste di programmi

Il cleanup JSON-LD rimuove solo gli script con `data-seo-managed="1"` (non tocca script esterni).

### Contenuti arricchiti sulle pagine programma

Ogni pagina programma include (quando i dati lo permettono):
- Descrizione contestuale (da EPG o da `content_enrichment_fr`)
- Sezione "Pourquoi regarder" (motivi di visione)
- Insight sulla categoria del programma
- FAQ contestuali con `FAQPage` JSON-LD
- Blocco "Alternatives proches" (programmi correlati cross-canale)

### URL canoniche

Ogni pagina ha un `<link rel="canonical">` appropriato.
La sitemap HTML (`/plan-du-site/`) ha canonical `https://programmecesoir.fr/plan-du-site/`.

---

## Caricamento frontend (SPA)

### Bootstrap data

Per velocizzare il primo caricamento e ridurre le chiamate Supabase, l'HTML può includere un tag
`<script id="app-bootstrap-data" type="application/json">` con dati pre-renderizzati.

Struttura del payload (`BootstrapPayload` in `utils/bootstrapData.ts`):

| Campo | Tipo | Descrizione |
|---|---|---|
| `routePath` | string | Path della pagina pre-renderizzata |
| `pageState` | PageState | Stato iniziale (tipo pagina, canale, ecc.) |
| `viewMode` | TimeView | Vista temporale |
| `programs` | array | Programmi pre-caricati |
| `programFallback` | object | Fallback per singolo programma |
| `entity` | object | Dati entità (film/serie/attore) |
| `entityIndex` | object | Indice entità |
| `birthdayArticle` | object | Articolo compleanno |

Il frontend controlla che `routePath` corrisponda all'URL corrente; se non corrisponde, ignora i dati e fa fetch normali.

### Ottimizzazione pagina programma (accesso diretto)

Quando l'utente accede direttamente a `/programme/:ch/:prog`:

1. `getInitialPageStateFromUrl()` riconosce subito l'URL e imposta `pageState = { type: 'program-loading' }`.
2. `usePrograms` viene disabilitato (skip) perché il programma verrà cercato individualmente.
3. I dati vengono recuperati con una query mirata per channel slug + program slug, senza caricare la griglia completa.
4. Se il bootstrap contiene già il programma (`programFallback`), non viene fatta nessuna chiamata aggiuntiva.

### Caricamento progressivo homepage "en direct"

La home live (`/en-direct`) carica i canali in lane progressive:
1. **Lane TNT**: canali TNT principali (priorità alta).
2. **Lane extra**: canali secondari.
3. **Lane background**: merge completo in background.

Questo approccio garantisce che i canali più importanti appaiano per primi.

---

## Deploy

### Build frontend

```bash
cd frontend
npm install
npm run build
```

Output in `frontend/dist/`.

### Upload su server

```bash
# dist/
scp -P 65002 -r frontend/dist/* u914016995@89.116.147.83:/home/u914016995/domains/programmecesoir.fr/public_html/

# file pubblici
scp -P 65002 frontend/public/robots.txt u914016995@89.116.147.83:/home/u914016995/domains/programmecesoir.fr/public_html/
scp -P 65002 frontend/public/.htaccess u914016995@89.116.147.83:/home/u914016995/domains/programmecesoir.fr/public_html/

# rigenerare compleanni
ssh -p 65002 u914016995@89.116.147.83 /home/u914016995/programmecesoir_birthday/run_birthday_generation_server.sh
```

Oppure usare lo script automatico:

```bash
./deploy.sh
```

### Aggiornamento EPG Importer su server

```bash
scp -P 65002 scripts/epg_importer.py u914016995@89.116.147.83:~/epg_importer_fr/
scp -P 65002 frontend/scripts/generate-sitemap.js u914016995@89.116.147.83:~/epg_importer_fr/
```

### Struttura file su server

```
/home/u914016995/domains/programmecesoir.fr/public_html/
├── index.html
├── assets/
├── robots.txt
├── .htaccess
├── sitemap.xml
├── sitemap-static.xml
├── sitemap-programmes.xml
└── plan-du-site/index.html

/home/u914016995/epg_importer_fr/
├── epg_importer.py
├── generate-sitemap.js
├── .env
├── requirements.txt
├── run_importer.sh
└── venv/
```

---

## Credenziali

Le credenziali **non** vanno messe in chiaro nella documentazione.
Riferimenti:

| Dove | Cosa contiene |
|---|---|
| `scripts/.env` | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, config EPG |
| `frontend/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `~/epg_importer_fr/.env` (server) | Copia di `scripts/.env` con path server |
| `database/connection_backup_20260319.md` | Backup tutte le credenziali (DB, API) |

---

## Verifica post-deploy

```bash
# Sito raggiungibile
curl -I https://programmecesoir.fr

# Sitemap valide
curl -s https://programmecesoir.fr/sitemap.xml | head -20
curl -s https://programmecesoir.fr/sitemap-static.xml | head -20
curl -s https://programmecesoir.fr/sitemap-programmes.xml | head -20

# robots.txt
curl https://programmecesoir.fr/robots.txt

# Log importer
ssh -p 65002 u914016995@89.116.147.83
tail -f ~/.logs/epg_importer_fr.log
```

---

## Troubleshooting

### Sitemap non aggiornata

1. Verificare che il cron sia attivo: `crontab -l | grep epg_importer`
2. Controllare i log: `tail -100 ~/.logs/epg_importer_fr.log`
3. Verificare che `SITEMAP_PUBLIC_DIR` nel `.env` server punti alla directory corretta.
4. Eseguire manualmente: `cd ~/epg_importer_fr && source venv/bin/activate && python3 epg_importer.py`

### Programmi duplicati

L'importer cancella i programmi per data prima di inserire. Se ci sono duplicati:
1. Verificare che il campo `date` sia popolato correttamente.
2. Eventuale cleanup manuale: `DELETE FROM programs_fr WHERE date < NOW() - INTERVAL '2 days';`

### URL canale restituisce 410

Se una nuova route statica viene interpretata come slug canale,
aggiungerla al set `reserved` in `frontend/src/utils/channelSlug.ts`.

### Numero canale "CH 0"

L'importer estrae il numero da `<display-name>` nel XMLTV.
Se un canale TNT non ha il numero nel feed, viene usata una mappa di fallback
definita in `epg_importer.py` (`TNT_FALLBACK_NUMBERS`).

### Pagina programma con noindex indesiderato

Verificare che il programma abbia almeno una descrizione significativa.
La soglia è calcolata da `hasSubstantialDescription` in `ProgramPage.tsx`.
