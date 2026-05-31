import type { BirthdayArticlePayload, BirthdayArchivePayload } from '../types/birthday';

let currentBirthdayCache: BirthdayArticlePayload | null | undefined;
const birthdayArticleCache = new Map<string, BirthdayArticlePayload | null>();
let birthdayArchiveCache: BirthdayArchivePayload | null | undefined;

const CURRENT_BIRTHDAY_URL = '/birthday-data/current.json';
const ARCHIVE_BIRTHDAY_URL = '/birthday-data/archive.json';

const articleUrl = (slug: string) => `/birthday-data/articles/${encodeURIComponent(slug)}.json`;

const getParisTodayIso = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

export const isBirthdayPayloadCurrent = (payload: BirthdayArticlePayload | null | undefined) =>
  Boolean(payload?.ok && payload.publishedDate === getParisTodayIso());

const stripHtml = (value: string) =>
  String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const unwrapNestedBodyHtml = (value: string): string => {
  let current = String(value || '').trim();
  for (let i = 0; i < 3; i += 1) {
    if (!current.startsWith('{')) break;
    try {
      const parsed = JSON.parse(current);
      if (!parsed || typeof parsed !== 'object') break;
      const nested = typeof parsed.bodyHtml === 'string' ? parsed.bodyHtml.trim() : '';
      if (!nested) break;
      current = nested;
    } catch {
      break;
    }
  }
  return current;
};

const normalizeBirthdayPayload = (payload: BirthdayArticlePayload | null): BirthdayArticlePayload | null => {
  if (!payload) return null;

  const cleanedBodyHtml = unwrapNestedBodyHtml(payload.bodyHtml || '');
  const plainText = stripHtml(cleanedBodyHtml);
  const excerpt = payload.excerpt && !String(payload.excerpt).trim().startsWith('{')
    ? payload.excerpt
    : `${plainText.slice(0, 200).trim()}${plainText.length > 200 ? '…' : ''}`;

  return {
    ...payload,
    bodyHtml: cleanedBodyHtml,
    excerpt,
  };
};

async function fetchBirthdayJson(url: string, options: { force?: boolean } = {}): Promise<BirthdayArticlePayload | null> {
  try {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: options.force ? 'no-store' : 'default',
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as BirthdayArticlePayload | { ok?: boolean };
    if (!payload || payload.ok !== true) return null;
    return normalizeBirthdayPayload(payload as BirthdayArticlePayload);
  } catch {
    return null;
  }
}

export async function fetchCurrentBirthdayArticle(options: { force?: boolean } = {}): Promise<BirthdayArticlePayload | null> {
  if (!options.force && currentBirthdayCache !== undefined) {
    return currentBirthdayCache;
  }

  const payload = await fetchBirthdayJson(CURRENT_BIRTHDAY_URL, options);
  currentBirthdayCache = isBirthdayPayloadCurrent(payload) ? payload : null;
  if (currentBirthdayCache?.articleSlug) {
    birthdayArticleCache.set(currentBirthdayCache.articleSlug, currentBirthdayCache);
  }
  return currentBirthdayCache;
}

export async function fetchBirthdayArticle(slug: string, options: { force?: boolean } = {}): Promise<BirthdayArticlePayload | null> {
  if (!slug) return null;
  if (!options.force && birthdayArticleCache.has(slug)) {
    return birthdayArticleCache.get(slug) || null;
  }

  const current = await fetchCurrentBirthdayArticle(options);
  if (current?.articleSlug === slug) {
    birthdayArticleCache.set(slug, current);
    return current;
  }

  const payload = await fetchBirthdayJson(articleUrl(slug), options);
  birthdayArticleCache.set(slug, payload);
  return payload;
}

export async function fetchBirthdayArchive(options: { force?: boolean } = {}): Promise<BirthdayArchivePayload | null> {
  if (!options.force && birthdayArchiveCache !== undefined) {
    return birthdayArchiveCache;
  }

  try {
    const response = await fetch(ARCHIVE_BIRTHDAY_URL, {
      credentials: 'same-origin',
      cache: options.force ? 'no-store' : 'default',
    });
    if (!response.ok) {
      birthdayArchiveCache = null;
      return null;
    }
    const payload = (await response.json()) as BirthdayArchivePayload | { ok?: boolean };
    birthdayArchiveCache = payload && payload.ok === true ? payload as BirthdayArchivePayload : null;
    return birthdayArchiveCache;
  } catch {
    birthdayArchiveCache = null;
    return null;
  }
}
