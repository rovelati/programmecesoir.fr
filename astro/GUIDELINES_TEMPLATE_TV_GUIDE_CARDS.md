# Standard Architetturale per Guide TV: Template a Card, Palinsesti e Backend

Questo documento raccoglie tutte le regole tecniche, grafiche e sistemistiche consolidate nello sviluppo di **tvch.ch** e **intvstasera.it**. Serve da riferimento per replicare fedelmente il design e l'infrastruttura su altri progetti (es. *programmecesoir.fr*, *fernsehheute.de*, *tvwieczor.pl*) evitando gli errori riscontrati.

---

## 1. CMP (Consenso Cookie) & Analytics Isolati

### 1.1 Regola di Isolamento per Dominio
Ogni dominio deve avere esclusivamente le proprie credenziali per evitare violazioni GDPR e tracciamenti incrociati scorretti:
* **Mai copiare tag CMP o GA4** da un progetto all'altro senza sostituire ID e licenza.
* Per UniConsent: inserire sempre come **primo script nel `<head>`**, prima di GTM, GA4 o AdSense:
  ```html
  <!-- UniConsent CMP dedicato al dominio specifico -->
  <script is:inline src="https://cmp.uniconsent.com/v2/cmp.js" data-license="ID_DEDICATO"></script>
  ```
* Per GA4: caricare dopo il CMP con `anonymize_ip: true`.
* **Dark Mode Anti-FOUC**: Inserire uno script sincrono inline con `data-cfasync="false"` per applicare la classe `.dark` al tag `<html>` prima del rendering, prevenendo sfarfallii bianchi al caricamento.

---

## 2. Gestione Loghi Canale (Prevenzione "Loghi Giganti o Sovrapposti")

### 2.1 Causa del Problema
Molti loghi forniti dagli upstream EPG (IPTV-EPG o API esterne) hanno proporzioni e risoluzioni eterogenee (es. 512x100 px o 512x389 px). Senza vincoli dimensionali rigidi su tutti gli elementi antenati (`<a>`, `<span>`, `<img>`), l'immagine espande il contenitore fino al 100% della larghezza o altezza della card, oscurando la fotografia.

### 2.2 Standard di Implementazione Sicuro
1. **Asset Locali su CDN Proprietaria**:
   Tutti i canali principali devono avere un file locale SVG o PNG in `/public/channel-logos/<id>.svg|png`. Questo garantisce:
   - Zero blocchi da Hotlink Protection di terzi.
   - Tempi di risposta istantanei (cache Cloudflare Pages).
   - Sfondi trasparenti uniformi.

2. **Mappatura Slug con Normalizzazione**:
   Supportare sia le varianti con trattino che compatte (es. `la-5` e `la5`, `20` e `canale-20`, `twenty-seven` e `mediaset-27`).

3. **Regole CSS Rigide per il Pill del Logo nella Card**:
   ```html
   <!-- Contenitore pill con larghezza massima protetta -->
   <a
     href={channelPageUrl}
     class="flex items-center gap-2 bg-black/85 hover:bg-black/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/15 hover:border-red-500/60 shadow-lg group/ch transition-all max-w-[65%]"
     aria-label={`Palinsesto ${channelName}`}
   >
     {channelLogo ? (
       <span class="inline-flex items-center justify-center h-6 max-h-6 max-w-[80px] overflow-hidden shrink-0">
         <img
           src={channelLogo}
           alt={channelName}
           class="max-h-6 max-w-[80px] w-auto h-auto object-contain group-hover/ch:scale-105 transition-transform"
           style="max-height: 24px; max-width: 80px; height: 24px; width: auto; object-fit: contain;"
           loading="lazy"
           onerror="this.style.display='none'"
         />
       </span>
     ) : (
       <span class="text-xs font-black text-white truncate">{channelName}</span>
     )}
     {channelNumber && (
       <span class="text-[10px] font-bold text-gray-400 bg-gray-800/80 px-1.5 py-0.5 rounded shrink-0">
         CH {channelNumber}
       </span>
     )}
   </a>
   ```

---

## 3. Pipeline Immagini & Fotografie HD (Zero Marchi Terzi)

### 3.1 La Gerarchia di Risoluzione (Priority Cascade)
Per ogni programma la selezione dell'immagine 16:9 (`heroImage`) deve seguire questo ordine:
1. **Notiziari & Meteo (Override Obbligatorio)**: TG e Meteo non devono mai mostrare locandine generiche o stock irrilevanti; vengono mappati forzatamente sui pool fotografici dedicati (studi di registrazione / cieli e montagne ad alta risoluzione).
2. **Show Televisivi Popolari**: Tabella con foto dedicate HD per i 30 show di punta (Affari Tuoi, Striscia, Le Iene, ecc.).
3. **TMDb Backdrop (Widescreen 16:9 HD)**: Se presente `backdrop_url` (upscalato a `w1280` o `w780`).
4. **TMDb Poster**: Se non esiste backdrop ma c'è un poster (upscalato a `w780`).
5. **Pool Fotografico Tematico Unsplash (16:9)**: Selezionato deterministicamente tramite hash del titolo + orario (rotazione dinamica per film, serie, documentari, cucina, sport, talk show).

### 3.2 Blacklist Tassativa di Asset Terzi
Nessun file o URL contenente i seguenti pattern deve mai arrivare al frontend:
* `superguidatv` / `share-1200` (banner promozionali social di concorrenti).
* Foto stock che mostrano schermi con loghi registrati non pertinenti (es. televisione con logo Netflix).
* Funzione di pulizia centralizzata (`upscaleImageUrl`):
  ```typescript
  export function upscaleImageUrl(url?: string | null): string | null {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return null;
    const lower = url.toLowerCase();
    if (lower.includes('superguidatv') || lower.includes('share-1200')) {
      return null;
    }
    // Rimuove thumbnail a bassa definizione EPG
    let upgraded = url.replace('/media/cache/epg_program_small/', '/')
                      .replace('/media/cache/epg_program_medium/', '/')
                      .replace('/w200/', '/w780/')
                      .replace('/w300/', '/w780/')
                      .replace('/w500/', '/w780/');
    return upgraded;
  }
  ```

---

## 4. Sincronizzazione Live Dinamica vs Build Statico (SSG)

### 4.1 Il Rischio del Build Statico
Se un sito è compilato staticamente su Cloudflare Pages (`output: 'static'`), la scheda *"IN ONDA ADESSO"* mostra solo il programma che era in onda all'ora esatta del build del server (diventando obsoleta dopo 30 minuti).

### 4.2 La Soluzione a Doppio Strato (Dual-Layer Sync)
1. **Strato SEO (SSR/Static)**: L'HTML iniziale renderizza il programma più probabile e include i microdati Schema.org validi per Googlebot.
2. **Strato Client Dinamico (Embedded JSON)**:
   La pagina include un payload JSON compatto con tutti i programmi della giornata:
   ```html
   <script id="channel-schedule-json" type="application/json" set:html={JSON.stringify(schedulePayload)} />
   ```
3. **Script di Sincronizzazione Client-Side**:
   All'avvio e a intervalli regolari (ogni 30 secondi):
   - Legge `Date.now()` nel fuso orario del visitatore (`Europe/Rome` o `Europe/Zurich`).
   - Trova il programma con `startMs <= now && endMs > now`.
   - Se il programma è cambiato rispetto all'HTML iniziale, aggiorna via DOM:
     - Titolo, trama e badge.
     - Immagine hero (con fallback).
     - Barra di avanzamento percentuale: `((now - start) / (end - start)) * 100`.
     - Minuti rimanenti: `Math.round((end - now) / 60000) min rimasti`.
     - Sposta i programmi terminati nel blocco "Precedenti".
     - Aggiorna l'anteprima del programma successivo.

4. **Orologio in Lingua Locale nella Barra Breadcrumb**:
   Visualizzare un orologio reale aggiornato al secondo:
   > 🟢 `Martedì 17 Novembre · Ore 09:45`

---

## 5. Struttura del Palinsesto Giornaliero (Fascia 06:00 – 02:00)

### 5.1 La Giornata Televisiva Europea
In televisione il giorno di trasmissione non termina alle 23:59, ma si estende fino alle **02:00 / 03:00 del mattino seguente**. I programmi tra le 00:00 e le 02:00 sono archiviati nel database con la data del giorno successivo (`tomorrow`).

### 5.2 Regola di Query Backend
Per mostrare il palinsesto completo fino a notte fonda, la pagina del canale deve sempre interrogare sia `today` che `tomorrow`:
```typescript
const [todayProgs, tomorrowProgs] = await Promise.all([
  fetchProgramsForDate(todayDate, channelId),
  fetchProgramsForDate(tomorrowDate, channelId)
]);

// Include i programmi fino alle 02:30 della notte successiva
const cutoffNextMorning = new Date(`${tomorrowDate}T02:30:00+01:00`).getTime();
const fullSchedule = [...todayProgs, ...tomorrowProgs.filter(p => new Date(p.startTime).getTime() <= cutoffNextMorning)];
```

### 5.3 Organizzazione Visiva in Pagina
1. **Hero Live Card**: Programma in onda adesso con progress bar rossa Ferrari, pulsante streaming e anteprima del programma successivo.
2. **Pulsante Accordion Programmi Mattutini**:
   *"Mostra programmi precedenti di oggi (dalle 06:00)"* — nascosti di default per non obbligare l'utente a fare scroll di 20 programmi già trasmessi.
3. **Timeline Successiva (Fino alle 02:00)**:
   Elenco cronologico con orario di inizio, fine, categoria, badge ⭐ **PRIMA SERATA** alle 21:15, e pulsante *"Ricordamelo"* (notifica push).

---

## 6. UX Pulsante Play & Tooltip (Zero Conflitti Visivi)

* **Problema Riscontrato**: Inserire l'attributo HTML `title="Vedi streaming su..."` su un pulsante che ha già un badge tooltip grafico CSS causa la visualizzazione di **due tooltip contemporaneamente**, di cui uno generato dal browser che si posiziona casualmente sopra la timeline o la progress bar.
* **Regola**:
  - **NON** usare l'attributo `title` sui bottoni/link con tooltip CSS personalizzato.
  - Usare invece `aria-label="Vedi streaming su sito ufficiale di Canale"` per l'accessibilità (screen reader).
  - Il tooltip grafico deve avere classe `pointer-events-none` per non intercettare click indesiderati.

---

## 7. Automazione Backend & Cron su VPS

Per evitare che il sito mostri palinsesti vuoti o statici:
1. **Aggiornamento EPG Multiplo Giornaliero**:
   Gli upstream pubblicano i palinsesti del giorno solo dopo le 05:00 del mattino. Non basta un cron notturno alle 01:00.
   - **01:00**: Primo caricamento preliminare.
   - **06:00**: Ingestione ufficiale dei palinsesti del mattino e del giorno.
   - **12:00**: Sincronizzazione pomeridiana con eventuali cambi di programmazione dell'ultimo minuto.
2. **Rebuild Statico Astro Schedulato**:
   Configurare il rebuild alle ore **02:15, 07:15, 13:15, 18:15** in modo che avvenga sempre *dopo* l'arricchimento EPG e TMDb.
3. **Flock Anti-Overlap**: Usare sempre `/usr/bin/flock -n /tmp/project-rebuild.lock` nei cron per evitare che due build concorrenti corrompano la cartella `.astro` o `dist`.

---

## 8. Dati Strutturati SEO (JSON-LD Schema.org)

Ogni pagina canale e homepage deve includere i microdati completi:
* `Organization`: Editore e logo del portale.
* `BroadcastService` & `TVChannel`: Dati dell'emittente con geolocalizzazione (`geoCoordinates`) per canali nazionali o regionali.
* `BroadcastEvent` con `workPerformed` (`TVEpisode` o `Movie`): Titolo, date ISO di inizio e fine, genere, locandina e `potentialAction: WatchAction` con URL dello streaming ufficiale.
* `ItemList`: Elenco ordinato dei programmi in palinsesto.
* `BreadcrumbList`: Percorso di navigazione gerarchico.
* `FAQPage`: Domande frequenti su dove vedere il canale e come vederlo in diretta streaming.

---

## 9. Selezione Smart della Prima Serata (Regola "Programma Breve" & "Assenza Foto")

### 9.1 Il Problema dei Programmi Brevi Pre-Serale
Nei palinsesti europei (es. Rai 1 con *Cinque Minuti* alle 20:30, TF1 con brevi rubriche o meteo serale alle 20:45), molti canali inseriscono trasmissioni di durata minima (3–10 minuti). Se la card di "Prima Serata" seleziona semplicemente il primo programma che inizia tra le 20:30 e le 21:00:
1. L'utente visualizza nella card di prima serata una micro-rubrica invece del vero show/film serale.
2. Rischio di grave disallineamento visivo: la pillola di 5 minuti (es. talk politico di Bruno Vespa) rischia di ricevere la foto dello show successivo (es. Stefano De Martino per *Affari Tuoi*) a causa di query SQL con finestre temporali troppo permissive.

### 9.2 Regola di Avanzamento Automatico
Nel motore di selezione del prime time (`buildAllSlotCards` in `src/lib/epg.ts` o componente equivalente):
* Se il primo candidato nella fascia serale ha durata $\le 20$ minuti **OPPURE** non ha una fotografia valida (`!hasValidPhoto(firstCandidate)`):
  - La card avanza automaticamente al candidato successivo.
  - Se anche il secondo dura poco, si avanza al primo programma con durata standard ($\ge 25$ min) o inizio alle 21:00–21:20.
* **Finestra di Matching SQL Stretta per l'Enrichment**:
  - Quando si importano foto da API ufficiali dei broadcaster (RaiPlay, TF1+, France Télévisions), la finestra di tolleranza oraria deve essere ridotta a **$\le 150$ secondi** (mai $\pm 300$ o $\pm 600$ secondi).
  - Verificare sempre la similarità del titolo con soglia minima (es. `are_titles_similar(db_title, api_title) >= 0.6`).

---

## 10. Gerarchia Artwork Broadcaster vs TMDb & Ordine Enricher

### 10.1 Causa delle Sovrascritture Indesiderate
TMDb fornisce eccellenti locandine per film e serie TV internazionali, ma spesso restituisce sfondi orizzontali generici per talk show, varietà o trasmissioni locali, rischiando di sovrascrivere le fotografie HD originali fornite dalle emittenti.

### 10.2 Ordine di Esecuzione e Protezione Dati
1. **Priorità Assoluta alle Foto Broadcaster**:
   - `broadcaster_poster / backdrop` (es. RaiPlay, TivùSat, Sky per l'Italia; TF1+, france.tv, M6+, Canal+ per la Francia).
   - `tmdb_backdrop` (solo se non esiste già una foto broadcaster).
   - `tmdb_poster`.
   - `unsplash_pool` tematico.
2. **Fix `COALESCE` in SQL**:
   Nel codice Python degli script di arricchimento TMDb (`enrich_tmdb.py`), preservare sempre l'immagine esistente:
   ```python
   # CORRETTO: non sovrascrive un backdrop già presente
   cur.execute("""
       UPDATE programs
       SET backdrop_url = COALESCE(backdrop_url, %s),
           poster_url   = COALESCE(poster_url, %s)
       WHERE id = %s;
   """, (tmdb_backdrop, tmdb_poster, prog_id))
   ```
3. **Sequenza nello Script di Rebuild**:
   Eseguire sempre prima l'arricchimento TMDb e **dopo** l'arricchimento dei broadcaster ufficiali:
   ```bash
   python3 scripts/enrich_tmdb.py --limit 350
   python3 scripts/enrich_official_broadcasters.py --days 2
   ```

---

## 11. Tassonomia e Cataloghi Sportivi Dedicati (Neutralizzazione Fallback Generico)

### 11.1 Il Rischio dei Fallback Generici "Sport"
Assegnare un'unica cartella o array "sport" generico provoca accoppiamenti grotteschi segnalati dagli utenti:
* Un match di tennis (es. ATP Finals) con la foto di un calciatore.
* Una corsa di ippica o una gara di salto con gli sci con la foto di un centometrista sui blocchi di partenza.
* Una partita amichevole di calcio con la foto di un incontro di arti marziali.

### 11.2 Standard di Catalogazione Sportiva
1. **Isolamento dei Pool per Categoria Riconosciuta**:
   Creare pool fotografici specifici a 16:9 HD basati su keyword nel titolo e nella descrizione:
   - `ippica / courses hippiques`: foto di cavalli da corsa e fantini al galoppo/trotto.
   - `salto con gli sci / saut à ski`: foto di trampolini innevati e sciatori in volo.
   - `tennis`: campi in terra/erba, racchette, palline da tennis.
   - `calcio / football`: stadi, campi in erba, pallone da calcio.
   - `ciclismo / cyclisme`: ciclisti su strada, gruppi, Tour de France.
   - `motori / sports mécaniques`: F1, MotoGP, piste d'asfalto.
   - `atletica / athlétisme`: piste d'atletica rossa, staffette.
2. **Neutralizzazione del Fallback Generico**:
   Se uno sport non rientra nei pool dedicati, **non** usare la foto di un atleta di un altro sport. Usare una texture astratta di stadio/arena sportiva sfocata, oppure la card con solo logo del canale ed evento tipografico.

---

## 12. Resilienza dei Canali Canonici & Prevenzione Errori 404 (Route Statiche SSG)

### 12.1 Come si Genera il Bug del 404
1. Nei feed EPG esterni (es. IPTV-EPG o provider XMLTV), canali dedicati a squadre di calcio (es. *Inter TV*, *PSG TV*), canali regionali o canali tematici possono avere temporaneamente giornate con titoli segnaposto come `<title>No Data</title>`, `"No Game Today"`, `"Programmation à venir"`.
2. L'importer EPG scarta i titoli vuoti o non validi, lasciando il canale a 0 programmi.
3. La routine di pulizia (`remove_stale_channels()`) ritiene il canale "morto" o non più presente nel feed e lo **cancella** dalla tabella `channels` del database.
4. Quando Astro esegue `getStaticPaths()` per prerenderizzare le pagine statiche (`/[canale].astro` e `/[canale]/domani.astro`), interroga `fetchChannels()`. Poiché il canale è stato eliminato dalla tabella `channels`, **Astro non compila le route statiche**, generando un HTTP 404 permanente sul server web / Cloudflare Pages.

### 12.2 Architettura a 4 Pilastri Anti-404
Per evitare che qualsiasi canale canonico possa mai finire in 404:

1. **Whitelist Protetta nell'Importer EPG (`epg_importer.py`)**:
   ```python
   PROTECTED_CANONICAL_IDS = {
       'tf1', 'france-2', 'france-3', 'canal-plus', 'france-5', 'm6', 'arte',
       'c8', 'w9', 'tmc', 'tfx', 'gulli', 'lequipe', 'psg-tv', 'ol-tv',
   }

   def remove_stale_channels(supabase_or_pg, channels_data):
       current_ids = {c['id'] for c in channels_data if c.get('id')}
       # I canali protetti non vengono MAI inseriti tra gli stale da cancellare
       stale_ids = [
           row['channel_id'] for row in existing_channels
           if row['channel_id'] not in current_ids
           and row['channel_id'] not in PROTECTED_CANONICAL_IDS
       ]
   ```

2. **Array Statico di Salvataggio in `fetchChannels()` (`src/lib/epg.ts`)**:
   Anche in caso di azzeramento accidentale del database, Astro deve comunque conoscere i canali canonici:
   ```typescript
   const MANDATORY_CANONICAL_CHANNELS: RawChannel[] = [
     {
       id: 9001,
       channel_id: 'psg-tv',
       name: 'PSG TV',
       logo_url: '/channel-logos/psg-tv.png',
       channel_number: 99,
       category: 'Sport',
       source: 'canonical',
     },
   ];

   export async function fetchChannels(): Promise<Channel[]> {
     const { rows } = await pool.query(`SELECT ... FROM channels ...`);
     // Merge dei canali obbligatori se non presenti nella query DB
     for (const canon of MANDATORY_CANONICAL_CHANNELS) {
       if (!rows.some(r => r.channel_id === canon.channel_id)) {
         rows.push({
           ...canon,
           config_id: canon.channel_id,
           config_name: canon.name,
           config_visible: true,
           config_position: canon.channel_number ?? 999,
           logo_override: null,
         });
       }
     }
     return rows.map(...);
   }
   ```

3. **Script di Seeding Continuo al Deploy (`ensure_essential_channels.py`)**:
   Invocato nel workflow di build (`deploy.sh` o `rebuild-and-deploy-vps.sh`) **prima** di avviare `npm run build`:
   - Esegue un `INSERT ... ON CONFLICT DO UPDATE` per ogni canale critico in `channels` e `channels_config`.
   - Se per i giorni `[-1, 0, +1, +2, +3]` il canale ha meno di 5 programmi registrati, inserisce un palinsesto tematico 24/7 di default.
   - **Nota Fondamentale**: Includere sempre la colonna obbligatoria `time_slot` (`'oggi'`, `'stasera'`, `'stanotte'`) per non violare i vincoli `NOT NULL` di PostgreSQL.

4. **UI di Fallback Graziosa nei Componenti Astro**:
   Se un canale ha 0 programmi in un giorno specifico (es. `/domani/`), la pagina non deve rompersi né essere vuota:
   ```astro
   {programs.length === 0 ? (
     <div class="text-center py-10 px-4 bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs mb-8">
       <div class="w-12 h-12 mx-auto mb-3 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center text-xl">
         📺
       </div>
       <h3 class="text-lg font-extrabold text-slate-900 dark:text-slate-100 mb-1">
         Palinsesto di domani in aggiornamento per {channel.name}
       </h3>
       <p class="text-slate-500 dark:text-slate-400 text-sm max-w-lg mx-auto">
         La programmazione completa per domani è in fase di ricezione. Puoi consultare la guida di stasera o guardare la diretta streaming ufficiale.
       </p>
       {stream && (
         <a href={stream.url} target="_blank" rel="noopener noreferrer" class="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors">
           Guarda la diretta streaming su {stream.label || channel.name}
         </a>
       )}
     </div>
   ) : (
     <HubGrid {programs} {channel} />
   )}
   ```

---

## 13. Scheda di Adattamento per il Mercato Francese (programmecesoir.fr)

### 13.1 Numerazione Canali TNT Francese (LCN 1–27)
Configurare `CHANNEL_NUMBER_MAP` e i loghi locali per la griglia TNT nazionale:
* **1**: TF1 (`tf1`)
* **2**: France 2 (`france-2`)
* **3**: France 3 (`france-3`)
* **4**: Canal+ (`canal-plus`)
* **5**: France 5 (`france-5`)
* **6**: M6 (`m6`)
* **7**: Arte (`arte`)
* **8**: C8 (`c8`)
* **9**: W9 (`w9`)
* **10**: TMC (`tmc`)
* **11**: TFX (`tfx`)
* **12**: NRJ 12 (`nrj-12`)
* **13**: LCP / Public Sénat (`lcp`)
* **14**: France 4 (`france-4`)
* **15**: BFM TV (`bfm-tv`)
* **16**: CNews (`cnews`)
* **17**: CStar (`cstar`)
* **18**: Gulli (`gulli`)
* **19**: Culturebox (`culturebox`)
* **20**: TF1 Séries Films (`tf1-series-films`)
* **21**: L'Équipe (`lequipe`)
* **22**: 6ter (`6ter`)
* **23**: RMC Story (`rmc-story`)
* **24**: RMC Découverte (`rmc-decouverte`)
* **25**: Chérie 25 (`cherie-25`)
* **26**: LCI (`lci`)
* **27**: France Info (`france-info`)

### 13.2 Piattaforme di Streaming Ufficiali (Francia)
Mappare in `src/utils/channelStreams.ts`:
* **Gruppo TF1** (TF1, TMC, TFX, TF1 Séries Films, LCI): `https://www.tf1.fr/direct` (Label: `TF1+`, login gratuito, geo-FR).
* **France Télévisions** (France 2, France 3, France 4, France 5, France Info): `https://www.france.tv/direct` (Label: `france.tv`, login gratuito, geo-FR).
* **Gruppo M6** (M6, W9, 6ter, Gulli): `https://www.6play.fr/direct` (Label: `M6+ / 6play`, login gratuito, geo-FR).
* **Canal+ / C8 / CStar / CNews**: `https://www.canalplus.com/en-direct` (Label: `myCANAL`, geo-FR).
* **Arte**: `https://www.arte.tv/fr/direct/` (Label: `Arte Concert / Direct`, libero, no-login).
* **L'Équipe**: `https://www.lequipe.fr/tv/` (Label: `L'Équipe Live`, libero).

### 13.3 Fuso Orario e Specificità della Prima Serata Francese
* **Fuso Orario**: `Europe/Paris` (stesso offset UTC+1/UTC+2 di Roma, ma etichette e date in francese, es. *"Mardi 17 Novembre"*).
* **Orario di Prima Serata (Prime Time)**: In Francia la prima serata inizia tradizionalmente alle **21:10** (a differenza dell'Italia dove spesso slitta alle 21:30–21:40). La finestra serale consigliata per il calcolo della card principale è `20:50 – 21:15`.
* **Badge Tematici Francesi**:
  - `Film` / `Cinéma`
  - `Série TV`
  - `Sport` / `Direct`
  - `Documentaire`
  - `Divertissement` / `Magazine`
  - `Information` / `Journal`
