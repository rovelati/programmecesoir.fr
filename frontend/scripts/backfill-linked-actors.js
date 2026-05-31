#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '..');
const ENTITIES_DIR = path.join(FRONTEND_DIR, 'public', 'entities-data');
const FILMS_DIR = path.join(ENTITIES_DIR, 'films');
const SERIES_DIR = path.join(ENTITIES_DIR, 'series');
const ACTORS_DIR = path.join(ENTITIES_DIR, 'actors');
const ROUTES_JSON = path.join(ENTITIES_DIR, 'routes.json');
const ROUTES_JS = path.join(FRONTEND_DIR, 'src', 'data', 'entity-routes.js');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

const commonsImageUrl = (filename) => (
  filename ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename).replace(/%20/g, '%20')}` : null
);

const getBestClaimValue = (claim) => (
  claim?.mainsnak?.datavalue?.value ?? null
);

const getClaimEntityIds = (entity, property) => (
  (entity?.claims?.[property] || [])
    .map((claim) => getBestClaimValue(claim)?.id)
    .filter(Boolean)
);

const getClaimString = (entity, property) => {
  const value = (entity?.claims?.[property] || []).map(getBestClaimValue)[0];
  return typeof value === 'string' ? value : null;
};

const getClaimTime = (entity, property) => {
  const value = (entity?.claims?.[property] || []).map(getBestClaimValue)[0];
  return value?.time ? String(value.time).replace(/^\+/, '').slice(0, 10) : null;
};

const getEntityLabel = (entity) => (
  entity?.labels?.fr?.value
  || entity?.labels?.en?.value
  || null
);

const getEntityDescription = (entity) => (
  entity?.descriptions?.fr?.value
  || entity?.descriptions?.en?.value
  || null
);

const wikipediaUrlFromEntity = (entity) => {
  const title = entity?.sitelinks?.frwiki?.title || entity?.sitelinks?.enwiki?.title;
  const domain = entity?.sitelinks?.frwiki?.title ? 'fr.wikipedia.org' : entity?.sitelinks?.enwiki?.title ? 'en.wikipedia.org' : null;
  if (!title || !domain) return null;
  return `https://${domain}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
};

async function fetchEntities(qids) {
  if (!qids.length) return {};
  const entities = {};
  for (const ids of chunk(qids, 50)) {
    const url = new URL('https://www.wikidata.org/w/api.php');
    url.searchParams.set('action', 'wbgetentities');
    url.searchParams.set('format', 'json');
    url.searchParams.set('languages', 'fr|en');
    url.searchParams.set('sitefilter', 'frwiki|enwiki');
    url.searchParams.set('props', 'labels|descriptions|claims|sitelinks');
    url.searchParams.set('ids', ids.join('|'));
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ProgrammeCeSoir/1.0 (editorial backfill)' },
    });
    if (!response.ok) {
      throw new Error(`Wikidata wbgetentities failed: ${response.status}`);
    }
    const payload = await response.json();
    Object.assign(entities, payload.entities || {});
  }
  return entities;
}

function collectMissingActors(targetSlug = null) {
  const existing = new Set(fs.readdirSync(ACTORS_DIR).filter((file) => file.endsWith('.json')).map((file) => file.replace(/\.json$/, '')));
  const accumulator = new Map();
  const workFiles = [
    ...fs.readdirSync(FILMS_DIR).map((file) => ({ type: 'film', filePath: path.join(FILMS_DIR, file) })),
    ...fs.readdirSync(SERIES_DIR).map((file) => ({ type: 'series', filePath: path.join(SERIES_DIR, file) })),
  ];

  for (const work of workFiles) {
    if (!work.filePath.endsWith('.json')) continue;
    const entity = readJson(work.filePath);
    for (const person of entity.cast || []) {
      if (!person?.slug || !person?.qid || existing.has(person.slug)) continue;
      if (targetSlug && person.slug !== targetSlug) continue;
      if (!accumulator.has(person.slug)) {
        accumulator.set(person.slug, {
          slug: person.slug,
          qid: person.qid,
          name: person.name || person.slug,
          works: new Map(),
          upcomingAirings: [],
        });
      }
      const item = accumulator.get(person.slug);
      item.works.set(`${work.type}:${entity.slug}`, {
        type: work.type,
        slug: entity.slug,
        title: entity.title,
      });
      item.upcomingAirings.push(...(entity.upcomingAirings || []).slice(0, 8));
    }
  }

  return accumulator;
}

async function main() {
  const targetSlug = process.argv.find((arg) => arg.startsWith('--slug='))?.split('=')[1] || null;
  const missingActors = collectMissingActors(targetSlug);
  if (missingActors.size === 0) {
    console.log('No missing linked actors found.');
    return;
  }

  const qids = Array.from(new Set(Array.from(missingActors.values()).map((item) => item.qid)));
  const people = await fetchEntities(qids);
  const relatedQids = new Set();
  qids.forEach((qid) => {
    const entity = people[qid];
    getClaimEntityIds(entity, 'P106').forEach((id) => relatedQids.add(id));
    getClaimEntityIds(entity, 'P27').forEach((id) => relatedQids.add(id));
  });
  const related = await fetchEntities(Array.from(relatedQids));

  const nowIso = new Date().toISOString();
  const created = [];
  for (const item of Array.from(missingActors.values()).sort((a, b) => a.slug.localeCompare(b.slug, 'fr'))) {
    const entity = people[item.qid];
    const occupationIds = getClaimEntityIds(entity, 'P106');
    const nationalityIds = getClaimEntityIds(entity, 'P27');
    const actor = {
      type: 'actor',
      slug: item.slug,
      name: getEntityLabel(entity) || item.name,
      worksCount: item.works.size,
      description: getEntityDescription(entity),
      descriptionAi: null,
      image: {
        url: commonsImageUrl(getClaimString(entity, 'P18')),
        source: 'wikidata',
        license: null,
        attribution: null,
        kind: 'editorial',
      },
      birthDate: getClaimTime(entity, 'P569'),
      nationality: getEntityLabel(related[nationalityIds[0]]) || null,
      jobTitle: getEntityLabel(related[occupationIds[0]]) || null,
      externalIds: {
        wikidata: item.qid,
        wikipedia: wikipediaUrlFromEntity(entity),
        imdb: getClaimString(entity, 'P345'),
        tmdb: null,
      },
      knownFor: Array.from(item.works.values()).slice(0, 16),
      upcomingAirings: item.upcomingAirings
        .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')))
        .filter((airing, index, arr) => arr.findIndex((entry) => entry.id === airing.id) === index)
        .slice(0, 18),
      updatedAt: nowIso,
      matchConfidence: 1,
      nextAiringAt: item.upcomingAirings
        .map((airing) => airing.startTime)
        .filter(Boolean)
        .sort()[0] || null,
      lastProgramRefreshAt: nowIso,
    };
    writeJson(path.join(ACTORS_DIR, `${item.slug}.json`), actor);
    created.push(actor.slug);
  }

  const routes = readJson(ROUTES_JSON);
  routes.actor = Array.from(new Set([...(routes.actor || []), ...created.map((slug) => `/acteur/${slug}`)])).sort((a, b) => a.localeCompare(b, 'fr'));
  routes.updatedAt = nowIso;
  writeJson(ROUTES_JSON, routes);

  const routesSource = `export const ENTITY_ROUTES = ${JSON.stringify({
    film: routes.film || [],
    series: routes.series || [],
    actor: routes.actor || [],
  }, null, 2)};\n\nexport const ENTITY_INDEX_ROUTES = ${JSON.stringify(routes.indexes || ['/films', '/series', '/acteurs'], null, 2)};\n`;
  fs.writeFileSync(ROUTES_JS, routesSource, 'utf8');

  console.log(`Backfilled linked actors: ${created.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
