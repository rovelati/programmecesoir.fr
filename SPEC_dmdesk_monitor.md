# SPEC — DMDesk CMS Monitor
## Spec-Driven Development per Cursor

> **Scopo**: monitoraggio della performance del CMS Atex OneCMS (dmdesk) con alerting Telegram e dashboard Supabase.  
> **Stack target**: Node.js (Hostinger), Playwright, Supabase, Telegram Bot API.

---

## 0. Struttura del progetto

```
dmdesk-monitor/
├── .env                        # credenziali (mai committare)
├── .env.example                # template variabili
├── package.json
├── monitor.js                  # entry point principale
├── lib/
│   ├── browser.js              # logica Playwright (login + load check)
│   ├── supabase.js             # client e query Supabase
│   ├── telegram.js             # invio notifiche
│   └── state.js                # gestione stato rosso/verde persistente
├── dashboard/
│   └── index.html              # dashboard statica (o Next.js minimal)
└── logs/
    └── .gitkeep
```

---

## 1. Variabili d'ambiente (.env)

```env
# DMDesk
DMDESK_URL=https://desk-robin.cloud.atex.com/act/#/edit/onecms:1qj3ck5vuic7upy76is?intent=web
DMDESK_LOGIN_URL=https://desk-robin.cloud.atex.com/act/
DMDESK_USERNAME=xxx
DMDESK_PASSWORD=xxx

# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=xxx

# Telegram
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=xxx

# Config
THRESHOLD_MS=5000          # soglia di allarme in ms (default 5000)
CHECK_INTERVAL_CRON=*/5 * * * *
CONSECUTIVE_GREEN_FOR_RECOVERY=2
```

---

## 2. Schema Supabase

### Tabella: `dmdesk_checks`

```sql
create table dmdesk_checks (
  id            bigserial primary key,
  checked_at    timestamptz not null default now(),
  success       boolean not null,
  duration_ms   integer,               -- null se errore fatale
  t_login_ms    integer,               -- ms fino a login completato
  t_article_ms  integer,               -- ms fino ad articolo caricato (DOM)
  t_tuurbo_ms   integer,               -- ms fino a console "tuurbo" rilevato
  status        text not null,         -- 'green' | 'red' | 'error'
  error_message text,                  -- stack/messaggio se fallisce
  alert_sent    boolean default false  -- se telegram inviato
);

-- indice per dashboard
create index on dmdesk_checks (checked_at desc);
```

### Tabella: `dmdesk_state`

```sql
create table dmdesk_state (
  id                    int primary key default 1,   -- riga unica
  current_status        text not null default 'unknown',
  consecutive_green     int not null default 0,
  last_alert_sent_at    timestamptz,
  updated_at            timestamptz default now()
);

-- inserire la riga iniziale
insert into dmdesk_state (id) values (1) on conflict do nothing;
```

---

## 3. Spec — `lib/browser.js`

### Funzione: `runCheck()`

**Responsabilità**: aprire un browser headless, fare login su dmdesk, navigare all'articolo specificato, misurare i tempi di caricamento.

**Definizione di "caricamento completato"**:  
L'app è full-AJAX (AngularJS + RequireJS). Il caricamento è considerato completo quando **entrambe** le seguenti condizioni sono vere:
1. Nella console JavaScript appare la stringa `"Pubtech.ai • Adv Engine"` oppure `"tuurbo"` (segnale che gli script di terze parti sono inizializzati — indica fine del ciclo di boot).
2. Il network è quiescente: nessuna richiesta `onecms:*` pendente per almeno **2 secondi consecutivi** (osservare tab Network).

**Timeout massimo**: 60 secondi. Se non si raggiunge la condizione di completamento entro 60s → `status: 'error'`, `success: false`.

**Algoritmo step-by-step**:

```
STEP 1 — Setup
  - Lanciare Playwright con browser Chromium headless
  - Intercettare eventi console: page.on('console', ...)
  - Intercettare risposta network: page.on('response', ...)
  - t0 = Date.now()

STEP 2 — Login
  - Navigare a DMDESK_LOGIN_URL
  - Attendere selettore input username visibile (max 15s)
  - Compilare username e password
  - Cliccare submit
  - Attendere redirect/URL change che NON contenga "login" (max 15s)
  - t_login_ms = Date.now() - t0

STEP 3 — Navigazione articolo
  - Navigare a DMDESK_URL
  - Attendere che il DOM contenga almeno un elemento con classe
    `.oc-widget` o `.copyfit-element` (max 30s)
  - t_article_ms = Date.now() - t0

STEP 4 — Rilevamento "tuurbo" (fine caricamento)
  - Ascoltare console per stringa che contenga "Pubtech.ai" o "tuurbo"
    oppure attendere quiescenza network (2s senza chiamate onecms:*)
  - t_tuurbo_ms = Date.now() - t0  (al primo evento di completamento)

STEP 5 — Risultato
  - duration_ms = t_tuurbo_ms
  - success = true
  - status = duration_ms > THRESHOLD_MS ? 'red' : 'green'
  - Chiudere browser

STEP 6 — Errore (catch globale)
  - success = false
  - status = 'error'
  - error_message = err.message + stack (troncato a 500 chars)
  - Chiudere browser se aperto
```

**Ritorna oggetto**:
```js
{
  success: boolean,
  duration_ms: number | null,
  t_login_ms: number | null,
  t_article_ms: number | null,
  t_tuurbo_ms: number | null,
  status: 'green' | 'red' | 'error',
  error_message: string | null
}
```

---

## 4. Spec — `lib/supabase.js`

### `saveCheck(result)`
- INSERT su `dmdesk_checks` con tutti i campi del risultato + `checked_at: new Date()`
- Ritorna `{ id }` del record inserito

### `getState()`
- SELECT * FROM `dmdesk_state` WHERE id = 1
- Ritorna oggetto stato corrente

### `updateState({ current_status, consecutive_green, last_alert_sent_at })`
- UPDATE `dmdesk_state` SET ... WHERE id = 1, aggiorna anche `updated_at`

### `getHistory(limit = 100)`
- SELECT * FROM `dmdesk_checks` ORDER BY checked_at DESC LIMIT limit
- Usata dalla dashboard

### `getStats(hours = 24)`
- Ritorna: `{ total, green, red, error, avg_ms, p95_ms, uptime_pct }`
- Query su `dmdesk_checks` delle ultime N ore

---

## 5. Spec — `lib/telegram.js`

### `sendAlert({ duration_ms, checked_at, consecutive_fails })`

Messaggio formato:
```
🔴 *DMDesk CMS — LENTEZZA RILEVATA*

⏱ Tempo caricamento: *{duration_ms}ms* (soglia: {THRESHOLD_MS}ms)
🕐 Rilevato alle: {checked_at}
📋 Articolo: https://desk-robin.cloud.atex.com/act/...

cc @romolo
```

### `sendRecovery({ duration_ms, checked_at, downtime_minutes })`

```
✅ *DMDesk CMS — RIPRISTINATO*

⏱ Tempo caricamento ora: *{duration_ms}ms*
🕐 Ripristino alle: {checked_at}
⏳ Durata problema: ~{downtime_minutes} minuti
```

### `sendError({ error_message, checked_at })`

```
⚠️ *DMDesk CMS — ERRORE CHECK*

❌ {error_message}
🕐 {checked_at}
```

---

## 6. Spec — `lib/state.js`

### `processResult(checkResult)`

Logica di stato e alerting:

```
CARICA stato corrente da Supabase (getState())

SE result.status == 'green':
  consecutive_green += 1
  SE stato_precedente == 'red' E consecutive_green >= CONSECUTIVE_GREEN_FOR_RECOVERY:
    → sendRecovery(...)
    → current_status = 'green'
    → consecutive_green = 0
  ALTRIMENTI:
    → current_status = 'green' (nessun messaggio)

SE result.status == 'red':
  consecutive_green = 0
  SE stato_precedente != 'red':
    → sendAlert(...)
    → alert_sent = true
    → last_alert_sent_at = now()
  ALTRIMENTI (già rosso):
    → NON inviare alert (evitare spam)
  current_status = 'red'

SE result.status == 'error':
  consecutive_green = 0
  SE stato_precedente != 'error':
    → sendError(...)
  current_status = 'error'

AGGIORNA stato su Supabase (updateState())
```

---

## 7. Spec — `monitor.js` (entry point)

```js
// Eseguito dal cron ogni 5 minuti
async function main() {
  const result = await runCheck()          // lib/browser.js
  const record = await saveCheck(result)   // lib/supabase.js
  await processResult(result)              // lib/state.js (include telegram)
  console.log(`[${new Date().toISOString()}] status=${result.status} duration=${result.duration_ms}ms`)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
```

---

## 8. Spec — Dashboard (`dashboard/index.html`)

**Single-page HTML statica** con fetch diretta a Supabase REST API (usando `anon key`).  
Servita da Hostinger come file statico su una porta dedicata o via path.

### Sezioni:

**Header KPI** (ultimi 24h):
- ✅ Uptime %
- ⏱ Avg load time (ms)
- 🔴 Numero di check in red
- 📊 P95 load time

**Status corrente** (badge verde/rosso/giallo):
- Mostra stato dell'ultimo check con timestamp

**Grafico sparkline** (ultimi 100 check):
- X: tempo, Y: duration_ms
- Linea rossa orizzontale a THRESHOLD_MS
- Punti colorati: verde < soglia, rosso >= soglia, grigio = error
- Libreria: Chart.js CDN (nessuna dipendenza backend)

**Tabella history** (ultimi 50 check):
| Timestamp | Status | Login ms | Article ms | Tuurbo ms | Total ms | Alert |
- Righe rosse se status = red
- Righe grigie se status = error
- Paginazione client-side

**Auto-refresh**: ogni 60 secondi via `setInterval + fetch`

---

## 9. Spec — Pre-flight check Hostinger

Prima del deploy, verificare con questo script:

```bash
#!/bin/bash
echo "=== Node version ===" && node --version
echo "=== NPM version ===" && npm --version
echo "=== Chromium disponibile ===" && which chromium-browser || which chromium || echo "MANCANTE"
echo "=== Python ===" && python3 --version
echo "=== Crontab access ===" && crontab -l 2>/dev/null && echo "OK" || echo "ERRORE"
echo "=== Spazio disco ===" && df -h ~
echo "=== RAM ===" && free -h
```

**Requisiti minimi Hostinger**:
- Node.js >= 18
- npm >= 9
- Chromium (installato o installabile via `npx playwright install chromium`)
- Accesso crontab

---

## 10. Deploy su Hostinger

```bash
# 1. Upload progetto (via SSH o Git)
cd ~/dmdesk-monitor

# 2. Installare dipendenze
npm install

# 3. Installare browser Playwright
npx playwright install chromium --with-deps

# 4. Creare .env con le credenziali (mai committare)
cp .env.example .env
nano .env

# 5. Test manuale
node monitor.js

# 6. Verificare output su Supabase e Telegram
```

---

## 11. Crontab da inserire su Hostinger

```cron
# DMDesk CMS Monitor — ogni 5 minuti
*/5 * * * * cd /home/UTENTE/dmdesk-monitor && /usr/local/bin/node monitor.js >> /home/UTENTE/dmdesk-monitor/logs/monitor.log 2>&1
```

> ⚠️ Sostituire `/home/UTENTE/` con il path reale verificato su Hostinger.  
> Verificare path Node con: `which node`

**Rotazione log** (aggiungere al crontab):
```cron
# Pulizia log ogni domenica alle 3:00
0 3 * * 0 find /home/UTENTE/dmdesk-monitor/logs/ -name "*.log" -mtime +30 -delete
```

---

## 12. Dipendenze package.json

```json
{
  "name": "dmdesk-monitor",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@playwright/test": "^1.44.0",
    "@supabase/supabase-js": "^2.43.0",
    "dotenv": "^16.4.0"
  }
}
```

---

## 13. Checklist implementazione (ordine suggerito per Cursor)

- [ ] 1. Creare schema Supabase (SQL in sezione 2)
- [ ] 2. Implementare `lib/supabase.js` e testare connessione
- [ ] 3. Implementare `lib/telegram.js` e testare invio manuale
- [ ] 4. Implementare `lib/browser.js` — solo STEP 1-3 (login + navigazione)
- [ ] 5. Aggiungere STEP 4 (rilevamento tuurbo/quiescenza network)
- [ ] 6. Implementare `lib/state.js` con logica alerting
- [ ] 7. Comporre `monitor.js`
- [ ] 8. Test locale: `node monitor.js` — verificare record su Supabase e messaggio Telegram
- [ ] 9. Pre-flight check su Hostinger (sezione 9)
- [ ] 10. Deploy e crontab
- [ ] 11. Costruire dashboard HTML statica
- [ ] 12. Testare scenario completo: forzare timeout per verificare alert rosso → recovery verde

---

## 14. Note tecniche critiche

### Rilevamento "tuurbo" su app AJAX
L'app usa AngularJS + RequireJS. Il boot sequenziale è:
1. `angular.js` bootstrap
2. Chiamate `onecms:*` (miriade di XHR paralleli — vedi screenshot Network)
3. CKEditor init (può generare errori non bloccanti su plugin mancanti — **ignorarli**)
4. `Pubtech.ai • Adv Engine` in console → **questo è il segnale di completamento**

Gli errori di console come `processExcludeList: toolWidget not found` e `CKEDITOR.error` sono **noise atteso** — non devono influenzare il check.

### CSP violations
I log mostrano errori CSP su `data:video/mp4` e `blob:` — sono errori noti e non bloccanti. **Ignorarli** nel check.

### Gestione sessione
Il CMS potrebbe avere sessioni con scadenza. Lo script deve fare **login completo ad ogni run** (non riusare cookie tra esecuzioni). Playwright in modalità headless senza `userDataDir` persistente garantisce sessione pulita.

### Timeout differenziati
- Login: max 15s → se supera → `status: 'error'` con messaggio "Login timeout"
- Navigazione articolo: max 30s
- Rilevamento tuurbo: max 60s totali dall'inizio

### Playwright su Hostinger
Se Hostinger non permette installazione di Chromium system-wide, usare:
```bash
PLAYWRIGHT_BROWSERS_PATH=~/playwright-browsers npx playwright install chromium
```
e aggiungere al crontab:
```
PLAYWRIGHT_BROWSERS_PATH=/home/UTENTE/playwright-browsers
```
