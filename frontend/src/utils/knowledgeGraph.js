export const SITE_NAME = 'Programme Ce Soir';
export const SITE_URL = 'https://programmecesoir.fr';
export const SITE_DESCRIPTION = 'Guide TV TNT : programme ce soir, en direct et demain sur toutes les chaînes françaises';
export const SITE_LOGO_URL = `${SITE_URL}/static/img/programmecesoir-social.jpg`;
export const SITE_ORGANIZATION_LOGO_URL = `${SITE_URL}/apple-touch-icon.png`;
export const SITE_AUTHOR_REF = { '@id': `${SITE_URL}/#organization` };

// Only keep URLs that describe the same entity or a profile of the site itself.
export const SITE_PROFILES = [
  {
    label: 'Trustpilot',
    url: 'https://www.trustpilot.com/review/programmecesoir.fr',
    rel: 'noopener',
  },
  {
    label: 'Blinx',
    url: 'https://www.blinx.biz/programme-ce-soir',
    rel: 'noopener',
  },
  {
    label: 'Hotfrog',
    url: 'https://www.hotfrog.fr/company/3b9657ae9cdea1064cdf913a4307e9bc',
    rel: 'noopener',
  },
  {
    label: 'Gravatar',
    url: 'https://gravatar.com/nachocasually086548ae02',
    rel: 'noopener',
  },
  {
    label: 'Wikidata',
    url: 'https://www.wikidata.org/wiki/Q138768630',
    rel: 'noopener',
  },
  {
    label: 'Bluesky',
    url: 'https://bsky.app/profile/programmecesoir.bsky.social',
    rel: 'me noopener',
  },
  // { label: 'Facebook', url: 'https://www.facebook.com/programmecesoir', rel: 'me noopener' },
  // { label: 'Twitter / X', url: 'https://twitter.com/programmecesoir', rel: 'me noopener' },
  // { label: 'LinkedIn', url: 'https://www.linkedin.com/company/programme-ce-soir', rel: 'me noopener' },
  // { label: 'Pinterest', url: 'https://www.pinterest.fr/programmecesoir', rel: 'me noopener' },
  // { label: 'Product Hunt', url: 'https://www.producthunt.com/products/programme-ce-soir', rel: 'noopener' },
  // { label: 'AlternativeTo', url: 'https://alternativeto.net/software/programme-ce-soir/', rel: 'noopener' },
  // { label: 'Crunchbase', url: 'https://www.crunchbase.com/organization/programme-ce-soir', rel: 'noopener' },
];

export const SITE_SAME_AS = [
  'https://www.wikidata.org/wiki/Q138768630',
  'https://bsky.app/profile/programmecesoir.bsky.social',
  'https://www.trustpilot.com/review/programmecesoir.fr',
];

export const HOME_FAQ_DATA = [
  {
    q: 'Que passe-t-il ce soir à la télévision ?',
    a: 'Retrouvez tous les programmes TV du soir sur programmecesoir.fr : films, séries, documentaires et émissions sur TF1, France 2, M6, Arte et toutes les chaînes TNT.',
  },
  {
    q: 'Quel film passe ce soir à la télé ?',
    a: 'Consultez notre sélection de films ce soir sur toutes les chaînes TNT françaises avec horaires, synopsis et chaînes sur programmecesoir.fr.',
  },
  {
    q: 'Quelles séries sont diffusées ce soir ?',
    a: 'Découvrez toutes les séries diffusées ce soir sur la TNT, avec les horaires et chaînes, sur programmecesoir.fr/series-ce-soir.',
  },
  {
    q: 'Comment voir le programme TV de demain ?',
    a: 'Le programme TV de demain est disponible sur programmecesoir.fr/demain avec tous les horaires et chaînes TNT.',
  },
];

const CHANNEL_WIKIDATA_BY_KEY = {
  tf1: 'https://www.wikidata.org/wiki/Q235729',
  'france-2': 'https://www.wikidata.org/wiki/Q596005',
  'france-3': 'https://www.wikidata.org/wiki/Q596010',
  'canal-plus': 'https://www.wikidata.org/wiki/Q193852',
  'france-5': 'https://www.wikidata.org/wiki/Q596014',
  m6: 'https://www.wikidata.org/wiki/Q602487',
  arte: 'https://www.wikidata.org/wiki/Q161566',
  c8: 'https://www.wikidata.org/wiki/Q2830516',
  w9: 'https://www.wikidata.org/wiki/Q2830524',
  tmc: 'https://www.wikidata.org/wiki/Q2830525',
  tfx: 'https://www.wikidata.org/wiki/Q15704982',
  nrj12: 'https://www.wikidata.org/wiki/Q2830534',
  'nrj-12': 'https://www.wikidata.org/wiki/Q2830534',
  lci: 'https://www.wikidata.org/wiki/Q3214682',
  'france-4': 'https://www.wikidata.org/wiki/Q596018',
  'bfm-tv': 'https://www.wikidata.org/wiki/Q1350914',
  cnews: 'https://www.wikidata.org/wiki/Q18006965',
  cstar: 'https://www.wikidata.org/wiki/Q2830528',
  gulli: 'https://www.wikidata.org/wiki/Q3118658',
  '6ter': 'https://www.wikidata.org/wiki/Q18385065',
  'rmc-decouverte': 'https://www.wikidata.org/wiki/Q3424521',
  'rmc-story': 'https://www.wikidata.org/wiki/Q3424519',
  franceinfo: 'https://www.wikidata.org/wiki/Q18006967',
  'france-info': 'https://www.wikidata.org/wiki/Q18006967',
};

export const normalizeChannelKey = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

export const toAbsoluteUrl = (value, siteUrl = SITE_URL) => {
  const source = String(value || '').trim();
  if (!source) return undefined;
  if (/^https?:\/\//i.test(source)) return source;
  if (source.startsWith('//')) return `https:${source}`;
  if (source.startsWith('/')) return `${siteUrl}${source}`;
  return `${siteUrl}/${source.replace(/^\.?\//, '')}`;
};

export const getChannelSameAs = (channelIdOrSlug, channelName) => {
  const candidates = [
    normalizeChannelKey(channelIdOrSlug),
    normalizeChannelKey(channelName),
    String(channelIdOrSlug || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
    String(channelName || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (CHANNEL_WIKIDATA_BY_KEY[candidate]) {
      return CHANNEL_WIKIDATA_BY_KEY[candidate];
    }
  }
  return null;
};

export const extractSeriesInfo = (title) => {
  const source = String(title || '').trim();
  const seasonMatch = source.match(/(?:st\.?|saison|season)\s*(\d+)/i);
  const episodeMatch = source.match(/(?:ep\.?|episode|épisode)\s*(\d+)/i);
  const seriesName = source
    .replace(/\([^)]*(st\.?|saison|season|ep\.?|episode|épisode)[^)]*\)/gi, '')
    .replace(/\b(st\.?|saison|season)\s*\d+.*$/i, '')
    .replace(/\b(ep\.?|episode|épisode)\s*\d+.*$/i, '')
    .trim();

  return {
    seriesName: seriesName || source,
    seasonNumber: seasonMatch ? seasonMatch[1] : undefined,
    episodeNumber: episodeMatch ? episodeMatch[1] : undefined,
  };
};

export const inferProgramEntityType = ({ title, category }) => {
  const safeTitle = String(title || '');
  const safeCategory = String(category || '').toLowerCase();
  const hasEpisodeMarker = /(?:st\.?|saison|season|ep\.?|episode|épisode)\s*\d+/i.test(safeTitle);

  if (/\bfilm\b|cinema|cinéma/i.test(safeCategory)) {
    return 'Movie';
  }
  if (hasEpisodeMarker || /\bsérie\b|\bserie\b/.test(safeCategory)) {
    return 'TVEpisode';
  }
  return 'TVSeries';
};

export const toIsoDuration = (startTime, endTime) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return undefined;
  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `PT${hours}H${minutes}M`;
  if (hours > 0) return `PT${hours}H`;
  return `PT${minutes}M`;
};

export const buildSiteGraph = (siteUrl = SITE_URL) => {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: SITE_NAME,
      alternateName: 'Programme TV TNT Ce Soir',
      description: SITE_DESCRIPTION,
      inLanguage: 'fr-FR',
      author: { '@id': `${siteUrl}/#organization` },
      publisher: { '@id': `${siteUrl}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${siteUrl}/recherche?qs={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
      sameAs: SITE_SAME_AS,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: SITE_NAME,
      url: siteUrl,
      description: SITE_DESCRIPTION,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/apple-touch-icon.png`,
        width: 180,
        height: 180,
      },
      sameAs: SITE_SAME_AS,
    },
  ];
};

export const buildFaqGraph = (faqs = HOME_FAQ_DATA) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  author: SITE_AUTHOR_REF,
  publisher: SITE_AUTHOR_REF,
  mainEntity: faqs.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: a,
    },
  })),
});

export const buildCreditsGraph = (siteUrl = SITE_URL) => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${siteUrl}/credits#website`,
  name: SITE_NAME,
  url: siteUrl,
  author: { '@id': `${siteUrl}/#organization` },
  publisher: { '@id': `${siteUrl}/#organization` },
  sameAs: SITE_SAME_AS,
});

export const buildBreadcrumbList = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.name,
    item: item.item,
  })),
});

export const buildChannelGraph = ({
  siteUrl = SITE_URL,
  channelName,
  channelUrl,
  description,
  logoUrl,
  channelSameAs,
}) => ({
  '@context': 'https://schema.org',
  '@type': 'BroadcastService',
  '@id': `${siteUrl}${channelUrl}#broadcastservice`,
  name: channelName,
  url: `${siteUrl}${channelUrl}`,
  broadcastDisplayName: channelName,
  broadcastTimezone: 'Europe/Paris',
  inLanguage: 'fr-FR',
  areaServed: {
    '@type': 'Country',
    name: 'France',
  },
  ...(description ? { description } : {}),
  ...(logoUrl ? {
    logo: {
      '@type': 'ImageObject',
      url: toAbsoluteUrl(logoUrl, siteUrl),
    },
  } : {}),
  ...(channelSameAs ? { sameAs: channelSameAs } : {}),
  hasBroadcastChannel: {
    '@type': 'TelevisionChannel',
    name: channelName,
    ...(channelSameAs ? { sameAs: channelSameAs } : {}),
  },
});

export const buildProgramWorkGraph = ({
  siteUrl = SITE_URL,
  fullUrl,
  title,
  description,
  image,
  category,
  startTime,
  endTime,
  channelName,
  channelUrl,
  channelSameAs,
}) => {
  const entityType = inferProgramEntityType({ title, category });
  const entityId = `${fullUrl}#work`;
  const seriesInfo = extractSeriesInfo(title);

  let work;
  if (entityType === 'Movie') {
    work = {
      '@context': 'https://schema.org',
      '@type': 'Movie',
      '@id': entityId,
      name: title,
      description,
      url: fullUrl,
      inLanguage: 'fr-FR',
      author: SITE_AUTHOR_REF,
      publisher: SITE_AUTHOR_REF,
      ...(image ? {
        image: {
          '@type': 'ImageObject',
          url: toAbsoluteUrl(image, siteUrl),
        },
      } : {}),
      ...(category ? { genre: [category] } : {}),
      ...(toIsoDuration(startTime, endTime) ? { duration: toIsoDuration(startTime, endTime) } : {}),
      potentialAction: {
        '@type': 'WatchAction',
        target: fullUrl,
      },
    };
  } else if (entityType === 'TVEpisode') {
    work = {
      '@context': 'https://schema.org',
      '@type': 'TVEpisode',
      '@id': entityId,
      name: title,
      description,
      url: fullUrl,
      inLanguage: 'fr-FR',
      author: SITE_AUTHOR_REF,
      publisher: SITE_AUTHOR_REF,
      ...(image ? {
        image: {
          '@type': 'ImageObject',
          url: toAbsoluteUrl(image, siteUrl),
        },
      } : {}),
      ...(category ? { genre: category } : {}),
      ...(seriesInfo.episodeNumber ? { episodeNumber: seriesInfo.episodeNumber } : {}),
      ...(seriesInfo.seasonNumber ? { seasonNumber: seriesInfo.seasonNumber } : {}),
      partOfSeries: {
        '@type': 'TVSeries',
        name: seriesInfo.seriesName,
      },
    };
  } else {
    work = {
      '@context': 'https://schema.org',
      '@type': 'TVSeries',
      '@id': entityId,
      name: title,
      description,
      url: fullUrl,
      inLanguage: 'fr-FR',
      author: SITE_AUTHOR_REF,
      publisher: SITE_AUTHOR_REF,
      ...(image ? {
        image: {
          '@type': 'ImageObject',
          url: toAbsoluteUrl(image, siteUrl),
        },
      } : {}),
      ...(category ? { genre: [category] } : {}),
    };
  }

  const broadcastEvent = {
    '@context': 'https://schema.org',
    '@type': 'BroadcastEvent',
    '@id': `${fullUrl}#broadcast`,
    name: `${title} sur ${channelName}`,
    description,
    startDate: startTime,
    endDate: endTime,
    isLiveBroadcast: false,
    inLanguage: 'fr-FR',
    url: fullUrl,
    author: SITE_AUTHOR_REF,
    publisher: SITE_AUTHOR_REF,
    ...(image ? {
      image: {
        '@type': 'ImageObject',
        url: toAbsoluteUrl(image, siteUrl),
      },
    } : {}),
    workPerformed: {
      '@id': entityId,
    },
    publishedOn: {
      '@type': 'BroadcastService',
      '@id': `${siteUrl}${channelUrl}#broadcastservice`,
      name: channelName,
      broadcastDisplayName: channelName,
      broadcastTimezone: 'Europe/Paris',
      ...(channelSameAs ? { sameAs: channelSameAs } : {}),
    },
  };

  return [work, broadcastEvent];
};

export const buildProgramGraph = (args) => {
  const graphs = buildProgramWorkGraph(args);
  const breadcrumb = buildBreadcrumbList([
    { name: 'Accueil', item: args.siteUrl || SITE_URL },
    { name: args.channelName, item: `${args.siteUrl || SITE_URL}${args.channelUrl}` },
    { name: args.title, item: args.fullUrl },
  ]);

  return [...graphs, breadcrumb];
};
