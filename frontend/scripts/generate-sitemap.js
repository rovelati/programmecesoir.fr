#!/usr/bin/env node
/**
 * Generate sitemaps for programmecesoir.fr
 * - sitemap.xml (index)
 * - sitemap-static.xml (static + channel-day)
 * - sitemap-programmes.xml (program pages)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://programmecesoir.fr';
const OUTPUT_INDEX = path.join(__dirname, '../public/sitemap.xml');
const OUTPUT_STATIC = path.join(__dirname, '../public/sitemap-static.xml');
const OUTPUT_HEAD = path.join(__dirname, '../public/sitemap-head.xml');
const OUTPUT_PROGRAMS = path.join(__dirname, '../public/sitemap-programmes.xml');
const OUTPUT_HTML_SITEMAP = path.join(__dirname, '../public/plan-du-site/index.html');
const ENTITY_ROUTES_FILE = path.join(__dirname, '../public/entities-data/routes.json');
const BIRTHDAY_CURRENT_FILE = path.join(__dirname, '../public/birthday-data/current.json');
const BIRTHDAY_ARTICLES_DIR = path.join(__dirname, '../public/birthday-data/articles');
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const PROGRAM_SITEMAP_PAST_DAYS = 1;
const PROGRAM_SITEMAP_FUTURE_DAYS = 3;
const PROGRAM_SITEMAP_MAX_URLS = 25000;

// Static pages (SEO spec)
const staticPages = [
  '',
  '/en-direct',
  '/demain',
  '/plan-du-site/',
  '/conditions-generales',
  '/politique-cookies',
  '/credits',
  '/actualites',
  '/anniversaire-du-jour',
  '/anniversaires-acteurs',
  '/films',
  '/series',
  '/acteurs'
];

function readEntityRoutes() {
  if (!fs.existsSync(ENTITY_ROUTES_FILE)) {
    return { film: [], series: [], actor: [], indexes: [], updatedAt: null };
  }

  try {
    const data = JSON.parse(fs.readFileSync(ENTITY_ROUTES_FILE, 'utf8'));
    return {
      film: Array.isArray(data?.film) ? data.film : [],
      series: Array.isArray(data?.series) ? data.series : [],
      actor: Array.isArray(data?.actor) ? data.actor : [],
      indexes: Array.isArray(data?.indexes) ? data.indexes : [],
      updatedAt: data?.updatedAt || null,
    };
  } catch (error) {
    console.warn(`⚠️  Failed to read entity routes: ${error.message}`);
    return { film: [], series: [], actor: [], indexes: [], updatedAt: null };
  }
}

function readBirthdayRoutes() {
  const routes = [];

  if (fs.existsSync(BIRTHDAY_CURRENT_FILE)) {
    routes.push('/anniversaire-du-jour');
  }

  if (!fs.existsSync(BIRTHDAY_ARTICLES_DIR)) {
    return routes;
  }

  fs.readdirSync(BIRTHDAY_ARTICLES_DIR)
    .filter((file) => file.endsWith('.json'))
    .forEach((file) => {
      routes.push(`/anniversaire/${file.replace(/\.json$/i, '')}`);
    });

  return Array.from(new Set(routes));
}

function loadEnv() {
  if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_READ_KEY || process.env.VITE_SUPABASE_ANON_KEY)) return;
  const candidates = [
    path.join(ROOT_DIR, 'scripts', '.env'),
    path.join(ROOT_DIR, 'frontend', '.env')
  ];

  candidates.forEach(envPath => {
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key === 'VITE_SUPABASE_URL' && !process.env.SUPABASE_URL) process.env.SUPABASE_URL = value;
      if ((key === 'VITE_SUPABASE_ANON_KEY' || key === 'SUPABASE_READ_KEY') && !process.env.SUPABASE_READ_KEY) process.env.SUPABASE_READ_KEY = value;
      if (!process.env[key]) process.env[key] = value;
    });
  });
}

const getProgramSlug = (title) => {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

const getChannelSlug = (channelId) => {
  const base = String(channelId || '').toLowerCase().trim();
  return base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

async function createSupabaseClient() {
  loadEnv();
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_READ_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function fetchChannels() {
  const supabase = await createSupabaseClient();
  if (!supabase) {
    console.warn('⚠️  SUPABASE_URL or SUPABASE_SERVICE_KEY missing. Skipping channel sitemap.');
    return [];
  }

  const batchSize = 1000;
  let offset = 0;
  let all = [];
  while (true) {
    const { data, error } = await supabase
      .from(process.env.SUPABASE_CHANNELS_TABLE || 'channels_fr')
      .select('channel_id')
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.warn(`⚠️  Supabase channel fetch failed at offset ${offset}: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < batchSize) break;
    offset += batchSize;
  }
  return all;
}

async function fetchPrograms() {
  const supabase = await createSupabaseClient();
  if (!supabase) {
    console.warn('⚠️  SUPABASE_URL or SUPABASE_SERVICE_KEY missing. Skipping program sitemap.');
    return [];
  }

  const toParisDateString = (date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${byType.year}-${byType.month}-${byType.day}`;
  };
  const addDays = (dateString, days) => {
    const dt = new Date(`${dateString}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().split('T')[0];
  };
  const compareDate = (a, b) => a.localeCompare(b);

  const today = toParisDateString(new Date());
  const minDate = addDays(today, -PROGRAM_SITEMAP_PAST_DAYS);
  const maxDate = addDays(today, PROGRAM_SITEMAP_FUTURE_DAYS);
  const batchSize = 1000;
  let all = [];

  let day = minDate;
  while (compareDate(day, maxDate) <= 0) {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from(process.env.SUPABASE_PROGRAMS_TABLE || 'programs_fr')
        .select('title, channel_id, date')
        .eq('date', day)
        .range(offset, offset + batchSize - 1);

      if (error) {
        console.warn(`⚠️  Supabase fetch failed for ${day} offset ${offset}: ${error.message}`);
        break;
      }
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < batchSize) break;
      offset += batchSize;
    }
    day = addDays(day, 1);
  }
  return all;
}

async function generateSitemapStatic() {
  const urls = [];
  const today = new Date().toISOString().split('T')[0];
  const entityRoutes = readEntityRoutes();
  const birthdayRoutes = readBirthdayRoutes();

  staticPages.forEach(page => {
    urls.push({
      loc: `${BASE_URL}${page}`,
      lastmod: today,
      changefreq: 'daily',
      priority: page === '' ? '1.0' : '0.9'
    });
  });

  const channels = await fetchChannels();
  channels.forEach(channel => {
    const isRadio = String(channel.channel_id || '').toLowerCase().includes('radio');
    if (isRadio) return;
    const slug = getChannelSlug(channel.channel_id);
    if (!slug) return;
    urls.push({
      loc: `${BASE_URL}/${slug}`,
      lastmod: today,
      changefreq: 'daily',
      priority: '0.7'
    });
  });

  const entityLastmod = entityRoutes.updatedAt ? String(entityRoutes.updatedAt).split('T')[0] : today;
  entityRoutes.film.forEach((href) => {
    urls.push({
      loc: `${BASE_URL}${href}`,
      lastmod: entityLastmod,
      changefreq: 'weekly',
      priority: '0.7'
    });
  });
  entityRoutes.series.forEach((href) => {
    urls.push({
      loc: `${BASE_URL}${href}`,
      lastmod: entityLastmod,
      changefreq: 'weekly',
      priority: '0.7'
    });
  });
  entityRoutes.actor.forEach((href) => {
    urls.push({
      loc: `${BASE_URL}${href}`,
      lastmod: entityLastmod,
      changefreq: 'monthly',
      priority: '0.6'
    });
  });

  birthdayRoutes.forEach((href) => {
    urls.push({
      loc: `${BASE_URL}${href}`,
      lastmod: today,
      changefreq: href === '/anniversaire-du-jour' ? 'daily' : 'yearly',
      priority: href === '/anniversaire-du-jour' ? '0.8' : '0.7'
    });
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  fs.writeFileSync(OUTPUT_STATIC, xml, 'utf8');
  console.log(`✅ Static sitemap generated: ${OUTPUT_STATIC}`);
  console.log(`   Total URLs: ${urls.length}`);
  return { count: urls.length, lastmod: today };
}

function getHeadTargetSlugs(channels) {
  const available = new Set(
    channels
      .map((channel) => getChannelSlug(channel.channel_id))
      .filter(Boolean)
  );
  const pinned = ['tf1', 'france-2', 'france-3', 'm6', 'arte', 'canal-plus'];
  const rotation = ['france-5', 'franceinfo', 'bfm-tv', 'cstar', 'gulli', '6ter', 'rmc-decouverte', 'rmc-story'];
  const active = pinned.filter((slug) => available.has(slug));

  for (const slug of rotation) {
    if (!available.has(slug) || active.includes(slug)) continue;
    active.push(slug);
    if (active.length >= 10) break;
  }

  return active;
}

async function generateSitemapHead() {
  const today = new Date().toISOString().split('T')[0];
  const urls = [];
  const seen = new Set();
  const add = (pathName, priority, changefreq = 'daily') => {
    const loc = `${BASE_URL}${pathName}`;
    if (seen.has(loc)) return;
    seen.add(loc);
    urls.push({
      loc,
      lastmod: today,
      changefreq,
      priority
    });
  };

  [
    ['', '1.0'],
    ['/en-direct', '0.95'],
    ['/demain', '0.9'],
    ['/film-ce-soir', '0.9'],
    ['/series-ce-soir', '0.85'],
    ['/sport-ce-soir', '0.85'],
    ['/documentaires-ce-soir', '0.8'],
    ['/recommandes', '0.8'],
    ['/actualites', '0.75'],
    ['/films', '0.75'],
    ['/series', '0.75'],
    ['/acteurs', '0.7']
  ].forEach(([pathName, priority]) => add(pathName, priority, 'daily'));

  const channels = await fetchChannels();
  getHeadTargetSlugs(channels).forEach((slug) => {
    add(`/${slug}`, '0.95', 'hourly');
    add(`/ce-soir/${slug}`, '0.9', 'hourly');
    add(`/en-direct/${slug}`, '0.85', 'hourly');
    add(`/demain/${slug}`, '0.85', 'hourly');
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  fs.writeFileSync(OUTPUT_HEAD, xml, 'utf8');
  console.log(`✅ Head sitemap generated: ${OUTPUT_HEAD}`);
  console.log(`   Total head URLs: ${urls.length}`);
  return { count: urls.length, lastmod: today };
}

async function generateHtmlSiteMap() {
  const channels = await fetchChannels();
  const entityRoutes = readEntityRoutes();
  const seen = new Set();
  const channelLinks = [];

  channels.forEach((channel) => {
    const channelId = String(channel.channel_id || '').trim();
    if (!channelId) return;
    const slug = getChannelSlug(channelId);
    if (!slug) return;

    const isRadio = channelId.toLowerCase().includes('radio');
    const candidates = isRadio
      ? [`/radio/${slug}`, `/radio/${slug}/en-direct`, `/radio/${slug}/demain`]
      : [`/${slug}`, `/en-direct/${slug}`, `/ce-soir/${slug}`, `/demain/${slug}`];

    candidates.forEach((href) => {
      if (seen.has(href)) return;
      seen.add(href);
      channelLinks.push(href);
    });
  });

  channelLinks.sort((a, b) => a.localeCompare(b));

  const rootPages = [
    '/',
    '/en-direct',
    '/demain',
    '/plan-du-site/',
    '/recommandes',
    '/recherche',
    '/film-ce-soir',
    '/series-ce-soir',
    '/sport-ce-soir',
    '/documentaires-ce-soir',
    '/divertissement-ce-soir',
    '/infos-ce-soir',
    '/jeunesse-ce-soir',
    '/culture-ce-soir',
    '/films',
    '/series',
    '/acteurs',
    '/actualites',
    '/conditions-generales',
    '/politique-cookies',
    '/credits',
    '/sitemap.xml',
    '/sitemap-static.xml',
    '/sitemap-programmes.xml'
  ];

  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Plan du site - Programme Ce Soir</title>
  <meta name="description" content="Plan du site Programme Ce Soir : accès à toutes les pages chaînes, vues et catégories.">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${BASE_URL}/plan-du-site/">
</head>
<body style="font-family:Inter,Arial,sans-serif;max-width:1200px;margin:0 auto;padding:24px;">
  <h1>Plan du site Programme Ce Soir</h1>
  <p>Accès rapide aux pages principales et aux pages de chaînes.</p>

  <h2>Pages principales</h2>
  <ul>
${rootPages.map((href) => `    <li><a href="${href}">${href}</a></li>`).join('\n')}
  </ul>

  <h2>Pages chaînes</h2>
  <p>Total liens chaînes: ${channelLinks.length}</p>
  <ul>
${channelLinks.map((href) => `    <li><a href="${href}">${href}</a></li>`).join('\n')}
  </ul>

  <h2>Entités</h2>
  <p>Total liens entités: ${entityRoutes.film.length + entityRoutes.series.length + entityRoutes.actor.length}</p>
  <ul>
${[...entityRoutes.film, ...entityRoutes.series, ...entityRoutes.actor].map((href) => `    <li><a href="${href}">${href}</a></li>`).join('\n')}
  </ul>
</body>
</html>`;

  fs.mkdirSync(path.dirname(OUTPUT_HTML_SITEMAP), { recursive: true });
  fs.writeFileSync(OUTPUT_HTML_SITEMAP, html, 'utf8');
  console.log(`✅ HTML sitemap generated: ${OUTPUT_HTML_SITEMAP}`);
  console.log(`   Total channel links: ${channelLinks.length}`);
}

async function generateSitemapPrograms() {
  const programs = await fetchPrograms();
  if (programs.length === 0) return { count: 0, lastmod: null };

  const toParisDateString = (date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${byType.year}-${byType.month}-${byType.day}`;
  };
  const addDays = (dateString, days) => {
    const dt = new Date(`${dateString}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().split('T')[0];
  };
  const today = toParisDateString(new Date());
  const parseDate = (value) => {
    if (!value) return null;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString().split('T')[0];
  };

  const entries = new Map();

  for (const p of programs) {
    const channelId = p.channel_id || '';
    if (String(channelId).toLowerCase().includes('radio')) continue;
    if (!p.title) continue;
    const channelSlug = getChannelSlug(channelId);
    const programSlug = getProgramSlug(p.title);
    if (!channelSlug || !programSlug) continue;
    const loc = `${BASE_URL}/programme/${channelSlug}/${programSlug}`;

    const airingDate = parseDate(p.date);
    const existing = entries.get(loc) || {
      loc,
      nextAiring: null,
      latestPastAiring: null
    };

    if (airingDate) {
      if (airingDate >= today) {
        if (!existing.nextAiring || airingDate < existing.nextAiring) {
          existing.nextAiring = airingDate;
        }
      } else if (!existing.latestPastAiring || airingDate > existing.latestPastAiring) {
        existing.latestPastAiring = airingDate;
      }
    }

    entries.set(loc, existing);
  }

  const urls = Array.from(entries.values()).map((row) => {
    let lastmod = row.latestPastAiring || null;
    if (!lastmod) {
      const daysToAiring = row.nextAiring
        ? Math.floor((new Date(`${row.nextAiring}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000)
        : null;
      if (daysToAiring !== null && daysToAiring <= 1) {
        lastmod = today;
      } else {
        lastmod = addDays(today, -1);
      }
    }

    if (row.nextAiring) {
      const daysToAiring = Math.floor((new Date(`${row.nextAiring}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
      if (daysToAiring > PROGRAM_SITEMAP_FUTURE_DAYS) {
        return null;
      }
      if (daysToAiring <= 0) {
        return {
          loc: row.loc,
          lastmod,
          changefreq: 'daily',
          priority: '1.0',
          sortBucket: 0,
          sortDate: lastmod
        };
      }
      if (daysToAiring === 1) {
        return {
          loc: row.loc,
          lastmod,
          changefreq: 'daily',
          priority: '0.9',
          sortBucket: 1,
          sortDate: lastmod
        };
      }
      if (daysToAiring <= 3) {
        return {
          loc: row.loc,
          lastmod,
          changefreq: 'daily',
          priority: '0.8',
          sortBucket: 2,
          sortDate: lastmod
        };
      }
      if (daysToAiring <= 7) {
        return {
          loc: row.loc,
          lastmod,
          changefreq: 'daily',
          priority: '0.7',
          sortBucket: 3,
          sortDate: lastmod
        };
      }
      return {
        loc: row.loc,
        lastmod,
        changefreq: 'weekly',
        priority: '0.6',
        sortBucket: 4,
        sortDate: lastmod
      };
    }

    const isRecentPast = row.latestPastAiring && row.latestPastAiring >= addDays(today, -PROGRAM_SITEMAP_PAST_DAYS);
    if (!isRecentPast) return null;
    return {
      loc: row.loc,
      lastmod,
      changefreq: 'daily',
      priority: '0.5',
      sortBucket: 5,
      sortDate: lastmod
    };
  }).filter(Boolean);

  urls.sort((a, b) => {
    if (a.sortBucket !== b.sortBucket) return a.sortBucket - b.sortBucket;
    if (a.sortDate !== b.sortDate) return b.sortDate.localeCompare(a.sortDate);
    return a.loc.localeCompare(b.loc);
  });

  if (urls.length > PROGRAM_SITEMAP_MAX_URLS) {
    urls.length = PROGRAM_SITEMAP_MAX_URLS;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  fs.writeFileSync(OUTPUT_PROGRAMS, xml, 'utf8');
  console.log(`✅ Program sitemap generated: ${OUTPUT_PROGRAMS}`);
  console.log(`   Total Program URLs: ${urls.length}`);
  const lastmod = urls.length ? urls.reduce((acc, row) => (row.lastmod > acc ? row.lastmod : acc), urls[0].lastmod) : null;
  return { count: urls.length, lastmod };
}

function generateSitemapIndex({ headLastmod, staticLastmod, programsLastmod, programsCount }) {
  const today = new Date().toISOString().split('T')[0];
  const items = [];

  items.push({
    loc: `${BASE_URL}/sitemap-head.xml`,
    lastmod: headLastmod || today
  });

  items.push({
    loc: `${BASE_URL}/sitemap-static.xml`,
    lastmod: staticLastmod || today
  });

  if (programsCount > 0) {
    items.push({
      loc: `${BASE_URL}/sitemap-programmes.xml`,
      lastmod: programsLastmod || today
    });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items.map(item => `  <sitemap>
    <loc>${item.loc}</loc>
    <lastmod>${item.lastmod}</lastmod>
  </sitemap>`).join('\n')}
</sitemapindex>`;

  fs.writeFileSync(OUTPUT_INDEX, xml, 'utf8');
  console.log(`✅ Sitemap index generated: ${OUTPUT_INDEX}`);
  console.log(`   Total sitemaps: ${items.length}`);
}

// Run
async function run() {
  await generateHtmlSiteMap();
  const headInfo = await generateSitemapHead();
  const staticInfo = await generateSitemapStatic();
  const programsInfo = await generateSitemapPrograms();
  generateSitemapIndex({
    headLastmod: headInfo.lastmod,
    staticLastmod: staticInfo.lastmod,
    programsLastmod: programsInfo.lastmod,
    programsCount: programsInfo.count
  });
}

run().catch(err => {
  console.error('❌ Sitemap generation failed:', err);
  process.exit(1);
});
