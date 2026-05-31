#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(FRONTEND_DIR, '..');
const ENTITIES_DIR = path.join(FRONTEND_DIR, 'public', 'entities-data');
const CHANGED_FILE = path.join(ENTITIES_DIR, 'changed-entities.json');
const META_FILE = path.join(ENTITIES_DIR, 'airings-sync-meta.json');

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);

const HORIZON_DAYS = Number(args.get('horizon-days') || process.env.ENTITY_AIRINGS_HORIZON_DAYS || 7);
const MAX_AIRINGS = Number(args.get('max-airings') || process.env.ENTITY_AIRINGS_MAX || 18);
const PAST_HOURS = Number(args.get('past-hours') || process.env.ENTITY_AIRINGS_PAST_HOURS || 2);
const DRY_RUN = args.get('dry-run') === 'true';

const ENTITY_DIRS = {
  film: path.join(ENTITIES_DIR, 'films'),
  series: path.join(ENTITIES_DIR, 'series'),
  actor: path.join(ENTITIES_DIR, 'actors'),
};

const ENTITY_BASE_PATHS = {
  film: '/film',
  series: '/serie',
  actor: '/acteur',
};

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
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runPsqlJsonQuery(sql) {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL mancante per update-entity-airings');
  }

  const output = execFileSync(
    'psql',
    ['-At', process.env.DATABASE_URL, '-c', sql],
    {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 60,
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
    genre.includes('serie')
    || /(?:st\.?|saison|season|ep\.?|episode|épisode)\s*\d+/i.test(title)
  ) {
    return 'series';
  }
  return null;
}

function getProgramUrl(channelSlug, title) {
  return `/programme/${channelSlug}/${slugify(title)}`;
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

function canonicalTitleForEntity(type, title) {
  if (type === 'series') return extractSeriesBaseTitle(title);
  return String(title || '').trim();
}

function buildEntityLookup(type) {
  const dir = ENTITY_DIRS[type];
  const lookup = new Map();
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => name.endsWith('.json'))
    : [];

  files.forEach((name) => {
    const filePath = path.join(dir, name);
    const entity = readJson(filePath);
    const aliases = new Set([
      entity.slug,
      slugify(canonicalTitleForEntity(type, entity.title || entity.name || '')),
      ...((entity.sourceTitles || []).map((title) => slugify(canonicalTitleForEntity(type, title)))),
    ]);

    const record = {
      type,
      slug: entity.slug,
      href: `${ENTITY_BASE_PATHS[type]}/${entity.slug}`,
      filePath,
      entity,
    };

    aliases.forEach((alias) => {
      if (!alias || lookup.has(alias)) return;
      lookup.set(alias, record);
    });
  });

  return lookup;
}

function sortAndTrimAirings(airings, limit = MAX_AIRINGS) {
  const nowTs = Date.now();
  const seen = new Set();
  return airings
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .filter((airing) => {
      const endTs = Date.parse(airing?.endTime || '');
      const startTs = Date.parse(airing?.startTime || '');
      if (!Number.isNaN(endTs)) return endTs >= nowTs;
      if (!Number.isNaN(startTs)) return startTs >= nowTs;
      return false;
    })
    .filter((airing) => {
      if (seen.has(airing.id)) return false;
      seen.add(airing.id);
      return true;
    })
    .slice(0, limit);
}

function updateWorkEntity(record, airings, syncedAt) {
  const nextEntity = {
    ...record.entity,
    upcomingAirings: sortAndTrimAirings(airings),
    nextAiringAt: airings.length ? sortAndTrimAirings(airings, 1)[0].startTime : null,
    lastProgramRefreshAt: syncedAt,
  };

  const before = JSON.stringify(record.entity);
  const after = JSON.stringify(nextEntity);
  if (before === after) return false;
  if (!DRY_RUN) writeJson(record.filePath, nextEntity);
  record.entity = nextEntity;
  return true;
}

function updateActorEntity(record, workMap, syncedAt) {
  const aggregated = [];
  (record.entity.knownFor || []).forEach((item) => {
    const key = `${item.type}:${item.slug}`;
    const work = workMap.get(key);
    if (!work?.entity?.upcomingAirings?.length) return;
    aggregated.push(...work.entity.upcomingAirings);
  });

  const nextAirings = sortAndTrimAirings(aggregated, 12);
  const nextEntity = {
    ...record.entity,
    upcomingAirings: nextAirings,
    nextAiringAt: nextAirings[0]?.startTime || null,
    lastProgramRefreshAt: syncedAt,
  };

  const before = JSON.stringify(record.entity);
  const after = JSON.stringify(nextEntity);
  if (before === after) return false;
  if (!DRY_RUN) writeJson(record.filePath, nextEntity);
  record.entity = nextEntity;
  return true;
}

function main() {
  const syncedAt = new Date().toISOString();
  const filmLookup = buildEntityLookup('film');
  const seriesLookup = buildEntityLookup('series');

  const sql = `
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    FROM (
      SELECT
        p.id::text AS id,
        p.channel_id,
        p.title,
        COALESCE(p.genre, '') AS genre,
        p.start_time::text AS start_time,
        p.end_time::text AS end_time,
        p.date::text AS date,
        COALESCE(c.name, p.channel_id) AS channel_name
      FROM programs_fr p
      LEFT JOIN channels_fr c ON c.channel_id = p.channel_id
      WHERE p.end_time >= NOW()
        AND p.start_time < NOW() + INTERVAL '${HORIZON_DAYS} days'
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
      ORDER BY p.start_time ASC
    ) t;
  `;

  const programs = runPsqlJsonQuery(sql);
  const matched = new Map();

  programs.forEach((program) => {
    const type = inferProgramKind(program);
    if (!type) return;
    const canonicalTitle = canonicalTitleForEntity(type, program.title);
    const slug = slugify(canonicalTitle);
    const record = type === 'film' ? filmLookup.get(slug) : seriesLookup.get(slug);
    if (!record) return;

    const key = `${type}:${record.slug}`;
    if (!matched.has(key)) matched.set(key, []);
    matched.get(key).push(buildUpcomingAiring(program));
  });

  const changed = {
    film: [],
    series: [],
    actor: [],
  };

  const workMap = new Map();
  [...filmLookup.values(), ...seriesLookup.values()].forEach((record) => {
    const key = `${record.type}:${record.slug}`;
    if (workMap.has(key)) return;
    const airings = matched.get(key) || [];
    if (updateWorkEntity(record, airings, syncedAt)) {
      changed[record.type].push(record.href);
    }
    workMap.set(key, record);
  });

  const actorDir = ENTITY_DIRS.actor;
  const actorRecords = fs.existsSync(actorDir)
    ? fs.readdirSync(actorDir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        const filePath = path.join(actorDir, name);
        const entity = readJson(filePath);
        return {
          type: 'actor',
          slug: entity.slug,
          href: `${ENTITY_BASE_PATHS.actor}/${entity.slug}`,
          filePath,
          entity,
        };
      })
    : [];

  actorRecords.forEach((record) => {
    if (updateActorEntity(record, workMap, syncedAt)) {
      changed.actor.push(record.href);
    }
  });

  const payload = {
    syncedAt,
    horizonDays: HORIZON_DAYS,
    pastHours: PAST_HOURS,
    queryCount: 1,
    programRowsFetched: programs.length,
    matchedEntityPrograms: Array.from(matched.values()).reduce((sum, airings) => sum + airings.length, 0),
    changedCounts: {
      film: changed.film.length,
      series: changed.series.length,
      actor: changed.actor.length,
    },
    changedRoutes: [
      ...changed.film,
      ...changed.series,
      ...changed.actor,
    ],
    dryRun: DRY_RUN,
  };

  if (!DRY_RUN) {
    writeJson(CHANGED_FILE, payload);
    writeJson(META_FILE, payload);
  }

  console.log(`✅ Entity airings sync completed${DRY_RUN ? ' (dry-run)' : ''}`);
  console.log(`   Supabase / Postgres queries: 1`);
  console.log(`   Program rows fetched: ${payload.programRowsFetched}`);
  console.log(`   Matched entity programs: ${payload.matchedEntityPrograms}`);
  console.log(`   Changed films: ${payload.changedCounts.film}`);
  console.log(`   Changed series: ${payload.changedCounts.series}`);
  console.log(`   Changed actors: ${payload.changedCounts.actor}`);
  if (DRY_RUN) {
    console.log(`   No files written`);
  } else {
    console.log(`   Wrote: ${path.relative(FRONTEND_DIR, META_FILE)}`);
    console.log(`   Wrote: ${path.relative(FRONTEND_DIR, CHANGED_FILE)}`);
  }
}

main();
