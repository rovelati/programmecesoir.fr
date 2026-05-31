# Riepilogo e istruzioni (replica su programmecesoir.fr)

## Riepilogo interventi sul progetto base 123PROGRAMMITV
- Mobile header: rimosso hamburger e inserito switch `En direct / Ce soir` (default `En direct`).
- Card canale (homepage): fix “À suivre” che duplicava il programma in onda e ora seleziona il programma che parte esattamente alla fine (`>=`), non quello successivo.
- Card canale (homepage): CTA “Voir tous les programmes →” sempre visibile su mobile (prima solo hover).
- Pagina canale: rimosso il box “En direct” sopra la lista (design ripristinato).
- Pagina canale: evidenziazione “near” mantenuta, ma senza alterare il design della lista.
- Bug click “Toutes les chaînes”: evitato passaggio dell’evento come categoria (`navigateHome`) per non triggerare `toLowerCase` su oggetto.
- 404 su `/ce-soir/tmc`: match canale più robusto (normalize di id/slug/nome).

## Istruzioni per rifare su programmecesoir.fr
### 1) Header mobile: switch En direct/Ce soir
File: `frontend/src/components/Header.tsx`
- Sostituisci il bottone hamburger con un toggle a due pulsanti.
- `En direct` attivo quando `activeView !== 'tonight'`, `Ce soir` attivo quando `activeView === 'tonight'`.
- Classi consigliate (come nel progetto base 123PROGRAMMITV):
  - container: `md:hidden flex items-center rounded-full bg-slate-100 p-1 shadow-inner`
  - button attivo: `bg-blue-600 text-white shadow-sm`
  - button inattivo: `text-slate-600 hover:text-slate-900`

### 2) CTA visibile su mobile nella card canale
File: `frontend/src/components/ChannelCard.tsx`
- Modifica il footer CTA per essere sempre visibile su mobile e solo hover su desktop:
  - className:
    `w-full py-3 bg-slate-50 text-blue-600 text-sm font-semibold text-center opacity-100 translate-y-0 transition-all md:opacity-0 md:translate-y-2 md:group-hover:opacity-100 md:group-hover:translate-y-0`

### 3) “À suivre” corretto (non avanti di uno)
File: `frontend/src/components/ChannelCard.tsx`
- Nel calcolo di `nextProgram`, usa `start >= cutoff` anziché `start > cutoff`.

### 4) Rimozione box “En direct” in pagina lista programmi
File: `frontend/src/components/ChannelPage.tsx`
- Rimuovi il box riassuntivo che precede la lista (non deve esistere in questa pagina).
- La lista deve iniziare direttamente con i programmi.

### 5) Evidenziazione “near” senza cambiare design
File: `frontend/src/components/ChannelPage.tsx`
- Mantieni la logica “near” originale (programmi vicini al tempo corrente), ma con stile coerente al design esistente (nessun box aggiuntivo).

### 6) Fix click “Toutes les chaînes” (errore `toLowerCase`)
File: `frontend/src/App.tsx`
- In `navigateHome`, accetta solo stringhe come categoria:
  - `const safeCategory = typeof category === 'string' ? category : undefined;`
- Usa `safeCategory` per URL e `setFilter`.
- In `ChannelPage`, usa `onClick={() => onBack()}` per evitare di passare l’evento.

### 7) Fix 404 per slug canale
File: `frontend/src/App.tsx`
- Aggiungi helper:
  - `normalizeChannelKey = (v) => String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'')`
  - `findChannelById` che confronta `id`, `getChannelSlug(id)`, `name` normalizzati.
- Usa `findChannelById` al posto di `channels.find(...)` nei punti:
  - render pagina canale
  - `updateChannelSubview`
  - pagina programma

## Verifica
- Mobile homepage: CTA “Voir tous les programmes” sempre visibile.
- Card canale: “À suivre” è il programma immediatamente successivo.
- Pagina canale: nessun box “En direct” sopra la lista.
- `/ce-soir/tmc` non va più in 404.
- Click “Toutes les chaînes” non genera errori JS.

## Build/Deploy
- Usa le procedure di build/deploy di `programmecesoir.fr` (es. `npm run build` + upload `dist/`).
