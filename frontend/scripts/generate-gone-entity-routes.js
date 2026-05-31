#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '..');
const ENTITIES_DIR = path.join(FRONTEND_DIR, 'public', 'entities-data');
const ROUTES_FILE = path.join(ENTITIES_DIR, 'routes.json');
const GONE_FILE = path.join(ENTITIES_DIR, 'gone-routes.json');
const MANUAL_GONE_FILE = path.join(ENTITIES_DIR, 'manual-gone-routes.json');

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? ''];
  }),
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readLines(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function toHref(type, slug) {
  return `/${type}/${slug}`;
}

function main() {
  const previousFilmsFile = args.get('previous-films-file');
  const previousSeriesFile = args.get('previous-series-file');
  const routes = readJson(ROUTES_FILE);

  const manualGone = fs.existsSync(MANUAL_GONE_FILE) ? readJson(MANUAL_GONE_FILE) : { film: [], series: [] };
  const currentFilmRoutes = new Set(routes.film || []);
  const currentSeriesRoutes = new Set(routes.series || []);

  const previousFilmRoutes = new Set(readLines(previousFilmsFile).map((slug) => toHref('film', slug)));
  const previousSeriesRoutes = new Set(readLines(previousSeriesFile).map((slug) => toHref('serie', slug)));

  const goneFilms = Array.from(new Set([
    ...Array.from(previousFilmRoutes).filter((href) => !currentFilmRoutes.has(href)),
    ...((manualGone.film || []).filter((href) => !currentFilmRoutes.has(href))),
  ])).sort();
  const goneSeries = Array.from(new Set([
    ...Array.from(previousSeriesRoutes).filter((href) => !currentSeriesRoutes.has(href)),
    ...((manualGone.series || []).filter((href) => !currentSeriesRoutes.has(href))),
  ])).sort();

  const payload = {
    updatedAt: new Date().toISOString(),
    film: goneFilms,
    series: goneSeries,
    total: goneFilms.length + goneSeries.length,
  };

  fs.writeFileSync(GONE_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`✅ Gone routes generated`);
  console.log(`   Films: ${goneFilms.length}`);
  console.log(`   Series: ${goneSeries.length}`);
  console.log(`   File: ${GONE_FILE}`);
}

main();
