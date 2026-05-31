#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(FRONTEND_DIR, '..');
const ENTITIES_DIR = path.join(FRONTEND_DIR, 'public', 'entities-data');
const ROUTES_FILE = path.join(ENTITIES_DIR, 'routes.json');
const INDEXES_DIR = path.join(ENTITIES_DIR, 'indexes');
const DENYLIST_FILE = path.join(__dirname, 'entity-enrichment-denylist.json');

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);

const LIMIT = Number(args.get('limit') || process.env.ENTITY_DESCRIPTION_LIMIT || 0);
const TYPE_FILTER = args.get('type') || process.env.ENTITY_DESCRIPTION_TYPE || '';
const REQUEST_DELAY_MS = Number(args.get('delay-ms') || process.env.ENTITY_DESCRIPTION_DELAY_MS || 150);
const RETRY_LIMIT = Number(args.get('retry-limit') || process.env.ENTITY_DESCRIPTION_RETRY_LIMIT || 5);
const CONCURRENCY = Number(args.get('concurrency') || process.env.ENTITY_DESCRIPTION_CONCURRENCY || 4);

function loadDeepSeekKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  const keyFile = path.join(ROOT_DIR, 'DEEPSEEK.md');
  if (!fs.existsSync(keyFile)) {
    throw new Error('DEEPSEEK.md mancante');
  }
  const content = fs.readFileSync(keyFile, 'utf8');
  const match = content.match(/DEEPSEEK_API_KEY\s*=\s*(.+)/);
  if (!match) {
    throw new Error('DEEPSEEK_API_KEY non trovato in DEEPSEEK.md');
  }
  process.env.DEEPSEEK_API_KEY = match[1].trim();
  return process.env.DEEPSEEK_API_KEY;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readPublishedRouteSlugs() {
  if (!fs.existsSync(ROUTES_FILE)) return null;
  const routes = readJson(ROUTES_FILE);
  return {
    film: new Set((routes.film || []).map((item) => String(item).split('/').pop()).filter(Boolean)),
    series: new Set((routes.series || []).map((item) => String(item).split('/').pop()).filter(Boolean)),
    actor: new Set((routes.actor || []).map((item) => String(item).split('/').pop()).filter(Boolean)),
  };
}

function readIndexOrder(type) {
  const fileByType = {
    film: 'films.json',
    series: 'series.json',
    actor: 'actors.json',
  };
  const indexFile = path.join(INDEXES_DIR, fileByType[type] || '');
  if (!fileByType[type] || !fs.existsSync(indexFile)) return new Map();
  const payload = readJson(indexFile);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return new Map(items.map((item, position) => [item.slug, position]));
}

function loadDenylist() {
  if (!fs.existsSync(DENYLIST_FILE)) {
    return {
      exact: { film: new Set(), series: new Set(), actor: new Set() },
      regex: [],
    };
  }

  const payload = readJson(DENYLIST_FILE);
  return {
    exact: {
      film: new Set(payload?.exact?.film || []),
      series: new Set(payload?.exact?.series || []),
      actor: new Set(payload?.exact?.actor || []),
    },
    regex: (payload?.regex || [])
      .map((pattern) => {
        try {
          return new RegExp(pattern, 'i');
        } catch {
          return null;
        }
      })
      .filter(Boolean),
  };
}

function shouldSkipEntity(entry, entity, denylist) {
  if (denylist.exact[entry.type]?.has(entry.slug)) return true;

  const haystacks = [
    entry.slug,
    entity.title,
    entity.name,
    entity.description,
    ...(entity.genres || []),
    ...(entity.sourceTitles || []),
  ]
    .filter(Boolean)
    .map((value) => String(value));

  return haystacks.some((value) => denylist.regex.some((pattern) => pattern.test(value)));
}

function collectEntityFiles() {
  const denylist = loadDenylist();
  const publishedSlugs = readPublishedRouteSlugs();
  const dirs = [
    { type: 'film', dir: path.join(ENTITIES_DIR, 'films') },
    { type: 'series', dir: path.join(ENTITIES_DIR, 'series') },
    { type: 'actor', dir: path.join(ENTITIES_DIR, 'actors') },
  ];

  const entries = [];
  dirs.forEach(({ type, dir }) => {
    if (!fs.existsSync(dir)) return;
    const orderMap = readIndexOrder(type);
    fs.readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .forEach((name) => {
        if (TYPE_FILTER && TYPE_FILTER !== type) return;
        const slug = name.replace(/\.json$/, '');
        if (publishedSlugs?.[type] && !publishedSlugs[type].has(slug)) return;
        const filePath = path.join(dir, name);
        const entity = readJson(filePath);
        if (shouldSkipEntity({ type, slug, filePath }, entity, denylist)) return;
        entries.push({
          type,
          slug,
          filePath,
          sortOrder: orderMap.has(slug) ? orderMap.get(slug) : Number.MAX_SAFE_INTEGER,
        });
      });
  });
  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.filePath.localeCompare(b.filePath);
  });
}

function buildPrompt(type, entity) {
  const title = entity.title || entity.name;
  const hints = [
    entity.genres?.length ? `Genres: ${entity.genres.join(', ')}` : null,
    entity.year ? `Année: ${entity.year}` : null,
    entity.startYear ? `Début: ${entity.startYear}` : null,
    entity.numberOfSeasons ? `Saisons: ${entity.numberOfSeasons}` : null,
    entity.jobTitle ? `Métier: ${entity.jobTitle}` : null,
    entity.description ? `Contexte: ${entity.description}` : null,
  ].filter(Boolean).join('\n');

  return [
    {
      role: 'system',
      content: 'Tu rédiges des descriptions éditoriales françaises courtes, naturelles et sans ton promotionnel excessif.',
    },
    {
      role: 'user',
      content: `Rédige en français une description de 100 à 120 mots pour ${type} "${title}".
Mentionne le genre, l’ambiance et ce qui le rend intéressant pour un téléspectateur.
Termine par une phrase contenant exactement "à voir sur programmecesoir.fr".
Réponds uniquement avec la description finale, sans titre ni puces.

${hints}`.trim(),
    },
  ];
}

async function generateDescription(apiKey, type, entity) {
  let lastError = null;

  for (let attempt = 0; attempt < RETRY_LIMIT; attempt += 1) {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: buildPrompt(type, entity),
        temperature: 0.7,
        max_tokens: 220,
      }),
    });

    if (response.ok) {
      const payload = await response.json();
      return String(payload?.choices?.[0]?.message?.content || '').trim();
    }

    if (response.status === 429 || response.status >= 500) {
      lastError = new Error(`DeepSeek HTTP ${response.status}`);
      const retryAfter = Number(response.headers.get('retry-after') || 0);
      const delayMs = retryAfter > 0
        ? retryAfter * 1000
        : Math.min(10000, 1000 * (attempt + 1) * (attempt + 1));
      await sleep(delayMs);
      continue;
    }

    throw new Error(`DeepSeek HTTP ${response.status}`);
  }

  throw lastError || new Error('DeepSeek request failed');
}

async function main() {
  const apiKey = loadDeepSeekKey();
  const files = collectEntityFiles();
  let processed = 0;
  let index = 0;
  let shouldStop = false;

  async function worker() {
    while (!shouldStop && index < files.length) {
      const current = index;
      index += 1;
      const entry = files[current];
      const entity = readJson(entry.filePath);
      if (entity.descriptionAi) continue;
      if (!entity.title && !entity.name) continue;

      try {
        const description = await generateDescription(apiKey, entry.type, entity);
        if (!description) continue;

        entity.descriptionAi = description;
        entity.updatedAt = new Date().toISOString();
        writeJson(entry.filePath, entity);
        processed += 1;

        console.log(`✅ ${entry.type}: ${path.basename(entry.filePath)}`);
        if (LIMIT > 0 && processed >= LIMIT) {
          shouldStop = true;
          return;
        }
        await sleep(REQUEST_DELAY_MS);
      } catch (error) {
        console.error(`⚠️ Failed ${entry.type}: ${path.basename(entry.filePath)} - ${error.message}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(CONCURRENCY, files.length || 1)) }, () => worker()),
  );

  console.log(`✅ Description enrichment completed: ${processed}`);
}

main().catch((error) => {
  console.error('❌ Failed to enrich entity descriptions');
  console.error(error);
  process.exit(1);
});
