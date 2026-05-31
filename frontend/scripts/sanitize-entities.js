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
const INDEXES_DIR = path.join(ENTITIES_DIR, 'indexes');
const ROUTES_FILE = path.join(ENTITIES_DIR, 'routes.json');
const ENTITY_INDEX_FILE = path.join(ENTITIES_DIR, 'entity-index.json');
const ENTITY_ROUTES_JS = path.join(FRONTEND_DIR, 'src', 'data', 'entity-routes.js');

const ADULT_PATTERNS = [
  /\b(adult|adulte|erotique|erotic|sexy|x{2,}|xxx)\b/i,
  /porn/i,
  /\b(sex|sexe|fuck|fucks|fucking|fucker|fuckers|blowjob|threesome|gangbang|bdsm|libertin|luxure|blacked|tushy)\b/i,
  /\bmeilleur de xxl\b/i,
  /\bnude\b/i,
  /\bsexiest\b/i,
  /\bsexomnia\b/i,
  /\banal\b/i,
  /\bass\b/i,
  /\b(brazzers|metart|dorcel|jacquie|hard|hustler|mens up|men s up)\b/i,
  /\basshole\b/i,
];

const EPISODIC_PATTERNS = [
  /---s\d+e\d+/i,
  /\bs\d+e\d+\b/i,
  /\bepisode\b/i,
];

const ADULT_CHANNEL_PATTERNS = [
  /playboytv/i,
  /\bplayboy\b/i,
  /dorcel/i,
  /\bxxl\b/i,
  /mens up/i,
  /hustler/i,
];

const SAFE_SLUGS = new Set([
  'magic-mike-xxl',
]);

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function shouldRemoveEntity(entity) {
  const slug = normalizeText(entity.slug || '');
  const channelValues = (entity.channels || [])
    .flatMap((channel) => [channel.channelId, channel.channelName])
    .map((value) => normalizeText(value))
    .filter(Boolean);
  const haystacks = [
    entity.title,
    entity.slug,
    entity.description,
    ...(entity.genres || []),
    ...(entity.sourceTitles || []),
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  return haystacks.some((value) => ADULT_PATTERNS.some((pattern) => pattern.test(value)))
    || channelValues.some((value) => ADULT_CHANNEL_PATTERNS.some((pattern) => pattern.test(value)))
    || EPISODIC_PATTERNS.some((pattern) => pattern.test(slug));
}

function shouldRemoveIndexItem(item) {
  if (SAFE_SLUGS.has(item.slug)) return false;
  const slug = normalizeText(item.slug || '');
  const haystacks = [
    item.slug,
    item.title,
    item.subtitle,
    item.href,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  return haystacks.some((value) => ADULT_PATTERNS.some((pattern) => pattern.test(value)))
    || EPISODIC_PATTERNS.some((pattern) => pattern.test(slug));
}

function sanitizeDir(dir) {
  const removedSlugs = new Set();
  fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .forEach((name) => {
      const filePath = path.join(dir, name);
      const entity = readJson(filePath);
      if (!shouldRemoveEntity(entity)) return;
      removedSlugs.add(name.replace(/\.json$/, ''));
      fs.unlinkSync(filePath);
    });
  return removedSlugs;
}

function filterIndex(fileName, dir, removedSlugs) {
  const filePath = path.join(INDEXES_DIR, fileName);
  const payload = readJson(filePath);
  payload.items = (payload.items || []).filter((item) => {
    const slug = item.slug;
    if (removedSlugs.has(slug)) return false;
    if (shouldRemoveIndexItem(item)) return false;
    return fs.existsSync(path.join(dir, `${slug}.json`));
  });
  writeJson(filePath, payload);
}

function updateRouteFiles(removedFilms, removedSeries) {
  const routes = readJson(ROUTES_FILE);
  routes.film = (routes.film || []).filter((href) => {
    const slug = String(href).split('/').pop();
    if (SAFE_SLUGS.has(slug)) return true;
    if (removedFilms.has(slug)) return false;
    if (ADULT_PATTERNS.some((pattern) => pattern.test(normalizeText(href)))) return false;
    return fs.existsSync(path.join(FILMS_DIR, `${slug}.json`));
  });
  routes.series = (routes.series || []).filter((href) => {
    const slug = String(href).split('/').pop();
    if (removedSeries.has(slug)) return false;
    if (ADULT_PATTERNS.some((pattern) => pattern.test(normalizeText(href)))) return false;
    return fs.existsSync(path.join(SERIES_DIR, `${slug}.json`));
  });
  writeJson(ROUTES_FILE, routes);

  const entityIndex = readJson(ENTITY_INDEX_FILE);
  entityIndex.films = (entityIndex.films || []).filter((item) => !removedFilms.has(item.slug));
  entityIndex.series = (entityIndex.series || []).filter((item) => !removedSeries.has(item.slug));
  writeJson(ENTITY_INDEX_FILE, entityIndex);

  const source = `export const ENTITY_ROUTES = ${JSON.stringify({
    film: routes.film || [],
    series: routes.series || [],
    actor: routes.actor || [],
  }, null, 2)};\n\nexport const ENTITY_INDEX_ROUTES = ${JSON.stringify(routes.indexes || ['/films', '/series', '/acteurs'], null, 2)};\n`;
  fs.writeFileSync(ENTITY_ROUTES_JS, source, 'utf8');
}

function main() {
  const removedFilms = sanitizeDir(FILMS_DIR);
  const removedSeries = sanitizeDir(SERIES_DIR);

  filterIndex('films.json', FILMS_DIR, removedFilms);
  filterIndex('series.json', SERIES_DIR, removedSeries);
  updateRouteFiles(removedFilms, removedSeries);

  console.log(`✅ Sanitized entities`);
  console.log(`   Removed films: ${removedFilms.size}`);
  console.log(`   Removed series: ${removedSeries.size}`);
}

main();
