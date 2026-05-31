export interface TvStream {
  streamUrl: string;
  provider?: string;
}

const TV_STREAMS: Record<string, TvStream> = {
  tf1: {
    streamUrl: 'https://www.tf1.fr/tf1/direct',
    provider: 'TF1+',
  },
  tmc: {
    streamUrl: 'https://www.tf1.fr/tmc/direct',
    provider: 'TF1+',
  },
  tfx: {
    streamUrl: 'https://www.tf1.fr/tfx/direct',
    provider: 'TF1+',
  },
  lci: {
    streamUrl: 'https://www.tf1.fr/lci/direct',
    provider: 'TF1+',
  },
  'france-2': {
    streamUrl: 'https://www.france.tv/france-2/direct.html',
    provider: 'france.tv',
  },
  'france-3': {
    streamUrl: 'https://www.france.tv/france-3/direct.html',
    provider: 'france.tv',
  },
  'france-4': {
    streamUrl: 'https://www.france.tv/france-4/direct.html',
    provider: 'france.tv',
  },
  'france-5': {
    streamUrl: 'https://www.france.tv/france-5/direct.html',
    provider: 'france.tv',
  },
  franceinfo: {
    streamUrl: 'https://www.france.tv/franceinfo/direct.html',
    provider: 'france.tv',
  },
  m6: {
    streamUrl: 'https://www.m6.fr/m6/direct',
    provider: 'M6+',
  },
  w9: {
    streamUrl: 'https://www.m6.fr/w9/direct',
    provider: 'M6+',
  },
  '6ter': {
    streamUrl: 'https://www.m6.fr/6ter/direct',
    provider: 'M6+',
  },
  gulli: {
    streamUrl: 'https://www.m6.fr/gulli/direct',
    provider: 'M6+',
  },
  arte: {
    streamUrl: 'https://www.arte.tv/fr/direct/',
    provider: 'ARTE',
  },
  'bfm-tv': {
    streamUrl: 'https://www.bfmtv.com/en-direct/',
    provider: 'BFM TV',
  },
  cnews: {
    streamUrl: 'https://www.cnews.fr/le-direct',
    provider: 'CNEWS',
  },
  'rmc-story': {
    streamUrl: 'https://www.rmcbfmplay.com/chaine/rmc-story',
    provider: 'RMC BFM Play',
  },
  'rmc-decouverte': {
    streamUrl: 'https://www.rmcbfmplay.com/chaine/rmc-decouverte',
    provider: 'RMC BFM Play',
  },
};

const TV_STREAM_ALIASES: Record<string, string> = {
  tf1: 'tf1',
  tmc: 'tmc',
  tfx: 'tfx',
  lci: 'lci',
  france2: 'france-2',
  'france-2': 'france-2',
  france3: 'france-3',
  'france-3': 'france-3',
  france4: 'france-4',
  'france-4': 'france-4',
  france5: 'france-5',
  'france-5': 'france-5',
  franceinfo: 'franceinfo',
  'france-info': 'franceinfo',
  m6: 'm6',
  w9: 'w9',
  '6ter': '6ter',
  gulli: 'gulli',
  arte: 'arte',
  bfmtv: 'bfm-tv',
  'bfm-tv': 'bfm-tv',
  cnews: 'cnews',
  'rmc-story': 'rmc-story',
  rmcstory: 'rmc-story',
  'rmc-decouverte': 'rmc-decouverte',
  rmcdecouverte: 'rmc-decouverte',
};

const normalizeKey = (value: string): string =>
  String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const resolveTvKey = (candidate: string): string | null => {
  const normalized = normalizeKey(candidate);
  if (!normalized) return null;
  if (TV_STREAM_ALIASES[normalized]) {
    return TV_STREAM_ALIASES[normalized];
  }
  if (normalized.startsWith('france-3-')) {
    return 'france-3';
  }
  return null;
};

export const getTvStreamUrl = (channelId: string, channelName: string): TvStream | null => {
  const candidates = [channelId, channelName];

  for (const candidate of candidates) {
    const key = resolveTvKey(candidate);
    if (key && TV_STREAMS[key]) {
      return TV_STREAMS[key];
    }
  }

  return null;
};
