#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(FRONTEND_DIR, '..');
const PUBLIC_DIR = path.join(FRONTEND_DIR, 'public');
const ENTITIES_DIR = path.join(PUBLIC_DIR, 'entities-data');
const FILMS_DIR = path.join(ENTITIES_DIR, 'films');
const SERIES_DIR = path.join(ENTITIES_DIR, 'series');
const ACTORS_DIR = path.join(ENTITIES_DIR, 'actors');
const INDEXES_DIR = path.join(ENTITIES_DIR, 'indexes');
const CACHE_DIR = path.join(ENTITIES_DIR, '.cache');
const ROUTES_FILE = path.join(FRONTEND_DIR, 'src', 'data', 'entity-routes.js');

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);

const FILM_LIMIT = Number(args.get('film-limit') || process.env.ENTITY_FILM_LIMIT || 1500);
const SERIES_LIMIT = Number(args.get('series-limit') || process.env.ENTITY_SERIES_LIMIT || 800);
const ACTOR_LIMIT = Number(args.get('actor-limit') || process.env.ENTITY_ACTOR_LIMIT || 1000);
const REFRESH_WIKIDATA = args.get('refresh-wikidata') === 'true';
const MATCH_CONCURRENCY = Number(args.get('match-concurrency') || process.env.ENTITY_MATCH_CONCURRENCY || 2);
const REQUEST_RETRY_LIMIT = Number(args.get('retry-limit') || process.env.ENTITY_RETRY_LIMIT || 6);
const WIKIDATA_SEARCH_BUDGET = Number(args.get('wikidata-budget') || process.env.ENTITY_WIKIDATA_BUDGET || 120);

const ENTITY_INDEX_META = {
  film: {
    title: 'Films à voir à la TV',
    description: 'Catalogue statique des films les plus diffusés à la télévision française, avec prochaines diffusions.',
    dir: FILMS_DIR,
    basePath: '/film',
    indexPath: '/films',
    jsonDir: 'films',
  },
  series: {
    title: 'Séries à voir à la TV',
    description: 'Catalogue statique des séries les plus diffusées à la télévision française, avec prochaines diffusions.',
    dir: SERIES_DIR,
    basePath: '/serie',
    indexPath: '/series',
    jsonDir: 'series',
  },
  actor: {
    title: 'Acteurs et réalisateurs à la TV',
    description: 'Catalogue statique des acteurs et réalisateurs les plus présents dans les programmes TV détectés.',
    dir: ACTORS_DIR,
    basePath: '/acteur',
    indexPath: '/acteurs',
    jsonDir: 'actors',
  },
};

const ENTITY_KIND_BY_TYPE = {
  film: 'film',
  series: 'series',
  actor: 'actor',
};

const ADULT_TITLE_PATTERNS = [
  /\b(adult|adulte|erotique|erotic|sexy|x{2,}|xxx)\b/i,
  /porn/i,
  /\b(sex|sexe|fuck|fucks|fucking|fucker|fuckers|blowjob|threesome|gangbang|bdsm|libertin|luxure|blacked|tushy)\b/i,
  /\banal\b/i,
  /\b(playboy|brazzers|metart|dorcel|jacquie|hard)\b/i,
  /\basshole\b/i,
];

const ADULT_GENRE_PATTERNS = [
  /\b(adult|adulte|erotique|erotic|porno|porn|charme|x{2,}|xxx)\b/i,
];

const ADULT_CHANNEL_PATTERNS = [
  /(playboy|dorcel|brazzers|pink|hustler|xxl|union|mens up|men s up)/i,
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  const candidates = [
    path.join(ROOT_DIR, 'scripts', '.env'),
    path.join(FRONTEND_DIR, '.env'),
  ];

  candidates.forEach((envPath) => {
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    });
  });
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  return normalizeText(value).replace(/\s+/g, '-');
}

function escapeSql(value) {
  return String(value || '').replace(/'/g, "''");
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanupEntityDir(dir, selectedSlugs) {
  if (!fs.existsSync(dir)) return;
  const keep = new Set(selectedSlugs.map((slug) => `${slug}.json`));
  fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .forEach((name) => {
      if (keep.has(name)) return;
      fs.unlinkSync(path.join(dir, name));
    });
}

function runPsqlJsonQuery(sql) {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL mancante per generate-entities');
  }

  const output = execFileSync(
    'psql',
    ['-At', process.env.DATABASE_URL, '-c', sql],
    {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 80,
    },
  ).trim();

  if (!output) return [];
  return JSON.parse(output);
}

function extractSeriesBaseTitle(title) {
  const source = String(title || '').trim();
  return source
    .replace(/\s*---\s*s\d+(?:e\d+)?.*$/i, '')
    .replace(/\s+\bs\d+(?:e\d+)?\b.*$/i, '')
    .replace(/\s+\d+-\d+(?:-\d+)*\s*$/i, '')
    .replace(/\([^)]*(?:st\.?|saison|season|ep\.?|episode|épisode)[^)]*\)/gi, '')
    .replace(/\s*[-:]\s*(?:saison|season|st\.?|episode|ep\.?|épisode)\s*\d+.*$/i, '')
    .replace(/\s+\b(?:saison|season|st\.?)\s*\d+\b.*$/i, '')
    .trim();
}

function inferProgramKind(program) {
  const genre = normalizeText(program.genre);
  const title = String(program.title || '');
  if (genre.includes('film') || genre.includes('cinema') || genre.includes('movie') || genre.includes('telefilm')) {
    return 'film';
  }
  if (
    genre.includes('serie') ||
    /(?:st\.?|saison|season|ep\.?|episode|épisode)\s*\d+/i.test(title)
  ) {
    return 'series';
  }
  return null;
}

function getProgramUrl(channelSlug, title) {
  return `/programme/${channelSlug}/${slugify(title)}`;
}

function isAdultProgram(program) {
  const title = normalizeText(program.title || '');
  const genre = normalizeText(program.genre || '');
  const channelId = normalizeText(program.channel_id || '');
  return ADULT_TITLE_PATTERNS.some((pattern) => pattern.test(title))
    || ADULT_GENRE_PATTERNS.some((pattern) => pattern.test(genre))
    || ADULT_CHANNEL_PATTERNS.some((pattern) => pattern.test(channelId));
}

function buildUpcomingAiring(program) {
  const channelSlug = slugify(program.channel_id);
  return {
    id: String(program.id),
    title: String(program.title || ''),
    programSlug: slugify(program.title || ''),
    programUrl: getProgramUrl(channelSlug, program.title || ''),
    channelId: String(program.channel_id || ''),
    channelName: String(program.channel_name || program.channel_id || ''),
    channelSlug,
    startTime: String(program.start_time || ''),
    endTime: String(program.end_time || ''),
    date: String(program.date || ''),
  };
}

function buildChannelSummary(channelId, channel) {
  return {
    channelId,
    channelName: channel.channelName,
    channelSlug: slugify(channelId),
    channelNumber: channel.channelNumber,
    logoUrl: channel.logoUrl,
    airingsCount: channel.airingsCount,
  };
}

function selectBestDescription(aggregate) {
  if (aggregate.bestDescription) return aggregate.bestDescription;
  return null;
}

function initializeAggregate(kind, title) {
  return {
    kind,
    title,
    slug: slugify(title),
    sourceTitles: new Set(),
    genres: new Map(),
    descriptions: [],
    channels: new Map(),
    upcomingAirings: [],
    airingsCount: 0,
    bestDescription: null,
  };
}

function mergeExistingEntity(baseEntity, existing) {
  if (!existing || typeof existing !== 'object') return baseEntity;

  return {
    ...baseEntity,
    descriptionAi: existing.descriptionAi || baseEntity.descriptionAi || null,
    image: existing.image?.url ? existing.image : baseEntity.image,
    externalIds: {
      ...baseEntity.externalIds,
      ...(existing.externalIds || {}),
    },
    matchConfidence: existing.matchConfidence ?? baseEntity.matchConfidence ?? null,
  };
}

async function mapConcurrent(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function fetchJson(url) {
  let lastError = null;

  for (let attempt = 0; attempt < REQUEST_RETRY_LIMIT; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'ProgrammecesoirEntityBuilder/1.0 (+https://programmecesoir.fr)',
        accept: 'application/json',
      },
    });

    if (response.ok) {
      return response.json();
    }

    if (response.status === 429 || response.status >= 500) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
      const delayMs = retryAfterMs && Number.isFinite(retryAfterMs)
        ? retryAfterMs
        : Math.min(10000, 1000 * (attempt + 1) * (attempt + 1));
      lastError = new Error(`HTTP ${response.status} on ${url}`);
      await sleep(delayMs);
      continue;
    }

    throw new Error(`HTTP ${response.status} on ${url}`);
  }

  throw lastError || new Error(`Failed to fetch ${url}`);
}

function getEntityLabel(entity, language = 'fr') {
  return entity?.labels?.[language]?.value
    || entity?.labels?.en?.value
    || entity?.labels?.fr?.value
    || null;
}

function getEntityDescription(entity, language = 'fr') {
  return entity?.descriptions?.[language]?.value
    || entity?.descriptions?.en?.value
    || null;
}

function getClaimEntityIds(entity, propertyId) {
  const claims = entity?.claims?.[propertyId] || [];
  return claims
    .map((claim) => claim?.mainsnak?.datavalue?.value?.id || null)
    .filter(Boolean);
}

function getClaimString(entity, propertyId) {
  const claim = entity?.claims?.[propertyId]?.[0];
  const value = claim?.mainsnak?.datavalue?.value;
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value?.text) return value.text;
  if (value?.id) return value.id;
  return null;
}

function getClaimTime(entity, propertyId) {
  const claim = entity?.claims?.[propertyId]?.[0];
  const time = claim?.mainsnak?.datavalue?.value?.time;
  if (!time) return null;
  return String(time).replace(/^\+/, '').slice(0, 10);
}

function getClaimYear(entity, propertyId) {
  const full = getClaimTime(entity, propertyId);
  if (!full) return null;
  const year = Number(full.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function getClaimNumber(entity, propertyId) {
  const claim = entity?.claims?.[propertyId]?.[0];
  const amount = claim?.mainsnak?.datavalue?.value?.amount;
  if (!amount) return null;
  const numeric = Number(String(amount).replace(/^\+/, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function commonsImageUrl(fileName) {
  if (!fileName) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}`;
}

function wikipediaUrlFromEntity(entity) {
  const frTitle = entity?.sitelinks?.frwiki?.title;
  if (!frTitle) return null;
  return `https://fr.wikipedia.org/wiki/${encodeURIComponent(frTitle.replace(/ /g, '_'))}`;
}

function expectedTypeScore(expectedType, candidate) {
  const description = normalizeText(candidate?.description || '');
  if (expectedType === 'film') {
    return description.includes('film') ? 0.35 : 0;
  }
  if (expectedType === 'series') {
    return description.includes('serie') || description.includes('television') ? 0.35 : 0;
  }
  return 0;
}

function titleSimilarity(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.startsWith(right) || right.startsWith(left)) return 0.85;
  const leftWords = new Set(left.split(' '));
  const rightWords = new Set(right.split(' '));
  const overlap = Array.from(leftWords).filter((word) => rightWords.has(word)).length;
  return overlap / Math.max(leftWords.size, rightWords.size, 1);
}

async function searchWikidata(title, expectedType, cache) {
  const cacheKey = `${expectedType}:${normalizeText(title)}`;
  if (cache[cacheKey]) return cache[cacheKey];

  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(title)}&language=fr&uselang=fr&format=json&limit=8&type=item&origin=*`;
  const data = await fetchJson(url);
  const results = Array.isArray(data?.search) ? data.search : [];

  let best = null;
  let bestScore = 0;

  results.forEach((candidate) => {
    const similarity = Math.max(
      titleSimilarity(title, candidate.label || ''),
      ...(Array.isArray(candidate.aliases) ? candidate.aliases.map((alias) => titleSimilarity(title, alias)) : [0]),
    );
    const score = similarity + expectedTypeScore(expectedType, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  });

  const payload = best && bestScore >= 0.82
    ? { qid: best.id, score: Number(bestScore.toFixed(3)) }
    : null;
  cache[cacheKey] = payload;
  return payload;
}

async function fetchWikidataEntities(qids) {
  const unique = Array.from(new Set(qids.filter(Boolean)));
  const lookup = {};
  const batchSize = 50;

  for (let index = 0; index < unique.length; index += batchSize) {
    const ids = unique.slice(index, index + batchSize);
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&format=json&languages=fr|en&props=labels|descriptions|claims|sitelinks&origin=*`;
    const data = await fetchJson(url);
    Object.assign(lookup, data?.entities || {});
  }

  return lookup;
}

function buildProgramsAggregates(programs) {
  const now = Date.now();
  const nextWeek = now + (7 * 24 * 60 * 60 * 1000);
  const filmMap = new Map();
  const seriesMap = new Map();

  programs.forEach((program) => {
    if (isAdultProgram(program)) return;

    const kind = inferProgramKind(program);
    if (!kind) return;

    const canonicalTitle = kind === 'series'
      ? extractSeriesBaseTitle(program.title || '')
      : String(program.title || '').trim();
    if (!canonicalTitle) return;

    const key = `${kind}:${slugify(canonicalTitle)}`;
    const targetMap = kind === 'film' ? filmMap : seriesMap;
    if (!targetMap.has(key)) targetMap.set(key, initializeAggregate(kind, canonicalTitle));
    const aggregate = targetMap.get(key);

    aggregate.airingsCount += 1;
    aggregate.sourceTitles.add(String(program.title || canonicalTitle));

    const genre = String(program.genre || '').trim();
    if (genre) {
      aggregate.genres.set(genre, (aggregate.genres.get(genre) || 0) + 1);
    }

    const description = String(program.description || '').trim();
    if (description && (!aggregate.bestDescription || description.length > aggregate.bestDescription.length)) {
      aggregate.bestDescription = description;
    }

    const channelId = String(program.channel_id || '');
    if (!aggregate.channels.has(channelId)) {
      aggregate.channels.set(channelId, {
        channelName: String(program.channel_name || channelId),
        channelNumber: program.channel_number ?? null,
        logoUrl: program.logo_url || null,
        airingsCount: 0,
      });
    }
    aggregate.channels.get(channelId).airingsCount += 1;

    const startTs = new Date(program.start_time).getTime();
    if (Number.isFinite(startTs) && startTs >= now && startTs <= nextWeek) {
      aggregate.upcomingAirings.push(buildUpcomingAiring(program));
    }
  });

  return { filmMap, seriesMap };
}

function sortAggregateMap(map, limit) {
  return Array.from(map.values())
    .sort((a, b) => {
      if (b.airingsCount !== a.airingsCount) return b.airingsCount - a.airingsCount;
      return a.title.localeCompare(b.title, 'fr');
    })
    .slice(0, limit);
}

async function main() {
  ensureDir(FILMS_DIR);
  ensureDir(SERIES_DIR);
  ensureDir(ACTORS_DIR);
  ensureDir(INDEXES_DIR);
  ensureDir(CACHE_DIR);

  const searchCachePath = path.join(CACHE_DIR, 'wikidata-search.json');
  const searchCache = readJsonIfExists(searchCachePath, {});

  const sql = `
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    FROM (
      SELECT
        p.id::text AS id,
        p.channel_id,
        p.title,
        COALESCE(p.slug, '') AS slug,
        COALESCE(p.description, '') AS description,
        COALESCE(p.genre, '') AS genre,
        p.start_time::text AS start_time,
        p.end_time::text AS end_time,
        p.date::text AS date,
        COALESCE(c.name, p.channel_id) AS channel_name,
        c.logo_url,
        c.channel_number
      FROM programs_fr p
      LEFT JOIN channels_fr c ON c.channel_id = p.channel_id
      WHERE p.genre IS NOT NULL
        AND (
          p.genre ILIKE '%film%'
          OR p.genre ILIKE '%cinéma%'
          OR p.genre ILIKE '%cinema%'
          OR p.genre ILIKE '%movie%'
          OR p.genre ILIKE '%téléfilm%'
          OR p.genre ILIKE '%telefilm%'
          OR p.genre ILIKE '%série%'
          OR p.genre ILIKE '%serie%'
        )
      ORDER BY p.date DESC, p.start_time ASC
    ) t;
  `;

  const programs = runPsqlJsonQuery(sql);
  const { filmMap, seriesMap } = buildProgramsAggregates(programs);
  const selectedFilms = sortAggregateMap(filmMap, FILM_LIMIT);
  const selectedSeries = sortAggregateMap(seriesMap, SERIES_LIMIT);
  const selectedWorks = [
    ...selectedFilms.map((item) => ({ ...item, entityType: 'film' })),
    ...selectedSeries.map((item) => ({ ...item, entityType: 'series' })),
  ];

  let remainingSearchBudget = WIKIDATA_SEARCH_BUDGET;

  const searchResults = await mapConcurrent(selectedWorks, MATCH_CONCURRENCY, async (work) => {
    const existingFile = path.join(
      work.entityType === 'film' ? FILMS_DIR : SERIES_DIR,
      `${work.slug}.json`,
    );
    const existing = readJsonIfExists(existingFile, null);
    if (!REFRESH_WIKIDATA && existing?.externalIds?.wikidata) {
      return {
        slug: work.slug,
        entityType: work.entityType,
        qid: existing.externalIds.wikidata,
        score: existing.matchConfidence ?? 1,
      };
    }

     const cacheKey = `${work.entityType}:${normalizeText(work.title)}`;
     if (!REFRESH_WIKIDATA && Object.prototype.hasOwnProperty.call(searchCache, cacheKey)) {
       const cached = searchCache[cacheKey];
       return {
         slug: work.slug,
         entityType: work.entityType,
         qid: cached?.qid || null,
         score: cached?.score || null,
       };
     }

    if (remainingSearchBudget <= 0) {
      return {
        slug: work.slug,
        entityType: work.entityType,
        qid: existing?.externalIds?.wikidata || null,
        score: existing?.matchConfidence ?? null,
      };
    }
    remainingSearchBudget -= 1;

    const match = await searchWikidata(work.title, work.entityType, searchCache);
    return {
      slug: work.slug,
      entityType: work.entityType,
      qid: match?.qid || null,
      score: match?.score || null,
    };
  });

  const qids = searchResults.map((item) => item.qid).filter(Boolean);
  const wikidataLookup = await fetchWikidataEntities(qids);

  const referencedIds = new Set();
  searchResults.forEach((result) => {
    if (!result.qid) return;
    const entity = wikidataLookup[result.qid];
    getClaimEntityIds(entity, 'P161').forEach((id) => referencedIds.add(id));
    getClaimEntityIds(entity, 'P57').forEach((id) => referencedIds.add(id));
    getClaimEntityIds(entity, 'P170').forEach((id) => referencedIds.add(id));
    getClaimEntityIds(entity, 'P136').forEach((id) => referencedIds.add(id));
    getClaimEntityIds(entity, 'P27').forEach((id) => referencedIds.add(id));
    getClaimEntityIds(entity, 'P106').forEach((id) => referencedIds.add(id));
  });

  const relatedLookup = await fetchWikidataEntities(Array.from(referencedIds));

  const films = [];
  const series = [];
  const actorAccumulator = new Map();
  const nowIso = new Date().toISOString();

  const searchResultMap = new Map(searchResults.map((item) => [`${item.entityType}:${item.slug}`, item]));

  for (const work of selectedWorks) {
    const meta = ENTITY_INDEX_META[work.entityType];
    const existingFile = path.join(meta.dir, `${work.slug}.json`);
    const existing = readJsonIfExists(existingFile, null);
    const searchResult = searchResultMap.get(`${work.entityType}:${work.slug}`);
    const wikidataEntity = searchResult?.qid ? wikidataLookup[searchResult.qid] : null;
    const genreIds = wikidataEntity ? getClaimEntityIds(wikidataEntity, 'P136') : [];
    const castIds = wikidataEntity ? getClaimEntityIds(wikidataEntity, 'P161').slice(0, 16) : [];
    const directorIds = wikidataEntity ? getClaimEntityIds(wikidataEntity, 'P57') : [];
    const creatorIds = wikidataEntity ? getClaimEntityIds(wikidataEntity, 'P170') : [];

    const channels = Array.from(work.channels.entries())
      .map(([channelId, channel]) => buildChannelSummary(channelId, channel))
      .sort((a, b) => (a.channelNumber || 9999) - (b.channelNumber || 9999));

    const commonPayload = {
      slug: work.slug,
      title: work.title,
      airingsCount: work.airingsCount,
      sourceTitles: Array.from(work.sourceTitles).sort((a, b) => a.localeCompare(b, 'fr')),
      genres: genreIds.length
        ? genreIds.map((id) => getEntityLabel(relatedLookup[id])).filter(Boolean)
        : Array.from(work.genres.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([genre]) => genre),
      description: selectBestDescription(work) || getEntityDescription(wikidataEntity) || null,
      descriptionAi: existing?.descriptionAi || null,
      image: existing?.image?.url
        ? existing.image
        : {
            url: commonsImageUrl(getClaimString(wikidataEntity, 'P18')),
            source: searchResult?.qid ? 'wikidata' : null,
            license: null,
            attribution: null,
            kind: searchResult?.qid ? 'editorial' : null,
          },
      channels,
      upcomingAirings: work.upcomingAirings
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .slice(0, 24),
      externalIds: {
        wikidata: searchResult?.qid || existing?.externalIds?.wikidata || null,
        wikipedia: wikipediaUrlFromEntity(wikidataEntity) || existing?.externalIds?.wikipedia || null,
        imdb: getClaimString(wikidataEntity, 'P345') || existing?.externalIds?.imdb || null,
        tmdb: existing?.externalIds?.tmdb || null,
      },
      matchConfidence: searchResult?.score ?? existing?.matchConfidence ?? null,
      updatedAt: nowIso,
    };

    if (work.entityType === 'film') {
      const film = mergeExistingEntity({
        type: 'film',
        ...commonPayload,
        year: getClaimYear(wikidataEntity, 'P577') || existing?.year || null,
        durationMinutes: Math.round(getClaimNumber(wikidataEntity, 'P2047') || existing?.durationMinutes || 0) || null,
        cast: castIds.map((id) => ({
          qid: id,
          slug: slugify(getEntityLabel(relatedLookup[id]) || id),
          name: getEntityLabel(relatedLookup[id]) || id,
          role: 'actor',
        })),
        director: directorIds[0]
          ? {
              qid: directorIds[0],
              slug: slugify(getEntityLabel(relatedLookup[directorIds[0]]) || directorIds[0]),
              name: getEntityLabel(relatedLookup[directorIds[0]]) || directorIds[0],
              role: 'director',
            }
          : existing?.director || null,
      }, existing);
      films.push(film);

      film.cast.forEach((person) => {
        if (!person.qid) return;
        if (!actorAccumulator.has(person.qid)) {
          actorAccumulator.set(person.qid, {
            qid: person.qid,
            name: person.name,
            slug: person.slug,
            works: new Map(),
            upcomingAirings: [],
          });
        }
        const actor = actorAccumulator.get(person.qid);
        actor.works.set(`film:${film.slug}`, { type: 'film', slug: film.slug, title: film.title });
        actor.upcomingAirings.push(...film.upcomingAirings.slice(0, 6));
      });

      if (film.director?.qid) {
        if (!actorAccumulator.has(film.director.qid)) {
          actorAccumulator.set(film.director.qid, {
            qid: film.director.qid,
            name: film.director.name,
            slug: film.director.slug,
            works: new Map(),
            upcomingAirings: [],
          });
        }
        const director = actorAccumulator.get(film.director.qid);
        director.works.set(`film:${film.slug}`, { type: 'film', slug: film.slug, title: film.title });
        director.upcomingAirings.push(...film.upcomingAirings.slice(0, 6));
      }
    } else {
      const serie = mergeExistingEntity({
        type: 'series',
        ...commonPayload,
        startYear: getClaimYear(wikidataEntity, 'P580') || getClaimYear(wikidataEntity, 'P577') || existing?.startYear || null,
        numberOfSeasons: Math.round(getClaimNumber(wikidataEntity, 'P2437') || existing?.numberOfSeasons || 0) || null,
        cast: castIds.map((id) => ({
          qid: id,
          slug: slugify(getEntityLabel(relatedLookup[id]) || id),
          name: getEntityLabel(relatedLookup[id]) || id,
          role: 'actor',
        })),
        creator: (creatorIds[0] || directorIds[0])
          ? {
              qid: creatorIds[0] || directorIds[0],
              slug: slugify(getEntityLabel(relatedLookup[creatorIds[0] || directorIds[0]]) || creatorIds[0] || directorIds[0]),
              name: getEntityLabel(relatedLookup[creatorIds[0] || directorIds[0]]) || creatorIds[0] || directorIds[0],
              role: 'creator',
            }
          : existing?.creator || null,
      }, existing);
      series.push(serie);

      serie.cast.forEach((person) => {
        if (!person.qid) return;
        if (!actorAccumulator.has(person.qid)) {
          actorAccumulator.set(person.qid, {
            qid: person.qid,
            name: person.name,
            slug: person.slug,
            works: new Map(),
            upcomingAirings: [],
          });
        }
        const actor = actorAccumulator.get(person.qid);
        actor.works.set(`series:${serie.slug}`, { type: 'series', slug: serie.slug, title: serie.title });
        actor.upcomingAirings.push(...serie.upcomingAirings.slice(0, 6));
      });
    }
  }

  const actorDrafts = Array.from(actorAccumulator.values())
    .map((item) => {
      const personEntity = relatedLookup[item.qid];
      const existingFile = path.join(ACTORS_DIR, `${item.slug}.json`);
      const existing = readJsonIfExists(existingFile, null);
      const occupationIds = getClaimEntityIds(personEntity, 'P106');
      const nationalityIds = getClaimEntityIds(personEntity, 'P27');
      return mergeExistingEntity({
        type: 'actor',
        slug: item.slug,
        name: getEntityLabel(personEntity) || item.name,
        worksCount: item.works.size,
        description: getEntityDescription(personEntity) || existing?.description || null,
        descriptionAi: existing?.descriptionAi || null,
        image: existing?.image?.url
          ? existing.image
          : {
              url: commonsImageUrl(getClaimString(personEntity, 'P18')),
              source: item.qid ? 'wikidata' : null,
              license: null,
              attribution: null,
              kind: item.qid ? 'editorial' : null,
            },
        birthDate: getClaimTime(personEntity, 'P569') || existing?.birthDate || null,
        nationality: getEntityLabel(relatedLookup[nationalityIds[0]]) || existing?.nationality || null,
        jobTitle: getEntityLabel(relatedLookup[occupationIds[0]]) || existing?.jobTitle || null,
        externalIds: {
          wikidata: item.qid || existing?.externalIds?.wikidata || null,
          wikipedia: wikipediaUrlFromEntity(personEntity) || existing?.externalIds?.wikipedia || null,
          imdb: getClaimString(personEntity, 'P345') || existing?.externalIds?.imdb || null,
          tmdb: existing?.externalIds?.tmdb || null,
        },
        knownFor: Array.from(item.works.values()).slice(0, 16),
        upcomingAirings: item.upcomingAirings
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .filter((airing, index, arr) => arr.findIndex((entry) => entry.id === airing.id) === index)
          .slice(0, 18),
        updatedAt: nowIso,
      }, existing);
    })
    .sort((a, b) => b.worksCount - a.worksCount || a.name.localeCompare(b.name, 'fr'));

  films.forEach((film) => writeJson(path.join(FILMS_DIR, `${film.slug}.json`), film));
  series.forEach((serie) => writeJson(path.join(SERIES_DIR, `${serie.slug}.json`), serie));
  actorDrafts.forEach((actor) => writeJson(path.join(ACTORS_DIR, `${actor.slug}.json`), actor));

  cleanupEntityDir(FILMS_DIR, films.map((item) => item.slug));
  cleanupEntityDir(SERIES_DIR, series.map((item) => item.slug));
  cleanupEntityDir(ACTORS_DIR, actorDrafts.map((item) => item.slug));

  const filmRoutes = films.map((item) => `/film/${item.slug}`);
  const seriesRoutes = series.map((item) => `/serie/${item.slug}`);
  const actorRoutes = actorDrafts.map((item) => `/acteur/${item.slug}`);

  const filmIndex = {
    type: 'film',
    title: ENTITY_INDEX_META.film.title,
    description: ENTITY_INDEX_META.film.description,
    items: films.slice(0, FILM_LIMIT).map((film) => ({
      slug: film.slug,
      title: film.title,
      subtitle: film.year ? String(film.year) : null,
      imageUrl: film.image?.url || null,
      count: film.airingsCount,
      href: `/film/${film.slug}`,
    })),
    updatedAt: nowIso,
  };

  const seriesIndex = {
    type: 'series',
    title: ENTITY_INDEX_META.series.title,
    description: ENTITY_INDEX_META.series.description,
    items: series.slice(0, SERIES_LIMIT).map((serie) => ({
      slug: serie.slug,
      title: serie.title,
      subtitle: serie.startYear ? String(serie.startYear) : null,
      imageUrl: serie.image?.url || null,
      count: serie.airingsCount,
      href: `/serie/${serie.slug}`,
    })),
    updatedAt: nowIso,
  };

  const actorIndex = {
    type: 'actor',
    title: ENTITY_INDEX_META.actor.title,
    description: ENTITY_INDEX_META.actor.description,
    items: actorDrafts.slice(0, ACTOR_LIMIT).map((actor) => ({
      slug: actor.slug,
      title: actor.name,
      subtitle: actor.jobTitle || null,
      imageUrl: actor.image?.url || null,
      count: actor.worksCount,
      href: `/acteur/${actor.slug}`,
    })),
    updatedAt: nowIso,
  };

  writeJson(path.join(INDEXES_DIR, 'films.json'), filmIndex);
  writeJson(path.join(INDEXES_DIR, 'series.json'), seriesIndex);
  writeJson(path.join(INDEXES_DIR, 'actors.json'), actorIndex);
  writeJson(path.join(ENTITIES_DIR, 'routes.json'), {
    updatedAt: nowIso,
    film: filmRoutes,
    series: seriesRoutes,
    actor: actorRoutes,
    indexes: ['/films', '/series', '/acteurs'],
  });
  writeJson(path.join(ENTITIES_DIR, 'entity-index.json'), {
    updatedAt: nowIso,
    films: filmIndex.items.slice(0, 40),
    series: seriesIndex.items.slice(0, 40),
    actors: actorIndex.items.slice(0, 40),
  });
  writeJson(path.join(CACHE_DIR, 'wikidata-search.json'), searchCache);

  const routesSource = `export const ENTITY_ROUTES = ${JSON.stringify({
    film: filmRoutes,
    series: seriesRoutes,
    actor: actorRoutes,
  }, null, 2)};\n\nexport const ENTITY_INDEX_ROUTES = ${JSON.stringify(['/films', '/series', '/acteurs'], null, 2)};\n`;
  fs.writeFileSync(ROUTES_FILE, routesSource, 'utf8');

  console.log(`✅ Entity generation completed`);
  console.log(`   Films: ${films.length}`);
  console.log(`   Series: ${series.length}`);
  console.log(`   Actors: ${actorDrafts.length}`);
  console.log(`   Wikidata search budget used: ${WIKIDATA_SEARCH_BUDGET - remainingSearchBudget}/${WIKIDATA_SEARCH_BUDGET}`);
  console.log(`   Routes file: ${path.relative(FRONTEND_DIR, ROUTES_FILE)}`);
}

main().catch((error) => {
  console.error('❌ Failed to generate entities');
  console.error(error);
  process.exit(1);
});
