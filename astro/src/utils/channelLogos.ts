/**
 * Risolve il logo di un canale francese dando priorità assoluta
 * ai file locali archiviati in /loghi/<slug>.(png|svg|webp|jpg).
 * Evita hotlinking a CDN esterne (es. programme-tv.net, canalplus) che causano 403 Forbidden o lentezza.
 */

const normalizeKey = (s?: string | null): string => {
  if (!s) return '';
  return s
    .toLowerCase()
    .trim()
    .replace(/^fr\s*[-–:]\s*/i, '')
    .replace(/^fr-/i, '')
    .replace(/\.fr$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const LOCAL_LOGOS: Record<string, string> = {
  // ── TNT Principales (1 - 27) ────────────────────────────────────────────────
  'tf1':                      '/loghi/tf1.png',
  'france-2':                 '/loghi/france-2.png',
  'france2':                  '/loghi/france-2.png',
  'france-3':                 '/loghi/france-3.png',
  'france3':                  '/loghi/france-3.png',
  'canal-plus':               '/loghi/canal.png',
  'canalplus':                '/loghi/canal.png',
  'canal':                    '/loghi/canal.png',
  'france-5':                 '/loghi/france-5.png',
  'france5':                  '/loghi/france-5.png',
  'm6':                       '/loghi/m6.png',
  'arte':                     '/loghi/arte.png',
  'c8':                       '/loghi/c8.png',
  'w9':                       '/loghi/w9.png',
  'tmc':                      '/loghi/tmc.png',
  'tfx':                      '/loghi/tfx.png',
  'nrj-12':                   '/loghi/nrj-hits.png',
  'nrj12':                    '/loghi/nrj-hits.png',
  'lcp-public-senat':         '/loghi/lcp.png',
  'lcp':                      '/loghi/lcp.png',
  'public-senat':             '/loghi/public-senat.png',
  'france-4':                 '/loghi/france-4.png',
  'france4':                  '/loghi/france-4.png',
  'culturebox':               '/loghi/france-4.png',
  'bfm-tv':                   '/loghi/bfm-tv.png',
  'bfmtv':                    '/loghi/bfm-tv.png',
  'cnews':                    '/loghi/cnews.png',
  'cstar':                    '/loghi/cstar.png',
  'gulli':                    '/loghi/gulli.png',
  'tf1-series-films':         '/loghi/tf1-series-films.png',
  'tf1seriesfilms':           '/loghi/tf1-series-films.png',
  'lequipe':                  '/loghi/la-chaine-lequipe.png',
  'la-chaine-lequipe':        '/loghi/la-chaine-lequipe.png',
  '6ter':                     '/loghi/6ter.png',
  'rmc-story':                '/loghi/rmc-story.png',
  'rmcstory':                 '/loghi/rmc-story.png',
  'rmc-decouverte':           '/loghi/rmc-decouverte.png',
  'rmcdecouverte':            '/loghi/rmc-decouverte.png',
  'cherie-25':                '/loghi/tf1-series-films.png',
  'cherie25':                 '/loghi/tf1-series-films.png',
  'lci':                      '/loghi/lci.png',
  'franceinfo':               '/loghi/franceinfo.png',
  'france-info':              '/loghi/franceinfo.png',
  'paris-premiere':           '/loghi/paris-premiere.png',
  'rtl9':                     '/loghi/rtl9.png',
  'tv5monde':                 '/loghi/tv5-monde.png',
  'tv5-monde':                '/loghi/tv5-monde.png',
  'teva':                     '/loghi/teva.png',
  't18':                      '/loghi/t18.png',

  // ── France 3 Régions ───────────────────────────────────────────────────────
  'france-3-alpes':           '/loghi/france-3-alpes.png',
  'france-3-alsace':          '/loghi/france-3-alsace.png',
  'france-3-aquitaine':       '/loghi/france-3-aquitaine.png',
  'france-3-auvergne':        '/loghi/france-3-auvergne.png',
  'france-3-basse-normandie': '/loghi/france-3-basse-normandie.png',
  'france-3-bourgogne':       '/loghi/france-3-bourgogne.png',
  'france-3-bretagne':        '/loghi/france-3-bretagne.png',
  'france-3-centre':          '/loghi/france-3-centre.png',
  'france-3-champagne-ardenne':'/loghi/france-3-champagne-ardenne.png',
  'france-3-corse':           '/loghi/france-3-corse.png',
  'france-3-cote-dazur':      '/loghi/france-3-cote-dazur.png',
  'france-3-franche-comte':   '/loghi/france-3-franche-comte.png',
  'france-3-haute-normandie': '/loghi/france-3-haute-normandie.png',
  'france-3-languedoc':       '/loghi/france-3-languedoc.png',
  'france-3-limousin':        '/loghi/france-3-limousin.png',
  'france-3-lorraine':        '/loghi/france-3-lorraine.png',
  'france-3-midi-pyrenees':   '/loghi/france-3-midi-pyrenees.png',
  'france-3-nord-pas-de-calais':'/loghi/france-3-nord-pas-de-calais.png',
  'france-3-paris-ile-de-france':'/loghi/france-3-paris-ile-de-france.png',
  'france-3-pays-de-loire':   '/loghi/france-3-pays-de-loire.png',
  'france-3-picardie':        '/loghi/france-3-picardie.png',
  'france-3-poitou-charentes':'/loghi/france-3-poitou-charentes.png',
  'france-3-provence-alpes':  '/loghi/france-3-provence-alpes.png',
  'france-3-rhone-alpes':     '/loghi/france-3-rhone-alpes.png',

  // ── Groupe Canal+ & Cinéma / Séries ─────────────────────────────────────────
  'canal-cinema':             '/loghi/canal-cinema.png',
  'canal-series':             '/loghi/canal-series.png',
  'canal-docs':               '/loghi/canal-docs.png',
  'canal-grand-ecran':        '/loghi/canal-grand-ecran.png',
  'canal-box-office':         '/loghi/canal-box-office.png',
  'canal-sport':              '/loghi/canal-sport.png',
  'canal-sport-360':          '/loghi/canal-sport-360.png',
  'canal-foot':               '/loghi/canal-foot.png',
  'canal-kids':               '/loghi/canal-kids.png',
  'cine-classic':             '/loghi/cine-classic.png',
  'cine-emotion':             '/loghi/cine-emotion.png',
  'cine-family':              '/loghi/cine-family.png',
  'cine-festival':            '/loghi/cine-festival.png',
  'cine-frisson':             '/loghi/cine-frisson.png',
  '13eme-rue':                '/loghi/13eme-rue.png',
  '13eme-rue-hd':             '/loghi/13eme-rue.png',
  'syfy':                     '/loghi/syfy.png',
  'ab1':                      '/loghi/ab1.png',
  'action':                   '/loghi/action.png',
  'serie-club':               '/loghi/serie-club.png',
  'polar':                    '/loghi/polar.png',
  'ocs':                      '/loghi/ocs.png',
  'paramount-channel':        '/loghi/paramount-channel.png',
  'paramount-channel-decale': '/loghi/paramount-channel-decale.png',
  'tcm-cinema':               '/loghi/tcm-cinema.png',
  'warner-tv':                '/loghi/warnertv.png',
  'warnertv':                 '/loghi/warnertv.png',

  // ── Sport ──────────────────────────────────────────────────────────────────
  'eurosport-1':              '/loghi/eurosport-1.png',
  'eurosport-2':              '/loghi/eurosport-2.png',
  'bein-sports-1':            '/loghi/bein-sports-1.png',
  'bein-sports-2':            '/loghi/bein-sports-2.png',
  'bein-sports-3':            '/loghi/bein-sports-3.png',
  'rmc-sport-1':              '/loghi/rmc-sport-1.png',
  'rmc-sport-2':              '/loghi/rmc-sport-2.png',
  'equidia':                  '/loghi/equidia.png',
  'automoto-la-chaine':       '/loghi/automoto-la-chaine.png',

  // ── Jeunesse & Découverte ──────────────────────────────────────────────────
  'disney-channel':           '/loghi/disney-channel.png',
  'disney-junior':            '/loghi/disney-junior.png',
  'boomerang':                '/loghi/boomerang.png',
  'cartoon-network':          '/loghi/cartoon-network.png',
  'cartoonito':               '/loghi/cartoonito.png',
  'canal-j':                  '/loghi/canal-j.png',
  'tiji':                     '/loghi/tiji.png',
  'teletoon':                 '/loghi/teletoon.png',
  'national-geographic':      '/loghi/national-geographic.png',
  'natgeowild':               '/loghi/natgeowild.png',
  'discovery-channel':        '/loghi/discovery-channel.png',
  'planete':                  '/loghi/planete.png',
  'planete-aventure':         '/loghi/planete-aventure.png',
  'planete-crime-investigation':'/loghi/planete-crime-investigation.png',
  'histoire':                 '/loghi/histoire.png',
  'toute-lhistoire':          '/loghi/toute-lhistoire.png',
  'science-et-vie-tv':        '/loghi/science-et-vie-tv.png',
  'ushuaia-tv':               '/loghi/ushuaia-tv.png',

  // ── Divertissement & Musique ───────────────────────────────────────────────
  'mcm':                      '/loghi/mcm.png',
  'mcm-top':                  '/loghi/mcm-top.png',
  'mtv':                      '/loghi/mtv.png',
  'rfm-tv':                   '/loghi/rfm-tv.png',
  'melody-tv':                '/loghi/melody-tv.png',
  'game-one':                 '/loghi/game-one.png',
  'j-one':                    '/loghi/j-one.png',
  'kto':                      '/loghi/kto.png',
  'antenne-reunion':          '/loghi/antenne-reunion.svg',
  'marmiton-tv':              '/loghi/marmiton-tv.png',

  // ── Chaînes Suisses (Romandie) ─────────────────────────────────────────────
  'rts-1':                    '/loghi/rts-1.png',
  'rts1':                     '/loghi/rts-1.png',
  'rts-un':                   '/loghi/rts-1.png',
  'rts-2':                    '/loghi/rts-2.png',
  'rts2':                     '/loghi/rts-2.png',
  'rts-deux':                 '/loghi/rts-2.png',
  'leman-bleu':               '/loghi/leman-bleu.png',
  'lemanbleu':                '/loghi/leman-bleu.png',
  'la-tele':                  '/loghi/la-tele.png',
  'latele':                   '/loghi/la-tele.png',
  'canal-alpha':              '/loghi/canal-alpha.png',
  'canalalpha':               '/loghi/canal-alpha.png',
  'canal-alpha-ju':           '/loghi/canal-alpha-ju.png',
  'canalalphaju':             '/loghi/canal-alpha-ju.png',
  'rouge-tv':                 '/loghi/rouge-tv.png',
  'rougetv':                  '/loghi/rouge-tv.png',
  'tvm3':                     '/loghi/tvm3.png',
  'blue-zoom-f':              '/loghi/blue-zoom-f.png',
  'bluezoomf':                '/loghi/blue-zoom-f.png',
};

export function getChannelLogo(
  channelId?: string | null,
  remoteUrl?: string | null,
  channelName?: string | null,
): string {
  const normId = normalizeKey(channelId);
  if (normId && LOCAL_LOGOS[normId]) {
    return LOCAL_LOGOS[normId];
  }

  const normName = normalizeKey(channelName);
  if (normName && LOCAL_LOGOS[normName]) {
    return LOCAL_LOGOS[normName];
  }

  // Se è già un percorso relativo locale /loghi/ valido
  if (remoteUrl && remoteUrl.startsWith('/loghi/')) {
    return remoteUrl;
  }

  // Se c'è un logo remoto valido (non bloccato da CDN esterne note)
  if (remoteUrl && remoteUrl.startsWith('http') && !remoteUrl.includes('programme-tv.net')) {
    return remoteUrl;
  }

  // Iniziali fallback SVG inline data-uri
  const label = ((channelName || channelId || 'TV')
    .replace(/^FR\s*[-–:]\s*/i, '')
    .trim()
    .slice(0, 3) || 'TV').toUpperCase();

  return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%231e293b'/><text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' fill='%2338bdf8' font-family='system-ui,sans-serif' font-weight='900' font-size='28'>${label}</text></svg>`;
}

/**
 * Ritorna l'URL assoluto della card quadrata 600x600 con logo e badge 'EN DIRECT'
 * ottimizzata per i thumbnail di ricerca (Bing, Google) e Open Graph.
 */
export function getDirectCardImage(channelSlug: string): string {
  const norm = normalizeKey(channelSlug);
  return `https://programmecesoir.fr/og/direct/${norm || 'direct'}.png`;
}

