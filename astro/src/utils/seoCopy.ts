/**
 * Evergreen SEO copy helpers.
 * Never put calendar dates (or daily programme lists) in <title> / meta description:
 * Google does not refresh SERP snippets in real time.
 */

const DATE_IN_META =
  /\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b|\b\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\b|\b20\d{2}\b/gi;

/** Pretty labels for channels that look ugly in ALL CAPS in SERP. */
const CHANNEL_DISPLAY: Record<string, string> = {
  'antenne-reunion': 'Antenne Réunion',
  'canal-plus': 'Canal+',
  'france-2': 'France 2',
  'france-3': 'France 3',
  'france-4': 'France 4',
  'france-5': 'France 5',
  franceinfo: 'franceinfo',
  'france-24': 'France 24',
  'bfm-tv': 'BFM TV',
  tf1: 'TF1',
  m6: 'M6',
  arte: 'ARTE',
  w9: 'W9',
  tmc: 'TMC',
  tfx: 'TFX',
  c8: 'C8',
  mtv: 'MTV',
  tvpi: 'TVPI',
  rtl9: 'RTL9',
  kto: 'KTO',
  '2m-maroc': '2M Maroc',
  'rts-1': 'RTS 1',
  'rts-2': 'RTS 2',
  'leman-bleu': 'Léman Bleu',
  'la-tele': 'La Télé',
  'canal-alpha': 'Canal Alpha',
  'canal-alpha-ju': 'Canal Alpha Jura',
  'rouge-tv': 'Rouge TV',
  'tvm3': 'TVM3',
  'blue-zoom-f': 'blue Zoom F',
  ab1: 'AB1',
  teva: 'Téva',
  'paris-premiere': 'Paris Première',
  novo19: 'NOVO19',
  'top-sante-tv': 'Top Santé TV',
  'tv5monde': 'TV5 Monde',
  'tv5-monde': 'TV5 Monde',
  'bein-sports-1': 'beIN SPORTS 1',
  'bein-sports-2': 'beIN SPORTS 2',
  'eurosport-1': 'Eurosport 1',
  'eurosport-2': 'Eurosport 2',
  '13eme-rue': '13ème Rue',
  syfy: 'Syfy',
  'comedy-central': 'Comedy Central',
  'serie-club': 'Série Club',
  lci: 'LCI',
  cnews: 'CNews',
  'tf1-series-films': 'TF1 Séries Films',
  'rmc-decouverte': 'RMC Découverte',
  'rmc-story': 'RMC Story',
  'cherie-25': 'Chérie 25',
  'le-figaro-tv': 'Le Figaro TV',
  equidia: 'Equidia',
  tlc: 'TLC',
  cstar: 'CStar',
  gulli: 'Gulli',
  '6ter': '6ter',
};

export function channelSeoName(slug: string, fallbackName: string): string {
  if (CHANNEL_DISPLAY[slug]) return CHANNEL_DISPLAY[slug];
  // Title-case ALL CAPS names (e.g. "ANTENNE REUNION")
  if (fallbackName === fallbackName.toUpperCase() && /[A-Z]/.test(fallbackName)) {
    return fallbackName
      .toLowerCase()
      .split(/([\s'-]+)/)
      .map((part) => (/^[\s'-]+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
      .join('');
  }
  return fallbackName;
}

/** Strip calendar dates from text used in meta description. */
export function evergreenMetaDescription(raw: string | null | undefined, maxLen = 155): string {
  let cleaned = (raw ?? '')
    .replace(/[«»“”„]/g, '"')
    .replace(DATE_IN_META, ' ')
    // orphaned date connectors left after stripping ("du .", "Du au,", "le ,")
    .replace(/\b(?:du|de|le|la|les|au|aux)\s*(?:au|à|a)?\s*[.,;:]/gi, ' ')
    .replace(/\b(?:du|de|le|la)\s+(?:au|à)\b/gi, ' ')
    .replace(/"\s*"/g, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s([.,;:!?])/g, '$1')
    .replace(/^[.,;:\s"']+/, '')
    .trim();

  // If stripping destroyed the lead, prefer the first solid sentence-like chunk
  if (cleaned.length < 40) {
    const fallback = (raw ?? '')
      .replace(DATE_IN_META, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    cleaned = fallback;
  }

  if (!cleaned) return '';
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 1).trimEnd()}…`;
}

export function homeSeo() {
  return {
    title: 'Programme TV ce soir : toutes les chaînes TNT gratuit – Programme Ce Soir',
    description:
      'Découvrez le programme TV TNT de ce soir : toutes les chaînes en un coup d’œil, horaires de première partie de soirée (21h10), films, séries, sport et émissions.',
  };
}

/** Brand-first titles to improve CTR on channel queries. */
export function channelTonightSeo(channelName: string) {
  return {
    title: `Programme TV ${channelName} ce soir – Prime time (21h10)`,
    description: `Programme TV ${channelName} de ce soir : retrouvez le film, la série ou l'émission de première partie de soirée à 21h10 et la suite des programmes sur ${channelName}.`,
  };
}

export function channelTodaySeo(channelName: string) {
  return {
    title: `Programme TV ${channelName} aujourd'hui & ce soir`,
    description: `Programme TV complet de ${channelName} aujourd'hui : retrouvez tous les horaires des films, séries, journaux et émissions diffusés du matin au soir sur ${channelName}.`,
  };
}

export function channelTomorrowSeo(channelName: string) {
  return {
    title: `Programme TV ${channelName} demain – Grille TV & horaires`,
    description: `Programme TV ${channelName} de demain : consultez la grille complète des programmes et horaires de diffusion pour toute la journée et soirée de demain sur ${channelName}.`,
  };
}

export function channelLiveSeo(channelName: string) {
  const shortTitle = `🔴 ${channelName} en Direct : Regarder ${channelName} Gratuitement | Live TV`;
  const title =
    shortTitle.length <= 60
      ? shortTitle
      : `🔴 ${channelName} en Direct : Regarder Gratuitement | Live TV`;

  return {
    title,
    description: `🔴 Regardez ${channelName} en direct gratuitement : streaming live officiel, émission en cours à l'antenne, replay et guide TV en temps réel sur ${channelName}.`,
  };
}

export function programPageSeo(programTitle: string, channelName: string, description?: string | null) {
  const fallback = `Retrouvez ${programTitle} sur ${channelName} : horaires de diffusion, résumé complet, casting et informations détaillées du programme télévisé.`;
  const meta = evergreenMetaDescription(description, 160);
  // Prefer a readable evergreen snippet; fall back if EPG copy is date-heavy junk
  const descriptionOut =
    meta.length >= 80 && !/^\W*$/.test(meta) && !/\bdu\s*\./i.test(meta)
      ? meta
      : fallback;
  return {
    title: compactProgramTitle(programTitle, channelName),
    description: descriptionOut,
  };
}

/** Keep the programme name first; drop boilerplate before shortening names. */
export function compactProgramTitle(programTitle: string, channelName: string): string {
  const title = programTitle.replace(/\s+/g, ' ').trim();
  const channel = channelName.replace(/\s+/g, ' ').trim();
  const full = `${title} — ${channel} | Programme TV`;
  if (full.length <= 70) return full;
  const simple = `${title} — ${channel}`;
  if (simple.length <= 70) return simple;
  if (title.length <= 70) return title;
  const cut = title.slice(0, 69);
  const boundary = cut.lastIndexOf(' ');
  return `${cut.slice(0, boundary > 40 ? boundary : 69).trimEnd()}…`;
}
