#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import {
  HOME_FAQ_DATA,
  SITE_DESCRIPTION,
  SITE_LOGO_URL,
  SITE_NAME,
  SITE_PROFILES,
  SITE_URL,
  buildFaqGraph,
  buildBreadcrumbList,
  buildChannelGraph,
  buildProgramWorkGraph,
  buildSiteGraph,
  getChannelSameAs,
  toAbsoluteUrl,
} from '../src/utils/knowledgeGraph.js';
import { CHAINES } from '../src/data/chaines.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(FRONTEND_DIR, '..');
const DIST_DIR = path.join(FRONTEND_DIR, 'dist');
const DIST_INDEX = path.join(DIST_DIR, 'index.html');
const ENTITIES_DATA_DIR = path.join(FRONTEND_DIR, 'public', 'entities-data');
const ENTITY_ROUTES_FILE = path.join(ENTITIES_DATA_DIR, 'routes.json');
const ENTITY_INDEXES_DIR = path.join(ENTITIES_DATA_DIR, 'indexes');
const BIRTHDAY_DATA_DIR = path.join(FRONTEND_DIR, 'public', 'birthday-data');
const CURRENT_BIRTHDAY_FILE = path.join(BIRTHDAY_DATA_DIR, 'current.json');
const BIRTHDAY_ARCHIVE_FILE = path.join(BIRTHDAY_DATA_DIR, 'archive.json');
const SOCIAL_PERFORMANCE_CACHE_FILE = path.join(FRONTEND_DIR, 'scripts', '.cache', 'social-performance-latest.json');
const SOCIAL_PERFORMANCE_PUBLIC_FILE = path.join(FRONTEND_DIR, 'public', 'search-console', 'social-performance-latest.json');

const CATEGORY_PAGES = {
  '/film-ce-soir': {
    label: 'Films',
    title: 'Films à la TV ce soir - Programme Ce Soir',
    description: 'Tous les films diffusés ce soir à la TV sur la TNT. Horaires, chaînes et synopsis.',
  },
  '/series-ce-soir': {
    label: 'Séries',
    title: 'Séries à la TV ce soir - Programme Ce Soir',
    description: 'Séries diffusées ce soir à la TV sur la TNT. Vos séries préférées en prime time.',
  },
  '/sport-ce-soir': {
    label: 'Sport',
    title: 'Sport à la TV ce soir - Programme Ce Soir',
    description: 'Sport diffusé ce soir à la TV. Tous les événements en direct.',
  },
  '/documentaires-ce-soir': {
    label: 'Documentaires',
    title: 'Documentaires à la TV ce soir - Programme Ce Soir',
    description: 'Documentaires diffusés ce soir à la TV sur la TNT. Découvrez les meilleurs sujets.',
  },
  '/divertissement-ce-soir': {
    label: 'Divertissements',
    title: 'Divertissements à la TV ce soir - Programme Ce Soir',
    description: 'Divertissements diffusés ce soir à la TV. Jeux, variétés et magazines.',
  },
  '/infos-ce-soir': {
    label: 'Info',
    title: 'Info et journaux TV ce soir - Programme Ce Soir',
    description: 'Tous les journaux et émissions d’info diffusés ce soir à la TV.',
  },
  '/jeunesse-ce-soir': {
    label: 'Jeunesse',
    title: 'Programmes jeunesse ce soir - Programme Ce Soir',
    description: 'Programmes jeunesse diffusés ce soir. Dessins animés et émissions famille.',
  },
  '/culture-ce-soir': {
    label: 'Culture',
    title: 'Culture et arts à la TV ce soir - Programme Ce Soir',
    description: 'Culture et arts diffusés ce soir à la TV. Musique, théâtre, documentaires.',
  },
};

const CATEGORY_ROUTE_GENRES = {
  '/film-ce-soir': ['Film', 'Cinéma', 'Téléfilm', 'Movie'],
  '/series-ce-soir': ['Série', 'Séries', 'Serie', 'Fiction', 'Sitcom', 'Soap'],
  '/sport-ce-soir': ['Sport'],
  '/documentaires-ce-soir': ['Documentaire', 'Documentary', 'Découverte'],
  '/divertissement-ce-soir': ['Divertissement', 'Jeu', 'Téléréalité', 'Show', 'Magazine', 'Variétés'],
  '/infos-ce-soir': ['Information', 'Info', 'Journal', 'Actualité', 'Débat'],
  '/jeunesse-ce-soir': ['Jeunesse', 'Enfants', 'Animation', 'Famille'],
  '/culture-ce-soir': ['Culture', 'Musique', 'Théâtre', 'Art', 'Histoire'],
};

const CHANNEL_NUMBER_MAP = {
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
  'franceinfo': 27,
};

const CHANNEL_NAME_MAP = {
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
  'franceinfo:': 27,
};

const normalizeChannelKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const resolveChannelNumber = (rawNumber, channelId, channelName) => {
  const parsed = Number(rawNumber);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;

  const idKey = normalizeChannelKey(channelId);
  if (idKey) {
    for (const [slug, mapped] of Object.entries(CHANNEL_NUMBER_MAP)) {
      if (normalizeChannelKey(slug) === idKey) return mapped;
    }
  }

  const nameKey = normalizeChannelKey(channelName);
  if (nameKey) {
    for (const [name, mapped] of Object.entries(CHANNEL_NAME_MAP)) {
      if (normalizeChannelKey(name) === nameKey) return mapped;
    }
  }

  return 0;
};

const HOME_BOOTSTRAP_CHANNEL_LIMIT = 60;
const HOME_BOOTSTRAP_PROGRAMS_PER_CHANNEL = 3;
const CHANNEL_BOOTSTRAP_PROGRAM_LIMIT = 64;
const PROGRAM_BOOTSTRAP_PROGRAM_LIMIT = 48;
const CHANNEL_FALLBACK_PROGRAM_LIMIT = 12;
const CHANNEL_GRAPH_PROGRAM_LIMIT = 8;

const HOME_PAGES = {
  '/': {
    title: 'Programme TV TNT ce soir : toutes les chaînes - Programme Ce Soir',
    description: 'Découvrez le programme TV TNT de ce soir : toutes les chaînes en un coup d’œil, horaires détaillés, films, séries et émissions.',
    heading: 'Programme TV TNT ce soir',
  },
  '/en-direct': {
    title: 'Programme TNT en direct : ce qui passe à la TV - Programme Ce Soir',
    description: 'Regardez en un coup d’œil ce qui passe en ce moment à la TV sur toutes les chaînes TNT : films, séries, magazines et émissions en direct.',
    heading: 'Programme TNT en direct',
  },
  '/demain': {
    title: 'Programme TNT de demain : toutes les chaînes TV - Programme Ce Soir',
    description: 'Consultez le programme TV TNT de demain : horaires détaillés de toutes les chaînes, films, séries, documentaires et divertissements.',
    heading: 'Programme TNT de demain',
  },
};

const NEWS_ROUTE = '/actualites';
const LEGACY_NEWS_ROUTE = '/notizie';
const NEWS_PAGE_TITLE = 'Actualités TV et histoires éditoriales - Programme Ce Soir';
const NEWS_PAGE_DESCRIPTION = 'Les actualités éditoriales de Programme Ce Soir : anniversaire du jour, publications Bluesky et pages TV à suivre.';

const HEAD_FALLBACK_CHANNEL_LINKS = [
  { href: '/tf1', label: 'Programme TF1 ce soir' },
  { href: '/france-2', label: 'Programme France 2 ce soir' },
  { href: '/france-3', label: 'Programme France 3 ce soir' },
  { href: '/m6', label: 'Programme M6 ce soir' },
  { href: '/arte', label: 'Programme ARTE ce soir' },
  { href: '/tmc', label: 'Programme TMC ce soir' },
];

function filterActiveEntityAirings(airings) {
  if (!Array.isArray(airings) || airings.length === 0) {
    return [];
  }

  const nowTs = Date.now();
  return airings.filter((airing) => {
    const endTs = Date.parse(airing?.endTime || '');
    const startTs = Date.parse(airing?.startTime || '');

    if (!Number.isNaN(endTs)) {
      return endTs >= nowTs;
    }

    if (!Number.isNaN(startTs)) {
      return startTs >= nowTs;
    }

    return false;
  });
}

function loadEnv() {
  if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_READ_KEY || process.env.VITE_SUPABASE_ANON_KEY)) {
    return;
  }

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
      if (key === 'VITE_SUPABASE_URL' && !process.env.SUPABASE_URL) process.env.SUPABASE_URL = value;
      if ((key === 'VITE_SUPABASE_ANON_KEY' || key === 'SUPABASE_READ_KEY') && !process.env.SUPABASE_READ_KEY) process.env.SUPABASE_READ_KEY = value;
      if (!process.env[key]) process.env[key] = value;
    });
  });
}

function createSupabaseClient() {
  loadEnv();
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_READ_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials for prerender SEO generation');
  }
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const normalizeSlug = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const CHANNEL_SLUG_ALIASES = {
  canal: 'canal-plus',
  bfmtv: 'bfm-tv',
  'france-info': 'franceinfo',
};

const getChannelSlug = (channelId) => {
  const normalized = normalizeSlug(channelId);
  return CHANNEL_SLUG_ALIASES[normalized] || normalized;
};
const getProgramSlug = (title, storedSlug) => normalizeSlug(storedSlug || title);

const getChannelUrl = (channelSlug, viewMode = 'aujourdhui') => {
  if (viewMode === 'maintenant') return `/en-direct/${channelSlug}`;
  if (viewMode === 'ce-soir') return `/ce-soir/${channelSlug}`;
  if (viewMode === 'demain') return `/demain/${channelSlug}`;
  return `/${channelSlug}`;
};

const toParisDateString = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
};

const addDays = (dateString, days) => {
  const dt = new Date(`${dateString}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
};

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeJsonForHtml = (value) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

const getTimeRanges = () => {
  const now = new Date();

  const liveStart = new Date(now.getTime() - (2 * 60 * 60 * 1000));
  const liveEnd = new Date(now.getTime() + (4 * 60 * 60 * 1000));
  const tonightStart = new Date(now);
  tonightStart.setHours(18, 0, 0, 0);
  const tonightEnd = new Date(tonightStart);
  tonightEnd.setDate(tonightEnd.getDate() + 1);
  tonightEnd.setHours(2, 0, 0, 0);
  const tomorrowStart = new Date(now);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setHours(0, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setHours(23, 59, 59, 999);

  return { now, liveStart, liveEnd, tonightStart, tonightEnd, tomorrowStart, tomorrowEnd };
};

const matchesCategoryRoute = (program, routePath) => {
  const genres = CATEGORY_ROUTE_GENRES[routePath];
  if (!genres || genres.length === 0) return true;
  const normalizeGenre = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  const programGenre = normalizeGenre(program.genre);
  if (!programGenre) return false;
  return genres.some((genre) => {
    const normalizedGenre = normalizeGenre(genre);
    if (!normalizedGenre) return false;
    return programGenre.includes(normalizedGenre) || normalizedGenre === programGenre;
  });
};

const buildBootstrapProgramRow = (program, channel, includeDescription = false) => ({
  id: String(program.id || `${program.channel_id}-${program.start_time}-${program.title}`),
  channel_id: String(program.channel_id || ''),
  title: String(program.title || ''),
  ...(includeDescription ? { description: String(program.description || '') } : {}),
  start_time: String(program.start_time || ''),
  end_time: String(program.end_time || ''),
  genre: String(program.genre || ''),
  url: getBootstrapProgramUrl(program, channel),
  poster_url: program?.poster_url || null,
  channels: {
    name: String(channel?.name || program.channel_id || ''),
    logo_url: channel?.logo_url || null,
    channel_number: resolveChannelNumber(channel?.channel_number, channel?.channel_id, channel?.name) || null,
  },
});

const mapChannelToAppShape = (channel) => ({
  id: String(channel?.channel_id || ''),
  name: String(channel?.name || channel?.channel_id || ''),
  number: resolveChannelNumber(channel?.channel_number, channel?.channel_id, channel?.name),
  logo: channel?.logo_url || null,
  type: 'Generalista',
  programs: [],
});

const mapProgramToAppShape = (program) => ({
  id: String(program?.id || ''),
  title: String(program?.title || ''),
  startTime: String(program?.start_time || ''),
  endTime: String(program?.end_time || ''),
  category: String(program?.genre || 'Général'),
  description: String(program?.description || ''),
  isLive: false,
});

const getBootstrapProgramUrl = (program, channel) => {
  const channelSlug = getChannelSlug(channel?.channel_id || program?.channel_id || '');
  const programSlug = getProgramSlug(program?.title || '', program?.slug || '');
  return `/programme/${channelSlug}/${programSlug}`;
};

function buildHomeBootstrapPayload(routePath, programs, channelMap) {
  const { now, liveStart, liveEnd, tonightStart, tonightEnd, tomorrowStart, tomorrowEnd } = getTimeRanges();
  const grouped = new Map();

  programs.forEach((program) => {
    const channel = channelMap.get(String(program.channel_id));
    if (!channel) return;

    const start = new Date(program.start_time).getTime();
    const end = new Date(program.end_time).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;

    let inRoute = false;
    if (routePath === '/en-direct') {
      inRoute = start < liveEnd.getTime() && end > liveStart.getTime();
    } else if (routePath === '/demain') {
      inRoute = start >= tomorrowStart.getTime() && start <= tomorrowEnd.getTime();
    } else {
      inRoute = start >= tonightStart.getTime() && start <= tonightEnd.getTime();
    }

    if (!inRoute) return;
    if (routePath in CATEGORY_ROUTE_GENRES && !matchesCategoryRoute(program, routePath)) return;

    const channelId = String(program.channel_id);
    if (!grouped.has(channelId)) grouped.set(channelId, []);
    grouped.get(channelId).push(program);
  });

  const selectedPrograms = [];
  const sortedChannels = Array.from(grouped.keys())
    .map((channelId) => channelMap.get(channelId))
    .filter(Boolean)
    .sort((a, b) => {
      const numberA = resolveChannelNumber(a.channel_number, a.channel_id, a.name) || 9999;
      const numberB = resolveChannelNumber(b.channel_number, b.channel_id, b.name) || 9999;
      if (numberA !== numberB) return numberA - numberB;
      return String(a.name || '').localeCompare(String(b.name || ''), 'fr');
    })
    .slice(0, HOME_BOOTSTRAP_CHANNEL_LIMIT);

  sortedChannels.forEach((channel) => {
    const items = (grouped.get(String(channel.channel_id)) || [])
      .slice()
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .slice(0, HOME_BOOTSTRAP_PROGRAMS_PER_CHANNEL);

    items.forEach((program) => {
      selectedPrograms.push(buildBootstrapProgramRow(program, channel, false));
    });
  });

  const category = routePath in CATEGORY_ROUTE_GENRES
    ? CATEGORY_PAGES[routePath]?.label === 'Séries' ? 'Series' : CATEGORY_PAGES[routePath]?.label
    : undefined;
  const normalizedCategory = category === 'Divertissements' ? 'Divertissement' : category;

  return {
    routePath,
    pageState: { type: 'home', ...(normalizedCategory ? { category: normalizedCategory } : {}) },
    viewMode: routePath === '/en-direct' ? 'now' : routePath === '/demain' ? 'tomorrow' : 'tonight',
    filter: normalizedCategory || 'Tous',
    programs: selectedPrograms,
    generatedAt: now.toISOString(),
  };
}

function getChannelBootstrapSections(channel, routePath, programs) {
  const routeConfigs = [
    { key: 'aujourdhui', routePath, label: 'Aujourd’hui' },
    { key: 'maintenant', routePath: `/en-direct/${channel.slug}`, label: 'En direct' },
    { key: 'ce-soir', routePath: `/ce-soir/${channel.slug}`, label: 'Ce soir' },
    { key: 'demain', routePath: `/demain/${channel.slug}`, label: 'Demain' },
  ];

  return routeConfigs.map((config) => ({
    ...config,
    payload: buildChannelBootstrapPayload(config.routePath, channel, config.key, programs),
  }));
}

function buildChannelItemListGraph(channel, routePath, programs) {
  const listItems = (programs || []).slice(0, CHANNEL_GRAPH_PROGRAM_LIMIT).map((program, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    item: { '@id': `${SITE_URL}${program.url}#broadcast` },
  }));

  if (!listItems.length) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${SITE_URL}${routePath}#programme-list`,
    name: `Programme TV ${channel.name} ce soir`,
    itemListElement: listItems,
  };
}

function getListingGraphMetadata(routePath) {
  if (routePath in CATEGORY_PAGES) {
    const config = CATEGORY_PAGES[routePath];
    return {
      name: config.title,
      description: config.description,
      about: config.label,
    };
  }

  if (routePath === '/en-direct') {
    return {
      name: 'Programme TNT en direct',
      description: 'Liste des programmes TNT actuellement diffusés ou imminents.',
      about: 'Programme TV en direct',
    };
  }

  if (routePath === '/demain') {
    return {
      name: 'Programme TNT de demain',
      description: 'Liste des programmes TNT diffusés demain sur les chaînes françaises.',
      about: 'Programme TV de demain',
    };
  }

  return {
    name: 'Programme TNT ce soir',
    description: 'Liste des programmes TNT diffusés ce soir sur les chaînes françaises.',
    about: 'Programme TV ce soir',
  };
}

function buildHomeListingGraphs(routePath, bootstrapPayload, channelMap) {
  const programs = Array.isArray(bootstrapPayload?.programs) ? bootstrapPayload.programs : [];
  if (!programs.length) return [];

  const { name, description, about } = getListingGraphMetadata(routePath);
  const canonicalUrl = `${SITE_URL}${routePath === '/' ? '' : routePath}`;
  const uniquePrograms = [];
  const seen = new Set();

  programs.forEach((program) => {
    const key = String(program?.url || '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    uniquePrograms.push(program);
  });

  const limitedPrograms = uniquePrograms.slice(0, routePath in CATEGORY_PAGES ? 40 : 30);
  const itemListElement = [];
  const graphs = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${canonicalUrl}#collectionpage`,
      name,
      description,
      url: canonicalUrl,
      inLanguage: 'fr-FR',
      isPartOf: { '@id': `${SITE_URL}/#website` },
      mainEntity: { '@id': `${canonicalUrl}#program-list` },
      about: {
        '@type': 'Thing',
        name: about,
      },
    },
  ];

  limitedPrograms.forEach((program, index) => {
    const channelId = String(program?.channel_id || '');
    const channel = channelMap.get(channelId);
    const channelSlug = getChannelSlug(channelId);
    const channelUrl = getChannelUrl(channelSlug, 'aujourdhui');
    const fullUrl = `${SITE_URL}${program.url}`;
    const image = program.poster_url || program.channels?.logo_url || channel?.logo_url || SITE_LOGO_URL;

    itemListElement.push({
      '@type': 'ListItem',
      position: index + 1,
      item: { '@id': `${fullUrl}#broadcast` },
    });
    graphs.push(...buildProgramWorkGraph({
      siteUrl: SITE_URL,
      fullUrl,
      title: program.title,
      description: program.description || `${program.title} sur ${program.channels?.name || channel?.name || channelId}`,
      image,
      category: program.genre,
      startTime: program.start_time,
      endTime: program.end_time,
      channelName: program.channels?.name || channel?.name || channelId,
      channelUrl,
      channelSameAs: getChannelSameAs(channelId, program.channels?.name || channel?.name),
    }));
  });

  if (itemListElement.length) {
    graphs.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      '@id': `${canonicalUrl}#program-list`,
      name,
      description,
      numberOfItems: itemListElement.length,
      itemListElement,
    });
  }

  return graphs;
}

function buildChannelBootstrapPayload(routePath, channel, viewMode, programs) {
  const { now, liveEnd, tonightStart, tonightEnd, tomorrowStart, tomorrowEnd } = getTimeRanges();
  const channelPrograms = programs
    .filter((program) => String(program.channel_id) === String(channel.channel_id))
    .filter((program) => {
      const start = new Date(program.start_time).getTime();
      const end = new Date(program.end_time).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end)) return false;

      if (viewMode === 'maintenant') {
        return end >= now.getTime() && start <= liveEnd.getTime();
      }
      if (viewMode === 'ce-soir') {
        return start >= tonightStart.getTime() && start <= tonightEnd.getTime();
      }
      if (viewMode === 'demain') {
        return start >= tomorrowStart.getTime() && start <= tomorrowEnd.getTime();
      }
      return program.date === toParisDateString(now);
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(0, CHANNEL_BOOTSTRAP_PROGRAM_LIMIT)
    .map((program) => buildBootstrapProgramRow(program, channel, true));

  return {
    routePath,
    pageState: {
      type: 'channel',
      channelId: String(channel.channel_id),
      subView: viewMode === 'maintenant' ? 'now' : viewMode === 'demain' ? 'tomorrow' : 'tonight',
      channelViewMode: viewMode,
    },
    programs: channelPrograms,
    generatedAt: now.toISOString(),
  };
}

function buildProgramBootstrapPayload(routePath, program, channel, programSlug, channelSlug, programs) {
  const dayPrograms = programs
    .filter((candidate) => String(candidate.channel_id) === String(channel.channel_id) && candidate.date === program.date)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  const selectedIndex = dayPrograms.findIndex((candidate) => String(candidate.id) === String(program.id));
  const windowStart = selectedIndex > -1
    ? Math.max(0, selectedIndex - Math.floor(PROGRAM_BOOTSTRAP_PROGRAM_LIMIT / 2))
    : 0;
  const channelPrograms = dayPrograms
    .slice(windowStart, windowStart + PROGRAM_BOOTSTRAP_PROGRAM_LIMIT)
    .map((candidate) => buildBootstrapProgramRow(candidate, channel, true));

  return {
    routePath,
    pageState: {
      type: 'program',
      channelId: String(channel.channel_id),
      programId: String(program.id || ''),
      programDate: program.date || undefined,
      channelSlug,
      programSlug,
    },
    programs: channelPrograms,
    programFallback: {
      channel: mapChannelToAppShape(channel),
      program: mapProgramToAppShape(program),
    },
  };
}

async function fetchChannels(supabase) {
  const channelsTable = process.env.SUPABASE_CHANNELS_TABLE || 'channels_fr';
  const batchSize = 1000;
  let offset = 0;
  const all = [];

  while (true) {
    const { data, error } = await supabase
      .from(channelsTable)
      .select('channel_id, name, logo_url, channel_number')
      .range(offset, offset + batchSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < batchSize) break;
    offset += batchSize;
  }

  return all;
}

async function fetchPrograms(supabase) {
  const programsTable = process.env.SUPABASE_PROGRAMS_TABLE || 'programs_fr';
  const today = toParisDateString(new Date());
  const minDate = addDays(today, -10);
  const maxDate = addDays(today, 10);
  const batchSize = 1000;
  const all = [];

  let day = minDate;
  while (day <= maxDate) {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from(programsTable)
        .select('id, channel_id, title, slug, date, description, genre, start_time, end_time, poster_url')
        .eq('date', day)
        .range(offset, offset + batchSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < batchSize) break;
      offset += batchSize;
    }
    day = addDays(day, 1);
  }

  return all;
}

function chooseBestProgram(candidates) {
  const now = Date.now();
  const withTimes = candidates
    .filter((item) => item.start_time && item.end_time)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  const live = withTimes.find((item) => {
    const start = new Date(item.start_time).getTime();
    const end = new Date(item.end_time).getTime();
    return now >= start && now <= end;
  });
  if (live) return live;

  const upcoming = withTimes.find((item) => new Date(item.start_time).getTime() >= now);
  if (upcoming) return upcoming;

  return withTimes.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())[0] || candidates[0];
}

function formatDateTime(dateTime) {
  if (!dateTime) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(new Date(dateTime));
}

function formatBirthDate(birthDate) {
  if (!birthDate) return '';
  const parsed = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return birthDate;
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(parsed);
}

function injectHtml(template, { title, description, canonicalUrl, robots = 'index,follow', jsonLdScripts = [], fallbackHtml = '', extraHead = '', bootstrapPayload = null, imageUrl = SITE_LOGO_URL }) {
  const absoluteImageUrl = toAbsoluteUrl(imageUrl, SITE_URL) || SITE_LOGO_URL;
  let html = template
    .replace(/\s*<script type="application\/ld\+json" data-seo="[^"]*">[\s\S]*?<\/script>/g, '')
    .replace(/\s*<script id="app-bootstrap-data" type="application\/json">[\s\S]*?<\/script>/g, '')
    .replace(/\s*<link rel="canonical" href="[^"]*">\s*/g, '\n')
    .replace(/\s*<meta name="author" content="[^"]*">\s*/g, '\n')
    .replace(/\s*<meta name="publisher" content="[^"]*">\s*/g, '\n')
    .replace(/\s*<meta property="og:[^"]+" content="[^"]*">\s*/g, '\n')
    .replace(/\s*<meta name="twitter:[^"]+" content="[^"]*">\s*/g, '\n');
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(description)}">`);
  html = html.replace(/<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${escapeHtml(robots)}">`);
  html = html.replace(
    /<main id="crawler-fallback"[\s\S]*?<\/main>/,
    `<main id="crawler-fallback" style="max-width:1200px;margin:0 auto;padding:24px;font-family:Inter,Arial,sans-serif;">${fallbackHtml}</main>`
  );

  if (jsonLdScripts.length > 0) {
    html = html.replace('<head>', `<head>\n  ${jsonLdScripts.join('\n  ')}`);
  }

  const headInsert = [
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
    `<meta name="author" content="Programme Ce Soir">`,
    `<meta name="publisher" content="Programme Ce Soir">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="fr_FR">`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:image" content="${escapeHtml(absoluteImageUrl)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(absoluteImageUrl)}">`,
    bootstrapPayload
      ? `<script id="app-bootstrap-data" type="application/json">${escapeJsonForHtml(bootstrapPayload)}</script>`
      : '',
    extraHead,
  ].filter(Boolean).join('\n  ');

  html = html.replace('</head>', `  ${headInsert}\n</head>`);
  return html;
}

function makeJsonLdScripts(items, attrName, attrValue) {
  return items.map((item) =>
    `<script type="application/ld+json" ${attrName}="${attrValue}">${JSON.stringify(item)}</script>`
  );
}

function writePrerenderHtml(routePath, html) {
  if (routePath === '/') {
    fs.writeFileSync(DIST_INDEX, html, 'utf8');
    return;
  }

  const relativePath = routePath.replace(/^\//, '');
  const filePath = path.join(DIST_DIR, `${relativePath}.html`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, html, 'utf8');

  if (
    routePath === '/en-direct'
    || routePath === '/demain'
    || routePath === NEWS_ROUTE
    || routePath === LEGACY_NEWS_ROUTE
  ) {
    const directoryIndexPath = path.join(DIST_DIR, relativePath, 'index.html');
    fs.mkdirSync(path.dirname(directoryIndexPath), { recursive: true });
    fs.writeFileSync(directoryIndexPath, html, 'utf8');
  }
}

function buildHomeFallback(routePath) {
  const config = HOME_PAGES[routePath];
  const faqBlock = routePath === '/'
    ? `
      <section style="margin:24px 0 0;">
        <h2 style="font-size:1.5rem;margin:0 0 12px;">Questions fréquentes</h2>
        <div style="display:grid;gap:12px;">
          ${HOME_FAQ_DATA.map(({ q, a }) => `
            <details style="border:1px solid #cbd5e1;border-radius:16px;padding:14px 16px;background:#f8fafc;">
              <summary style="font-weight:700;cursor:pointer;">${escapeHtml(q)}</summary>
              <p style="margin:12px 0 0;line-height:1.7;">${escapeHtml(a)}</p>
            </details>
          `).join('\n')}
        </div>
      </section>
    `
    : '';
  return `
    <h1 style="font-size:2rem;line-height:1.2;margin:0 0 12px;">${escapeHtml(config.heading)}</h1>
    <p style="margin:0 0 16px;">${escapeHtml(config.description)}</p>
    <h2 style="font-size:1.3rem;margin:0 0 12px;">Pages head prioritaires</h2>
    <ul style="margin:0 0 20px;padding-left:18px;">
      <li><a href="/en-direct">Programme en direct</a></li>
      <li><a href="/film-ce-soir">Films ce soir</a></li>
      <li><a href="/sport-ce-soir">Sport ce soir</a></li>
      <li><a href="/demain">Programme TV demain</a></li>
      <li><a href="/">Programme TV ce soir</a></li>
      <li><a href="/series-ce-soir">Séries ce soir</a></li>
      <li><a href="/documentaires-ce-soir">Documentaires ce soir</a></li>
      <li><a href="/infos-ce-soir">Info ce soir</a></li>
      <li><a href="/recherche">Recherche programmes</a></li>
      <li><a href="/credits">Crédits</a></li>
    </ul>
    <h2 style="font-size:1.3rem;margin:0 0 12px;">Chaînes prioritaires</h2>
    <ul style="margin:0;padding-left:18px;">
      ${HEAD_FALLBACK_CHANNEL_LINKS.map((link) => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`).join('\n')}
    </ul>
    ${faqBlock}
  `;
}

function buildCategoryFallback(routePath) {
  const category = CATEGORY_PAGES[routePath];
  return `
    <h1 style="font-size:2rem;line-height:1.2;margin:0 0 12px;">${escapeHtml(category.title)}</h1>
    <p style="margin:0 0 16px;">${escapeHtml(category.description)}</p>
    <p style="margin:0 0 16px;">Retrouvez les chaînes, horaires et fiches programme de la catégorie ${escapeHtml(category.label.toLowerCase())}.</p>
    <h2 style="font-size:1.3rem;margin:0 0 12px;">Explorer les pages head</h2>
    <ul style="margin:0 0 20px;padding-left:18px;">
      <li><a href="/en-direct">Programme en direct</a></li>
      <li><a href="/film-ce-soir">Films ce soir</a></li>
      <li><a href="/sport-ce-soir">Sport ce soir</a></li>
      <li><a href="/demain">Programme de demain</a></li>
      <li><a href="/">Accueil</a></li>
      <li><a href="/series-ce-soir">Séries ce soir</a></li>
      <li><a href="/documentaires-ce-soir">Documentaires ce soir</a></li>
      <li><a href="/infos-ce-soir">Info ce soir</a></li>
    </ul>
    <h2 style="font-size:1.3rem;margin:0 0 12px;">Chaînes prioritaires</h2>
    <ul style="margin:0;padding-left:18px;">
      ${HEAD_FALLBACK_CHANNEL_LINKS.map((link) => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`).join('\n')}
    </ul>
  `;
}

function buildCreditsFallback() {
  return `
    <h1 style="font-size:2rem;line-height:1.2;margin:0 0 12px;">Crédits</h1>
    <p style="margin:0 0 16px;">Profils et références de Programme Ce Soir visibles avant hydration.</p>
    <ul style="margin:0;padding-left:18px;">
      ${SITE_PROFILES.map((profile) => `<li><a href="${escapeHtml(profile.url)}" rel="${escapeHtml(profile.rel)}">${escapeHtml(profile.label)}</a></li>`).join('\n')}
    </ul>
  `;
}

function buildAdminFallback() {
  return `
    <h1 style="font-size:2rem;line-height:1.2;margin:0 0 12px;">Admin monitoring</h1>
    <p style="margin:0 0 16px;">Console interne de contrôle: URL Inspection, pipeline importer, performance sociale et usage Supabase.</p>
    <p style="margin:0 0 16px;">Connexion requise côté application.</p>
    <ul style="margin:0;padding-left:18px;">
      <li><a href="/search-console/import-pipeline-latest.json">Rapport pipeline importer</a></li>
      <li><a href="/search-console/url-inspection-latest.json">Rapport URL Inspection</a></li>
      <li><a href="/search-console/social-performance-latest.json">Rapport social</a></li>
      <li><a href="/search-console/supabase-usage-latest.json">Rapport Supabase</a></li>
    </ul>
  `;
}

function buildBirthdayFallback(payload) {
  const actorUrl = `/acteur/${payload.selectedSlug}`;
  const airings = filterActiveEntityAirings(payload.upcomingAirings || []).slice(0, 8);
  return `
    <h1 style="font-size:2rem;line-height:1.2;margin:0 0 12px;">${escapeHtml(payload.title)}</h1>
    <p style="margin:0 0 16px;">${escapeHtml(payload.metaDescription || payload.excerpt || '')}</p>
    <p style="margin:0 0 16px;"><a href="${escapeHtml(actorUrl)}">Voir la fiche acteur de ${escapeHtml(payload.selectedActor)}</a></p>
    ${airings.length ? `
      <h2 style="font-size:1.3rem;margin:0 0 12px;">À voir à la télévision</h2>
      <ul style="margin:0;padding-left:18px;">
        ${airings.map((airing) => `<li><a href="${escapeHtml(airing.programUrl)}">${escapeHtml(airing.title)}</a> - ${escapeHtml(formatDateTime(airing.startTime))}</li>`).join('\n')}
      </ul>
    ` : ''}
  `;
}

function getBirthdayPageTitle(payload) {
  if (!payload?.selectedActor) return 'Anniversaire acteur - Programme Ce Soir';
  return `Anniversaire de ${payload.selectedActor} - Fêtez-le avec les programmes à la TV`;
}

function buildBirthdayArchiveFallback(payload) {
  const current = payload?.current;
  const todayItems = current?.exactMatchItems || [];
  const pastArticles = payload?.pastArticles || [];

  return `
    <h1 style="font-size:2rem;line-height:1.2;margin:0 0 12px;">Anniversaires acteurs : portraits et programmes TV</h1>
    <p style="margin:0 0 16px;">Retrouvez le portrait anniversaire du jour, les acteurs qui fêtent leur anniversaire aujourd'hui et les portraits passés archivés.</p>
    ${current ? `
      <h2 style="font-size:1.3rem;margin:24px 0 12px;">Aujourd'hui</h2>
      <p style="margin:0 0 16px;"><a href="/anniversaire-du-jour">Lire le portrait du jour consacré à ${escapeHtml(current.selectedActor)}</a></p>
      <ul style="margin:0 0 24px;padding-left:18px;">
        ${todayItems.map((item) => `<li><a href="/acteur/${escapeHtml(item.slug)}">${escapeHtml(item.name)}</a>${item.age ? ` - ${escapeHtml(String(item.age))} ans` : ''}</li>`).join('\n')}
      </ul>
    ` : ''}
    ${pastArticles.length ? `
      <h2 style="font-size:1.3rem;margin:24px 0 12px;">Archives</h2>
      <ul style="margin:0;padding-left:18px;">
        ${pastArticles.slice(0, 24).map((item) => `<li>${escapeHtml(item.publishedDate || '')} - <a href="/anniversaire/${escapeHtml(item.articleSlug)}">${escapeHtml(item.selectedActor || item.title || 'Portrait anniversaire')}</a></li>`).join('\n')}
      </ul>
    ` : ''}
  `;
}

function cleanNewsText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function extractInternalNewsUrl(value) {
  const matches = String(value || '').match(/https?:\/\/[^\s]+/g) || [];
  const internal = matches.find((url) => url.includes('programmecesoir.fr'));
  if (!internal) return null;
  try {
    const parsed = new URL(internal);
    if (parsed.pathname.includes('…') || parsed.pathname.includes('%E2%80%A6')) return null;
    return `${parsed.pathname}${parsed.search || ''}`;
  } catch {
    return null;
  }
}

function buildNewsPayload(currentBirthday, socialReport) {
  const leadStory = currentBirthday?.ok === true
    ? {
        id: `birthday-${currentBirthday.articleSlug}`,
        kind: 'birthday',
        title: currentBirthday.title,
        excerpt: currentBirthday.excerpt || currentBirthday.metaDescription || '',
        url: '/anniversaire-du-jour',
        imageUrl: currentBirthday.imageUrl || currentBirthday.actorImageUrl || SITE_LOGO_URL,
        imageAlt: currentBirthday.imageAlt || currentBirthday.selectedActor || 'Anniversaire du jour',
        eyebrow: currentBirthday.mode === 'exact' ? 'Anniversaire du jour' : 'Prochain anniversaire',
        sourceLabel: 'Rédaction Programme Ce Soir',
        publishedAt: currentBirthday.publishedDate || null,
        ctaLabel: "Lire l'article",
      }
    : null;

  const socialStories = ((socialReport?.posts) || [])
    .filter((row) => row.platform === 'bluesky' && row.status === 'success' && cleanNewsText(row.postText || ''))
    .slice(0, 8)
    .map((row, index) => {
      const textWithoutUrls = cleanNewsText(String(row.postText || '').replace(/https?:\/\/[^\s]+/g, ' '));
      const textWithoutHashtags = cleanNewsText(textWithoutUrls.replace(/(^|\s)#[^\s]+/g, ' '));
      const firstSentence = (textWithoutHashtags.split(/(?<=[.!?])\s+/)[0] || textWithoutHashtags || 'Publication Bluesky').trim();
      const internalUrl = extractInternalNewsUrl(row.postText || '') || extractInternalNewsUrl(row.postUrl || '') || NEWS_ROUTE;
      const eyebrow = row.postType === 'post5'
        ? 'Film conseillé'
        : row.postType === 'post6'
          ? 'Sport conseillé'
          : 'Bluesky';
      return {
        id: `social-${row.postType || index}-${row.postDate || row.createdAt || index}`,
        kind: 'social',
        title: firstSentence.slice(0, 96),
        excerpt: textWithoutHashtags.slice(0, 220),
        url: internalUrl,
        externalUrl: row.postUrl || null,
        imageUrl: `${SITE_URL}/static/img/programmecesoir-social.jpg`,
        imageAlt: 'Publication Bluesky Programme Ce Soir',
        eyebrow,
        sourceLabel: 'Bluesky',
        publishedAt: row.createdAt || row.postDate || null,
        ctaLabel: internalUrl === NEWS_ROUTE ? 'Voir la publication' : 'Voir la page liée',
        metrics: row.metrics
          ? {
              likes: row.metrics.likes,
              reposts: row.metrics.reposts,
              replies: row.metrics.replies,
              quotes: row.metrics.quotes,
            }
          : undefined,
        };
    });
  const seen = new Set();
  const uniqueStories = socialStories.filter((story) => {
    const key = `${story.url}|${String(story.title || '').toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    ok: true,
    generatedAt: socialReport?.generatedAt || new Date().toISOString(),
    leadStory,
    stories: uniqueStories,
    birthdayArticle: currentBirthday?.ok === true ? currentBirthday : null,
  };
}

function buildNewsFallback(payload) {
  const lead = payload?.leadStory;
  const stories = Array.isArray(payload?.stories) ? payload.stories : [];
  return `
    <h1 style="font-size:2rem;line-height:1.2;margin:0 0 12px;">Actualités TV et angles éditoriaux</h1>
    <p style="margin:0 0 16px;">Une page magazine qui agrège le portrait anniversaire du jour et les dernières publications éditoriales publiées sur Bluesky.</p>
    ${lead ? `
      <section style="margin:24px 0;padding:24px;border:1px solid #e2e8f0;border-radius:24px;background:linear-gradient(135deg,#fff7ed 0%,#ffffff 100%);">
        <p style="margin:0 0 8px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.24em;color:#be123c;">${escapeHtml(lead.eyebrow)}</p>
        <h2 style="font-size:2rem;line-height:1.15;margin:0 0 12px;"><a href="${escapeHtml(lead.url)}">${escapeHtml(lead.title)}</a></h2>
        <p style="margin:0 0 16px;line-height:1.8;">${escapeHtml(lead.excerpt)}</p>
        <p style="margin:0;"><a href="${escapeHtml(lead.url)}">${escapeHtml(lead.ctaLabel || 'Lire')}</a></p>
      </section>
    ` : ''}
    <h2 style="font-size:1.3rem;margin:24px 0 12px;">Dernières publications</h2>
    <ul style="margin:0;padding-left:18px;">
      ${stories.length ? stories.map((story) => `<li><a href="${escapeHtml(story.url)}">${escapeHtml(story.title)}</a>${story.externalUrl ? ` - <a href="${escapeHtml(story.externalUrl)}">Bluesky</a>` : ''}</li>`).join('\n') : '<li>Aucune publication disponible.</li>'}
    </ul>
  `;
}

function buildChannelFallback(channelName, description, channelSlug) {
  const sectionsArg = arguments[3];
  const sections = Array.isArray(sectionsArg) ? sectionsArg : [];
  const activeSection = sections.find((section) => section.key === 'aujourdhui') || sections[0];
  const activePrograms = activeSection?.payload?.programs || [];
  const topPrograms = activePrograms.slice(0, CHANNEL_FALLBACK_PROGRAM_LIMIT);
  const liveProgram = sections.find((section) => section.key === 'maintenant')?.payload?.programs?.[0] || null;
  const tonightProgram = sections.find((section) => section.key === 'ce-soir')?.payload?.programs?.[0] || null;
  const tomorrowProgram = sections.find((section) => section.key === 'demain')?.payload?.programs?.[0] || null;

  const highlightBlock = (label, program) => {
    if (!program) return '';
    return `<li><strong>${escapeHtml(label)} :</strong> <a href="${escapeHtml(program.url || '#')}">${escapeHtml(program.title)}</a> - ${escapeHtml(formatDateTime(program.start_time))}</li>`;
  };

  const listingBlock = topPrograms.length
    ? `
      <h2 style="font-size:1.3rem;margin:24px 0 12px;">Grille ${escapeHtml(activeSection?.label || 'du jour')}</h2>
      <ul style="margin:0;padding-left:18px;">
        ${topPrograms.map((program) => `
          <li>
            <a href="${escapeHtml(program.url || '#')}">${escapeHtml(program.title)}</a>
            - ${escapeHtml(formatDateTime(program.start_time))}
            ${program.genre ? ` - ${escapeHtml(program.genre)}` : ''}
          </li>
        `).join('\n')}
      </ul>
    `
    : '<p style="margin:16px 0 0;">Le palimpseste détaillé sera chargé après hydration si aucun snapshot n’est disponible.</p>';

  return `
    <h1 style="font-size:2rem;line-height:1.2;margin:0 0 12px;">Programme TV ${escapeHtml(channelName)} ce soir</h1>
    <p style="margin:0 0 16px;">${escapeHtml(description)}</p>
    <ul style="margin:0;padding-left:18px;">
      <li><a href="/en-direct">Programme TNT en direct</a></li>
      <li><a href="/film-ce-soir">Films ce soir</a></li>
      <li><a href="/sport-ce-soir">Sport ce soir</a></li>
      <li><a href="/demain">Programme TV demain</a></li>
      <li><a href="/${escapeHtml(channelSlug)}">Programme TV ${escapeHtml(channelName)} aujourd’hui</a></li>
      <li><a href="/en-direct/${escapeHtml(channelSlug)}">Programme ${escapeHtml(channelName)} en direct</a></li>
      <li><a href="/ce-soir/${escapeHtml(channelSlug)}">Programme ${escapeHtml(channelName)} ce soir</a></li>
      <li><a href="/demain/${escapeHtml(channelSlug)}">Programme ${escapeHtml(channelName)} demain</a></li>
      <li><a href="/">Programme TV TNT ce soir</a></li>
      <li><a href="/series-ce-soir">Séries ce soir</a></li>
    </ul>
    ${(liveProgram || tonightProgram || tomorrowProgram) ? `
      <h2 style="font-size:1.3rem;margin:24px 0 12px;">Repères rapides</h2>
      <ul style="margin:0;padding-left:18px;">
        ${highlightBlock('En direct', liveProgram)}
        ${highlightBlock('Ce soir', tonightProgram)}
        ${highlightBlock('Demain', tomorrowProgram)}
      </ul>
    ` : ''}
    ${listingBlock}
  `;
}

function buildProgramFallback(program, channel, programPath) {
  const description = program.description || `${program.title} sur ${channel.name}.`;
  return `
    <h1 style="font-size:2rem;line-height:1.2;margin:0 0 12px;">${escapeHtml(program.title)}</h1>
    <p style="margin:0 0 8px;">${escapeHtml(description)}</p>
    <p style="margin:0 0 8px;"><strong>Chaîne :</strong> <a href="/${escapeHtml(getChannelSlug(channel.channel_id))}">${escapeHtml(channel.name)}</a></p>
    <p style="margin:0 0 16px;"><strong>Diffusion :</strong> ${escapeHtml(formatDateTime(program.start_time))} - ${escapeHtml(formatDateTime(program.end_time))}</p>
    <p style="margin:0;"><a href="${escapeHtml(programPath)}">URL canonique du programme</a></p>
  `;
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function fetchJson(url, fallback = null) {
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

function getFreshnessTimestamp(payload) {
  if (!payload || typeof payload !== 'object') return 0;

  const candidates = [
    payload.generatedAt,
    payload.publishedDate,
    payload.dateModified,
    payload.datePublished,
    payload.createdAt,
    payload.updatedAt,
  ].filter(Boolean);

  for (const value of candidates) {
    const timestamp = Date.parse(String(value));
    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  return 0;
}

async function loadFreshJson(localPath, remoteUrl, fallback = null) {
  const [localPayload, remotePayload] = await Promise.all([
    Promise.resolve(readJson(localPath, fallback)),
    remoteUrl ? fetchJson(remoteUrl, null) : Promise.resolve(null),
  ]);

  const localTimestamp = getFreshnessTimestamp(localPayload);
  const remoteTimestamp = getFreshnessTimestamp(remotePayload);

  if (remotePayload && remoteTimestamp >= localTimestamp) {
    return remotePayload;
  }

  return localPayload ?? fallback;
}

function readEntityRoutes() {
  return readJson(ENTITY_ROUTES_FILE, {
    film: [],
    series: [],
    actor: [],
    indexes: [],
  });
}

function buildEntitySameAs(externalIds = {}) {
  return [
    externalIds.wikidata ? `https://www.wikidata.org/wiki/${externalIds.wikidata}` : null,
    externalIds.wikipedia || null,
    externalIds.imdb ? `https://www.imdb.com/${externalIds.imdb.startsWith('nm') ? 'name' : 'title'}/${externalIds.imdb}/` : null,
    externalIds.tmdb || null,
  ].filter(Boolean);
}

function buildFilmEntityGraph(entity) {
  const sameAs = buildEntitySameAs(entity.externalIds);
  return {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    '@id': `${SITE_URL}/film/${entity.slug}#movie`,
    url: `${SITE_URL}/film/${entity.slug}`,
    mainEntityOfPage: `${SITE_URL}/film/${entity.slug}`,
    name: entity.title,
    description: entity.descriptionAi || entity.description || entity.title,
    ...(entity.image?.url ? { image: entity.image.url } : {}),
    ...(entity.year ? { datePublished: String(entity.year) } : {}),
    inLanguage: 'fr-FR',
    ...(entity.genres?.length ? { genre: entity.genres } : {}),
    ...(entity.durationMinutes ? { duration: `PT${Math.round(entity.durationMinutes)}M` } : {}),
    ...(entity.director ? {
      director: {
        '@type': 'Person',
        name: entity.director.name,
        ...(entity.director.qid ? { sameAs: `https://www.wikidata.org/wiki/${entity.director.qid}` } : {}),
      },
    } : {}),
    ...(entity.cast?.length ? {
      actor: entity.cast.slice(0, 12).map((person) => ({
        '@type': 'Person',
        name: person.name,
        ...(person.qid ? { sameAs: `https://www.wikidata.org/wiki/${person.qid}` } : {}),
      })),
    } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

function buildSeriesEntityGraph(entity) {
  const sameAs = buildEntitySameAs(entity.externalIds);
  return {
    '@context': 'https://schema.org',
    '@type': 'TVSeries',
    '@id': `${SITE_URL}/serie/${entity.slug}#tvseries`,
    url: `${SITE_URL}/serie/${entity.slug}`,
    mainEntityOfPage: `${SITE_URL}/serie/${entity.slug}`,
    name: entity.title,
    description: entity.descriptionAi || entity.description || entity.title,
    ...(entity.image?.url ? { image: entity.image.url } : {}),
    ...(entity.startYear ? { startDate: String(entity.startYear) } : {}),
    inLanguage: 'fr-FR',
    ...(entity.genres?.length ? { genre: entity.genres } : {}),
    ...(entity.numberOfSeasons ? { numberOfSeasons: entity.numberOfSeasons } : {}),
    ...(entity.cast?.length ? {
      actor: entity.cast.slice(0, 12).map((person) => ({
        '@type': 'Person',
        name: person.name,
        ...(person.qid ? { sameAs: `https://www.wikidata.org/wiki/${person.qid}` } : {}),
      })),
    } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

function buildActorEntityGraph(entity) {
  const sameAs = buildEntitySameAs(entity.externalIds);
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${SITE_URL}/acteur/${entity.slug}#person`,
    url: `${SITE_URL}/acteur/${entity.slug}`,
    mainEntityOfPage: `${SITE_URL}/acteur/${entity.slug}`,
    name: entity.name,
    description: entity.descriptionAi || entity.description || entity.name,
    ...(entity.image?.url ? { image: entity.image.url } : {}),
    ...(entity.birthDate ? { birthDate: entity.birthDate } : {}),
    ...(entity.jobTitle ? { jobTitle: entity.jobTitle } : {}),
    ...(entity.nationality ? { nationality: { '@type': 'Country', name: entity.nationality } } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

function buildEntityIndexGraph(indexPayload, routePath) {
  const schemaType = indexPayload.type === 'actor' ? 'Person' : indexPayload.type === 'film' ? 'Movie' : 'TVSeries';
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: indexPayload.title,
    description: indexPayload.description,
    url: `${SITE_URL}${routePath}`,
    hasPart: (indexPayload.items || []).slice(0, 24).map((item) => ({
      '@type': schemaType,
      name: item.title,
      url: `${SITE_URL}${item.href}`,
    })),
  };
}

function buildEntityIndexFallback(payload, options = {}) {
  const birthday = options.birthdayArticle;
  if (payload.type === 'actor' && birthday?.ok === true) {
    return `
      <div style="position:relative;overflow:hidden;border:1px solid #fde68a;border-radius:32px;padding:32px;background:radial-gradient(circle at top left, rgba(255,236,179,0.95), rgba(255,255,255,0.96) 38%, rgba(255,242,242,0.98) 75%);box-shadow:0 20px 60px rgba(15,23,42,0.08);margin:0 0 32px;">
        <div style="position:absolute;left:-30px;top:30px;width:120px;height:120px;border-radius:999px;background:rgba(253,224,71,0.22);filter:blur(18px);"></div>
        <div style="position:absolute;right:24px;top:18px;font-size:22px;opacity:0.75;">✨</div>
        <div style="position:absolute;right:28px;bottom:22px;font-size:30px;opacity:0.6;">🎂</div>
        <div style="position:relative;">
          <p style="margin:0 0 12px;"><span style="display:inline-flex;align-items:center;border-radius:999px;background:#fef3c7;padding:6px 12px;font-size:11px;font-weight:800;letter-spacing:0.28em;text-transform:uppercase;color:#92400e;">Anniversaire du jour</span></p>
          <h2 style="font-size:2rem;line-height:1.05;margin:0 0 12px;"><a href="/anniversaire-du-jour">${escapeHtml(`Aujourd'hui, ${birthday.selectedActor} est à l'honneur.`)}</a></h2>
          <p style="margin:0 0 16px;max-width:860px;">${escapeHtml(birthday.excerpt || birthday.metaDescription || '')}</p>
          <p style="margin:0;"><a href="/anniversaire-du-jour">Lire le portrait anniversaire</a> · <a href="/acteur/${escapeHtml(birthday.selectedSlug)}">Voir la fiche acteur</a></p>
        </div>
      </div>
    ` + `
    <h1 style="font-size:2rem;line-height:1.2;margin:0 0 12px;">${escapeHtml(payload.title)}</h1>
    <p style="margin:0 0 16px;">${escapeHtml(payload.description)}</p>
    <ul style="margin:0;padding-left:18px;">
      ${(payload.items || []).slice(0, 40).map((item) => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a></li>`).join('\n')}
    </ul>
  `;
  }

  return `
    <h1 style="font-size:2rem;line-height:1.2;margin:0 0 12px;">${escapeHtml(payload.title)}</h1>
    <p style="margin:0 0 16px;">${escapeHtml(payload.description)}</p>
    <ul style="margin:0;padding-left:18px;">
      ${(payload.items || []).slice(0, 40).map((item) => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a></li>`).join('\n')}
    </ul>
  `;
}

function buildEntityFallback(entity, type) {
  const title = entity.title || entity.name || '';
  const description = entity.descriptionAi || entity.description || title;
  const airings = filterActiveEntityAirings(entity.upcomingAirings || []).slice(0, 12);
  const actorMeta = type === 'actor'
    ? [
      entity.jobTitle ? escapeHtml(entity.jobTitle) : '',
      entity.nationality ? escapeHtml(entity.nationality) : '',
      entity.birthDate ? `Né·e le ${escapeHtml(formatBirthDate(entity.birthDate))}` : '',
    ].filter(Boolean)
    : [];
  return `
    <h1 style="font-size:2rem;line-height:1.2;margin:0 0 12px;">${type === 'actor' ? `Films et séries avec ${escapeHtml(title)} à la TV` : escapeHtml(title)}</h1>
    <p style="margin:0 0 16px;">${type === 'actor'
      ? escapeHtml(`${title} à la TV ce soir et dans les prochains jours. Retrouvez les films, séries et chaînes où voir ${title} sur Programme Ce Soir.`)
      : escapeHtml(description)}</p>
    ${actorMeta.length ? `<p style="margin:0 0 16px;"><strong>${actorMeta.join(' · ')}</strong></p>` : ''}
    ${airings.length ? `
      <h2 style="font-size:1.3rem;margin:0 0 12px;">${type === 'actor' ? `Programmes TV avec ${escapeHtml(title)}` : 'Prochaines diffusions'}</h2>
      <ul style="margin:0;padding-left:18px;">
        ${airings.map((airing) => `<li><a href="${escapeHtml(airing.programUrl)}">${escapeHtml(airing.title)}</a> - ${escapeHtml(formatDateTime(airing.startTime))}</li>`).join('\n')}
      </ul>
    ` : ''}
    ${type !== 'actor' && entity.channels?.length ? `
      <p style="margin:16px 0 0;"><strong>Chaînes :</strong> ${entity.channels.slice(0, 8).map((channel) => `<a href="/${escapeHtml(channel.channelSlug)}">${escapeHtml(channel.channelName)}</a>`).join(', ')}</p>
    ` : ''}
  `;
}

function getChannelPageMeta(channelName, viewMode, channelSlug) {
  if (viewMode === 'maintenant') {
    return {
      title: `Programme TV ${channelName} en direct - Programme Ce Soir`,
      description: `Programmes TV en direct sur ${channelName}. Guide complet des émissions en cours aujourd’hui.`,
    };
  }
  if (viewMode === 'ce-soir') {
    return {
      title: `${channelName} ce soir : programme TV et prime time - Programme Ce Soir`,
      description: `Consultez la grille de ce soir sur ${channelName}, avec les horaires, le prime time et les émissions à suivre en première partie de soirée.`,
    };
  }
  if (viewMode === 'demain') {
    return {
      title: `Programme TV ${channelName} demain : grille détaillée - Programme Ce Soir`,
      description: `Découvrez le programme de ${channelName} pour demain : horaires, titres et résumés des émissions, dessins animés, films et séries.`,
      image: `${SITE_URL}/static/img/channels/${channelSlug}.jpg`,
    };
  }
  return {
    title: `Programme TV ${channelName} aujourd’hui - Programme Ce Soir`,
    description: `Programme TV ${channelName} aujourd’hui : horaires et descriptions détaillées des émissions.`,
  };
}

async function main() {
  if (!fs.existsSync(DIST_INDEX)) {
    throw new Error(`Missing built template at ${DIST_INDEX}. Run vite build first.`);
  }

  const template = fs.readFileSync(DIST_INDEX, 'utf8');
  let staticPageCount = 0;
  let homePageCount = 0;
  let channelPageCount = 0;
  const currentBirthday = await loadFreshJson(
    CURRENT_BIRTHDAY_FILE,
    `${SITE_URL}/birthday-data/current.json`,
    null,
  );
  const birthdayArchive = readJson(BIRTHDAY_ARCHIVE_FILE, null);
  const socialReport = await loadFreshJson(
    SOCIAL_PERFORMANCE_PUBLIC_FILE,
    `${SITE_URL}/search-console/social-performance-latest.json`,
    readJson(SOCIAL_PERFORMANCE_CACHE_FILE, null),
  );
  let fetchedChannels = [];
  let fetchedPrograms = [];
  let channelMap = new Map();
  let channelBySlug = new Map();

  try {
    const supabase = createSupabaseClient();
    fetchedChannels = await fetchChannels(supabase);
    fetchedPrograms = await fetchPrograms(supabase);
    channelMap = new Map(fetchedChannels.map((channel) => [String(channel.channel_id), channel]));
    channelBySlug = new Map(fetchedChannels.map((channel) => [getChannelSlug(channel.channel_id), channel]));
  } catch (error) {
    console.warn('⚠ Unable to fetch channel/program bulk data for prerender bootstrap');
    console.warn(error?.message || error);
  }

  // Root views and categories.
  for (const [routePath, config] of Object.entries(HOME_PAGES)) {
    const jsonLd = [
      ...buildSiteGraph(SITE_URL),
      buildBreadcrumbList([{ name: 'Accueil', item: SITE_URL }]),
    ];
    if (routePath === '/') {
      jsonLd.push(buildFaqGraph(HOME_FAQ_DATA));
    }
    const bootstrapPayload = fetchedPrograms.length && channelMap.size
      ? buildHomeBootstrapPayload(routePath, fetchedPrograms, channelMap)
      : {
        routePath,
        pageState: { type: 'home' },
        viewMode: routePath === '/en-direct' ? 'now' : routePath === '/demain' ? 'tomorrow' : 'tonight',
        filter: 'Tous',
      };
    jsonLd.push(...buildHomeListingGraphs(routePath, bootstrapPayload, channelMap));
    const html = injectHtml(template, {
      title: config.title,
      description: config.description,
      canonicalUrl: `${SITE_URL}${routePath === '/' ? '' : routePath}`,
      bootstrapPayload,
      jsonLdScripts: makeJsonLdScripts(jsonLd, 'data-seo', 'homepage'),
      fallbackHtml: buildHomeFallback(routePath),
    });
    writePrerenderHtml(routePath, html);
    staticPageCount += 1;
    homePageCount += 1;
  }

  for (const [routePath, config] of Object.entries(CATEGORY_PAGES)) {
    const jsonLd = [
      buildBreadcrumbList([
        { name: 'Accueil', item: SITE_URL },
        { name: config.label, item: `${SITE_URL}${routePath}` },
      ]),
    ];
    const normalizedCategory = config.label === 'Séries'
      ? 'Series'
      : config.label === 'Divertissements'
        ? 'Divertissement'
        : config.label;
    const bootstrapPayload = fetchedPrograms.length && channelMap.size
      ? buildHomeBootstrapPayload(routePath, fetchedPrograms, channelMap)
      : {
        routePath,
        pageState: { type: 'home', category: normalizedCategory },
        viewMode: 'tonight',
        filter: normalizedCategory,
      };
    jsonLd.push(...buildHomeListingGraphs(routePath, bootstrapPayload, channelMap));
    const html = injectHtml(template, {
      title: config.title,
      description: config.description,
      canonicalUrl: `${SITE_URL}${routePath}`,
      bootstrapPayload,
      jsonLdScripts: makeJsonLdScripts(jsonLd, 'data-seo', 'homepage'),
      fallbackHtml: buildCategoryFallback(routePath),
    });
    writePrerenderHtml(routePath, html);
    staticPageCount += 1;
    homePageCount += 1;
  }

  const newsPayload = buildNewsPayload(currentBirthday, socialReport);
  const newsGraphs = [
    buildBreadcrumbList([
      { name: 'Accueil', item: SITE_URL },
        { name: 'Actualités', item: `${SITE_URL}${NEWS_ROUTE}` },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${SITE_URL}${NEWS_ROUTE}#collectionpage`,
      name: 'Actualités TV et histoires éditoriales',
      description: NEWS_PAGE_DESCRIPTION,
      url: `${SITE_URL}${NEWS_ROUTE}`,
      inLanguage: 'fr-FR',
      author: { '@id': `${SITE_URL}/#organization` },
      publisher: { '@id': `${SITE_URL}/#organization` },
      mainEntity: { '@id': `${SITE_URL}${NEWS_ROUTE}#itemlist` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      '@id': `${SITE_URL}${NEWS_ROUTE}#itemlist`,
      itemListElement: [newsPayload.leadStory, ...newsPayload.stories]
        .filter(Boolean)
        .map((story, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: story.title,
          url: story.url.startsWith('http') ? story.url : `${SITE_URL}${story.url}`,
        })),
    },
  ];
  const newsHtml = injectHtml(template, {
    title: NEWS_PAGE_TITLE,
    description: NEWS_PAGE_DESCRIPTION,
    canonicalUrl: `${SITE_URL}${NEWS_ROUTE}`,
    bootstrapPayload: {
      routePath: NEWS_ROUTE,
      pageState: { type: 'news' },
      newsPage: newsPayload,
    },
    jsonLdScripts: makeJsonLdScripts(newsGraphs, 'data-seo', 'news'),
    fallbackHtml: buildNewsFallback(newsPayload),
    imageUrl: newsPayload.leadStory?.imageUrl || `${SITE_URL}/static/img/programmecesoir-social.jpg`,
  });
  writePrerenderHtml(NEWS_ROUTE, newsHtml);
  writePrerenderHtml(LEGACY_NEWS_ROUTE, injectHtml(template, {
    title: NEWS_PAGE_TITLE,
    description: NEWS_PAGE_DESCRIPTION,
    canonicalUrl: `${SITE_URL}${NEWS_ROUTE}`,
    bootstrapPayload: {
      routePath: LEGACY_NEWS_ROUTE,
      pageState: { type: 'news' },
      newsPage: newsPayload,
    },
    jsonLdScripts: makeJsonLdScripts(newsGraphs, 'data-seo', 'news'),
    fallbackHtml: buildNewsFallback(newsPayload),
    imageUrl: newsPayload.leadStory?.imageUrl || `${SITE_URL}/static/img/programmecesoir-social.jpg`,
  }));
  staticPageCount += 2;

  const creditsRoute = '/credits';
  const creditsHtml = injectHtml(template, {
    title: 'Crédits | Programme Ce Soir',
    description: 'Profils et références officiels de Programme Ce Soir, guide TV TNT français.',
    canonicalUrl: `${SITE_URL}${creditsRoute}`,
    bootstrapPayload: {
      routePath: creditsRoute,
      pageState: { type: 'credits' },
    },
    jsonLdScripts: makeJsonLdScripts(buildSiteGraph(SITE_URL), 'data-seo', 'credits'),
    fallbackHtml: buildCreditsFallback(),
  });
  writePrerenderHtml(creditsRoute, creditsHtml);
  staticPageCount += 1;

  const adminRoute = '/admin-url-inspection';
  const adminHtml = injectHtml(template, {
    title: 'Admin monitoring | Programme Ce Soir',
    description: 'Console interne de suivi technique et éditorial.',
    canonicalUrl: `${SITE_URL}${adminRoute}`,
    robots: 'noindex,nofollow',
    bootstrapPayload: {
      routePath: adminRoute,
      pageState: { type: 'admin-url-inspection' },
    },
    fallbackHtml: buildAdminFallback(),
  });
  writePrerenderHtml(adminRoute, adminHtml);
  staticPageCount += 1;

  if (currentBirthday?.ok === true && currentBirthday?.articleSlug) {
    const birthdayGraphs = [
      buildBreadcrumbList([
        { name: 'Accueil', item: SITE_URL },
        { name: 'Anniversaire du jour', item: `${SITE_URL}/anniversaire-du-jour` },
      ]),
      currentBirthday.structuredData,
    ];

    const birthdayCommon = {
      title: getBirthdayPageTitle(currentBirthday),
      description: currentBirthday.metaDescription || currentBirthday.excerpt || currentBirthday.title,
      jsonLdScripts: makeJsonLdScripts(birthdayGraphs, 'data-seo', 'birthday'),
      fallbackHtml: buildBirthdayFallback(currentBirthday),
      bootstrapPayload: {
        routePath: '/anniversaire-du-jour',
        pageState: { type: 'birthday' },
        birthdayArticle: currentBirthday,
      },
      imageUrl: currentBirthday.imageUrl || currentBirthday.actorImageUrl || currentBirthday.og?.image || SITE_LOGO_URL,
    };

    writePrerenderHtml('/anniversaire-du-jour', injectHtml(template, {
      ...birthdayCommon,
      canonicalUrl: `${SITE_URL}/anniversaire-du-jour`,
    }));
    staticPageCount += 1;

    writePrerenderHtml(`/anniversaire/${currentBirthday.articleSlug}`, injectHtml(template, {
      ...birthdayCommon,
      canonicalUrl: `${SITE_URL}/anniversaire/${currentBirthday.articleSlug}`,
      bootstrapPayload: {
        routePath: `/anniversaire/${currentBirthday.articleSlug}`,
        pageState: { type: 'birthday', slug: currentBirthday.articleSlug },
        birthdayArticle: currentBirthday,
      },
    }));
    staticPageCount += 1;
  }

  if (birthdayArchive?.ok === true) {
    const birthdayArchiveGraphs = [
      buildBreadcrumbList([
        { name: 'Accueil', item: SITE_URL },
        { name: 'Anniversaires acteurs', item: `${SITE_URL}/anniversaires-acteurs` },
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Anniversaires acteurs',
        description: "Portraits anniversaire et programmes TV associés aux acteurs à l'honneur.",
        url: `${SITE_URL}/anniversaires-acteurs`,
      },
    ];

    writePrerenderHtml('/anniversaires-acteurs', injectHtml(template, {
      title: 'Anniversaires acteurs : portraits et programmes TV - Programme Ce Soir',
      description: "Tous les anniversaires d'acteurs repérés par Programme Ce Soir : portrait du jour, acteurs qui fêtent leur anniversaire aujourd'hui et archives éditoriales.",
      canonicalUrl: `${SITE_URL}/anniversaires-acteurs`,
      bootstrapPayload: {
        routePath: '/anniversaires-acteurs',
        pageState: { type: 'birthday-archive' },
        birthdayArchive,
      },
      jsonLdScripts: makeJsonLdScripts(birthdayArchiveGraphs, 'data-seo', 'birthday-archive'),
      fallbackHtml: buildBirthdayArchiveFallback(birthdayArchive),
      imageUrl: birthdayArchive?.current?.imageUrl || birthdayArchive?.current?.actorImageUrl || SITE_LOGO_URL,
    }));
    staticPageCount += 1;
  }

  for (const chaine of CHAINES) {
    const routePath = `/${chaine.slug}`;
    const actualChannel = channelBySlug.get(chaine.slug) || {
      channel_id: chaine.slug,
      name: chaine.nom,
      logo_url: chaine.logoUrl || null,
      channel_number: null,
      slug: chaine.slug,
    };
    const channelSections = fetchedPrograms.length
      ? getChannelBootstrapSections({ ...actualChannel, slug: chaine.slug }, routePath, fetchedPrograms)
      : [];
    const activeChannelPayload = channelSections.find((section) => section.key === 'aujourdhui')?.payload || {
      routePath,
      pageState: {
        type: 'channel',
        channelId: String(actualChannel.channel_id),
        subView: 'tonight',
        channelViewMode: 'aujourdhui',
      },
      programs: [],
    };
    const graphPrograms = (activeChannelPayload.programs || []).slice(0, CHANNEL_GRAPH_PROGRAM_LIMIT).map((program) => ({
      ...program,
      start_time: program.start_time,
      end_time: program.end_time,
    }));
    const jsonLd = [
      buildChannelGraph({
        siteUrl: SITE_URL,
        channelName: chaine.nom,
        channelUrl: routePath,
        description: chaine.description,
        logoUrl: chaine.logoUrl,
        channelSameAs: chaine.wikidataSameAs,
      }),
      buildBreadcrumbList([
        { name: 'Accueil', item: SITE_URL },
        { name: chaine.nom, item: `${SITE_URL}${routePath}` },
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': `${SITE_URL}${routePath}#collectionpage`,
        name: `Programme TV ${chaine.nom} ce soir`,
        description: chaine.description,
        url: `${SITE_URL}${routePath}`,
        inLanguage: 'fr-FR',
        isPartOf: { '@id': `${SITE_URL}/#website` },
        mainEntity: { '@id': `${SITE_URL}${routePath}#programme-list` },
        about: {
          '@type': 'Thing',
          name: `Programme TV ${chaine.nom}`,
        },
      },
    ];
    const itemListGraph = buildChannelItemListGraph(
      { name: chaine.nom },
      routePath,
      graphPrograms
    );
    if (itemListGraph) {
      jsonLd.push(itemListGraph);
    }
    graphPrograms.forEach((program) => {
      const programGraphs = buildProgramWorkGraph({
        siteUrl: SITE_URL,
        fullUrl: `${SITE_URL}${program.url}`,
        title: program.title,
        description: program.description || `${program.title} sur ${chaine.nom}`,
        image: program.channels?.logo_url || chaine.logoUrl || SITE_LOGO_URL,
        category: program.genre,
        startTime: program.start_time,
        endTime: program.end_time,
        channelName: chaine.nom,
        channelUrl: routePath,
        channelSameAs: chaine.wikidataSameAs,
      });
      jsonLd.push(...programGraphs);
    });
    const html = injectHtml(template, {
      title: `Programme TV ${chaine.nom} ce soir - Programme Ce Soir`,
      description: chaine.description,
      canonicalUrl: `${SITE_URL}${routePath}`,
      jsonLdScripts: makeJsonLdScripts(jsonLd, 'data-seo', 'channel'),
      fallbackHtml: buildChannelFallback(chaine.nom, chaine.description, chaine.slug, channelSections),
      bootstrapPayload: activeChannelPayload,
      imageUrl: actualChannel.logo_url || chaine.logoUrl || SITE_LOGO_URL,
    });
    writePrerenderHtml(routePath, html);
    staticPageCount += 1;
    channelPageCount += 1;
  }

  const entityRoutes = readEntityRoutes();
  const entityIndexConfigs = [
    { routePath: '/films', fileName: 'films.json', type: 'film' },
    { routePath: '/series', fileName: 'series.json', type: 'series' },
    { routePath: '/acteurs', fileName: 'actors.json', type: 'actor' },
  ];

  for (const config of entityIndexConfigs) {
    const payload = readJson(path.join(ENTITY_INDEXES_DIR, config.fileName), null);
    if (!payload) continue;
    const graph = [
      buildBreadcrumbList([
        { name: 'Accueil', item: SITE_URL },
        { name: payload.title, item: `${SITE_URL}${config.routePath}` },
      ]),
      buildEntityIndexGraph(payload, config.routePath),
    ];

    const html = injectHtml(template, {
      title: config.type === 'actor'
        ? `${payload.title} à la TV : films, séries et diffusions - Programme Ce Soir`
        : `${payload.title} - Programme Ce Soir`,
      description: config.type === 'actor'
        ? `${payload.title} à la TV ce soir et dans les prochains jours. Retrouvez les films, séries et chaînes où voir ${payload.title} sur Programme Ce Soir.`
        : payload.description,
      canonicalUrl: `${SITE_URL}${config.routePath}`,
      bootstrapPayload: {
        routePath: config.routePath,
        pageState: { type: 'entity-index', entityType: config.type },
        entityIndex: payload,
        ...(config.type === 'actor' && currentBirthday?.ok === true ? { birthdayArticle: currentBirthday } : {}),
      },
      jsonLdScripts: makeJsonLdScripts(graph, 'data-seo', 'entity-index'),
      fallbackHtml: buildEntityIndexFallback(payload, {
        birthdayArticle: config.type === 'actor' ? currentBirthday : null,
      }),
      imageUrl: `${SITE_URL}/static/img/programmecesoir-social.jpg`,
    });
    writePrerenderHtml(config.routePath, html);
    staticPageCount += 1;
  }

  const entityRouteGroups = [
    { type: 'film', routes: entityRoutes.film || [], baseDir: path.join(ENTITIES_DATA_DIR, 'films') },
    { type: 'series', routes: entityRoutes.series || [], baseDir: path.join(ENTITIES_DATA_DIR, 'series') },
    { type: 'actor', routes: entityRoutes.actor || [], baseDir: path.join(ENTITIES_DATA_DIR, 'actors') },
  ];

  for (const group of entityRouteGroups) {
    for (const routePath of group.routes) {
      const slug = routePath.split('/').filter(Boolean).pop();
      if (!slug) continue;
      const entity = readJson(path.join(group.baseDir, `${slug}.json`), null);
      if (!entity) continue;

      const graph = [
        buildBreadcrumbList([
          { name: 'Accueil', item: SITE_URL },
          {
            name: group.type === 'film' ? 'Films' : group.type === 'series' ? 'Séries' : 'Acteurs',
            item: `${SITE_URL}${group.type === 'film' ? '/films' : group.type === 'series' ? '/series' : '/acteurs'}`,
          },
          { name: entity.title || entity.name, item: `${SITE_URL}${routePath}` },
        ]),
        group.type === 'film'
          ? buildFilmEntityGraph(entity)
          : group.type === 'series'
            ? buildSeriesEntityGraph(entity)
            : buildActorEntityGraph(entity),
      ];

      const html = injectHtml(template, {
        title: group.type === 'actor'
          ? `${entity.title || entity.name} à la TV : films, séries et diffusions - Programme Ce Soir`
          : `${entity.title || entity.name} - Programme Ce Soir`,
        description: group.type === 'actor'
          ? `${entity.title || entity.name} à la TV ce soir et dans les prochains jours. Retrouvez les films, séries et chaînes où voir ${entity.title || entity.name} sur Programme Ce Soir.`
          : entity.descriptionAi || entity.description || `${entity.title || entity.name} sur Programme Ce Soir`,
        canonicalUrl: `${SITE_URL}${routePath}`,
        bootstrapPayload: {
          routePath,
          pageState: { type: 'entity', entityType: group.type, slug },
          entity,
        },
        jsonLdScripts: makeJsonLdScripts(graph, 'data-seo', `entity-${group.type}`),
        fallbackHtml: buildEntityFallback(entity, group.type),
        imageUrl: entity.image?.url || SITE_LOGO_URL,
      });
      writePrerenderHtml(routePath, html);
      staticPageCount += 1;
    }
  }

  console.log(`✅ Pre-render SEO pages generated in ${DIST_DIR}`);
  console.log(`   Static pages only: ${staticPageCount}`);
  console.log(`   Home/category pages: ${homePageCount}`);
  console.log(`   Channel pages: ${channelPageCount}`);
  console.log('   Program pages: 0');
}

main().catch((error) => {
  console.error('❌ Failed to generate pre-render SEO pages');
  console.error(error);
  process.exit(1);
});
