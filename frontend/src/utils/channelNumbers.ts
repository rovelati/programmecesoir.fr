const CHANNEL_NUMBER_MAP: Record<string, number> = {
  'tf1': 1,
  'france-2': 2,
  'france-3': 3,
  'canal-plus': 4,
  'canal': 4,
  'france-5': 5,
  'm6': 6,
  'arte': 7,
  'c8': 8,
  'w9': 9,
  'tmc': 10,
  'tfx': 11,
  'nrj12': 12,
  'lci': 13,
  'france-4': 14,
  'bfm-tv': 15,
  'cnews': 16,
  'cstar': 17,
  'gulli': 18,
  '6ter': 21,
  'rmc-decouverte': 23,
  'numero-23': 23,
  'rmc-story': 23,
  'cherie-25': 24,
  'franceinfo': 27
};

const CHANNEL_NAME_MAP: Record<string, number> = {
  'tf1': 1,
  'france 2': 2,
  'france 3': 3,
  'canal+': 4,
  'canal plus': 4,
  'france 5': 5,
  'm6': 6,
  'arte': 7,
  'c8': 8,
  'w9': 9,
  'tmc': 10,
  'tfx': 11,
  'nrj 12': 12,
  'lci': 13,
  'france 4': 14,
  'bfm tv': 15,
  'cnews': 16,
  'cstar': 17,
  'gulli': 18,
  '6ter': 21,
  'rmc decouverte': 23,
  'rmc story': 23,
  'cherie 25': 24,
  'franceinfo': 27,
  'franceinfo:': 27
};

const normalizeKey = (value: unknown): string =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const findMappedNumber = (channelId?: unknown, channelName?: unknown): number | null => {
  const idKey = normalizeKey(channelId);
  if (idKey) {
    for (const [slug, mapped] of Object.entries(CHANNEL_NUMBER_MAP)) {
      if (normalizeKey(slug) === idKey) return mapped;
    }
  }

  const nameKey = normalizeKey(channelName);
  if (nameKey) {
    for (const [name, mapped] of Object.entries(CHANNEL_NAME_MAP)) {
      if (normalizeKey(name) === nameKey) return mapped;
    }
  }

  return null;
};

export const resolveChannelNumber = (rawNumber: unknown, channelId?: unknown, channelName?: unknown): number => {
  const parsed = Number(rawNumber);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return findMappedNumber(channelId, channelName) ?? 0;
};

export const hasValidChannelNumber = (rawNumber: unknown): boolean => {
  const parsed = Number(rawNumber);
  return Number.isFinite(parsed) && parsed > 0;
};

export const getChannelNumberLabel = (rawNumber: unknown): string => {
  const parsed = Number(rawNumber);
  if (!Number.isFinite(parsed) || parsed <= 0) return '--';
  return String(parsed);
};
