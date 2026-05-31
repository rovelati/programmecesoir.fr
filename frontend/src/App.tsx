import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { ChannelCard } from './components/ChannelCard';
import { Footer } from './components/Footer';
// import { MOCK_CHANNELS } from './constants'; // Removed constants dependency
import { TimeSlotFilter, TimeView, PageState, Channel, Program } from './types';
import { usePrograms } from './hooks/usePrograms';
import { programMatchesCategory, getCategorySeoTitle, getCategorySeoDescription } from './utils/categoryFilters';
import { useSEO } from './utils/seo';
import { getSeoForPage } from './utils/seoTemplates';
import { getTodayInParis } from './utils/timeSlots';
import { getChannelUrl, getChannelSlug, parseChannelUrl, ChannelViewMode } from './utils/channelSlug';
import { getProgramAiringToken, getProgramUrl, getProgramSlugFromTitle, parseProgramUrl } from './utils/programSlug';
import { parseEntityPath } from './utils/entityRoutes';

const getCategoryFromPath = (path: string): TimeSlotFilter => {
  const pathToCategory: Record<string, TimeSlotFilter> = {
    '/film-ce-soir': 'Films',
    '/series-ce-soir': 'Series',
    '/sport-ce-soir': 'Sport',
    '/documentaires-ce-soir': 'Documentaires',
    '/divertissement-ce-soir': 'Divertissement',
    '/infos-ce-soir': 'Info',
    '/jeunesse-ce-soir': 'Jeunesse',
    '/culture-ce-soir': 'Culture',
  };
  return pathToCategory[path] || 'Tous';
};

const NEWS_ROUTE = '/actualites';
const LEGACY_NEWS_ROUTE = '/notizie';

const normalizePathname = (pathname: string): string => {
  if (!pathname) return '/';
  if (pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
};

const getInitialViewModeFromUrl = (): TimeView => {
  if (typeof window === 'undefined') return 'tonight';
  const path = normalizePathname(window.location.pathname);
  if (path === '/en-direct' || path === '/maintenant') return 'now';
  if (path === '/demain') return 'tomorrow';
  return 'tonight';
};

const getInitialFilterFromUrl = (): TimeSlotFilter => {
  if (typeof window === 'undefined') return 'Tous';
  return getCategoryFromPath(normalizePathname(window.location.pathname));
};

// Parse URL before first render to avoid loading full home data on direct program/channel links
const getInitialPageStateFromUrl = (): PageState => {
  if (typeof window === 'undefined') return { type: 'home' };

  const bootstrapData = getBootstrapData();
  if (normalizePathname(bootstrapData?.routePath || '') === normalizePathname(window.location.pathname) && bootstrapData.pageState) {
    const bootstrapPageState = bootstrapData.pageState as PageState & {
      channelId?: string;
      channelSlug?: string;
      programSlug?: string;
      programAiringToken?: string;
    };

    if (bootstrapPageState.type === 'program-loading') {
      return {
        type: 'program-loading',
        channelSlug: bootstrapPageState.channelSlug || getChannelSlug(String(bootstrapPageState.channelId || '')),
        programSlug: bootstrapPageState.programSlug || '',
        programAiringToken: bootstrapPageState.programAiringToken,
      };
    }

    if (bootstrapPageState.type === 'program') {
      return {
        ...bootstrapPageState,
        channelSlug: bootstrapPageState.channelSlug || getChannelSlug(String(bootstrapPageState.channelId || '')),
      };
    }

    return bootstrapPageState;
  }

  const path = normalizePathname(window.location.pathname);
  const searchParams = new URLSearchParams(window.location.search);
  const birthdayArticleMatch = path.match(/^\/anniversaire\/([^/]+)\/?$/);
  if (path === '/anniversaires-acteurs') {
    return { type: 'birthday-archive' };
  }
  if (path === '/anniversaire-du-jour') {
    return { type: 'birthday' };
  }
  if (birthdayArticleMatch) {
    return { type: 'birthday', slug: birthdayArticleMatch[1] };
  }
  const programUrl = parseProgramUrl(path);
  if (programUrl) {
    return {
      type: 'program-loading',
      channelSlug: programUrl.channelSlug,
      programSlug: programUrl.programSlug,
      programAiringToken: programUrl.programAiringToken,
    };
  }
  if (path.startsWith('/programme/')) {
    return { type: 'notfound', notFoundType: 'program' };
  }
  const radioProgramMatch = path.match(/^\/radio\/([^/]+)\/([^/]+)$/);
  if (radioProgramMatch) {
    const viewModes = ['maintenant', 'en-direct', 'ce-soir', 'demain'];
    if (!viewModes.includes(radioProgramMatch[2])) {
      return {
        type: 'program-loading',
        channelSlug: radioProgramMatch[1],
        programSlug: radioProgramMatch[2],
      };
    }
  }

  const entityPath = parseEntityPath(path);
  if (entityPath) {
    if (entityPath.isIndex) {
      return { type: 'entity-index', entityType: entityPath.type };
    }
    return { type: 'entity', entityType: entityPath.type, slug: entityPath.slug || '' };
  }

  if (path === '/recommandes') return { type: 'recommender' };
  if (path === NEWS_ROUTE || path === LEGACY_NEWS_ROUTE) return { type: 'news' };
  if (path === '/politique-cookies') return { type: 'cookie-policy' };
  if (path === '/conditions-generales') return { type: 'terms' };
  if (path === '/credits') return { type: 'credits' };
  if (path === '/admin-test') return { type: 'admin-test' };
  if (path === '/admin-url-inspection') return { type: 'admin-url-inspection' };

  const channelUrl = parseChannelUrl(path);
  if (channelUrl?.channelId) {
    return {
      type: 'channel',
      channelId: channelUrl.channelId,
      subView: channelUrl.viewMode === 'demain'
        ? 'tomorrow'
        : channelUrl.viewMode === 'maintenant'
          ? 'now'
          : channelUrl.viewMode === 'ce-soir'
            ? 'tonight'
            : 'now',
      channelViewMode: channelUrl.viewMode,
    };
  }

  if (path === '/recherche') {
    const query = searchParams.get('qs') || '';
    if (query) return { type: 'search', query };
  }

  const category = getCategoryFromPath(path);
  if (category !== 'Tous') {
    return { type: 'home', category };
  }

  return { type: 'home' };
};
import { resolveChannelNumber } from './utils/channelNumbers';
import { trackPageView, trackChannelView, trackProgramView, trackChannelClick, trackProgramClick, trackFilterChange, trackRecommender, trackSaveReminder, trackScrollDepth } from './utils/analytics';
import { downloadICS, openGoogleCalendar } from './utils/icsGenerator';
import { supabase } from './utils/supabase';
import { CHANNELS_TABLE, PROGRAMS_TABLE } from './utils/dbTables';
import { getBootstrapData } from './utils/bootstrapData';
import { buildFaqGraph, buildProgramWorkGraph, buildSiteGraph, HOME_FAQ_DATA } from './utils/knowledgeGraph';
import { isBirthdayPayloadCurrent } from './utils/birthdayData';
import { fetchLatestImportTimestamp } from './utils/importPipelineData';

const ChannelPage = lazy(() => import('./components/ChannelPage').then((module) => ({ default: module.ChannelPage })));
const ProgramPage = lazy(() => import('./components/ProgramPage').then((module) => ({ default: module.ProgramPage })));
const Recommender = lazy(() => import('./components/Recommender').then((module) => ({ default: module.Recommender })));
const SearchPage = lazy(() => import('./components/SearchPage').then((module) => ({ default: module.SearchPage })));
const NotFoundPage = lazy(() => import('./components/NotFoundPage').then((module) => ({ default: module.NotFoundPage })));
const CookiePolicy = lazy(() => import('./components/CookiePolicy').then((module) => ({ default: module.CookiePolicy })));
const TermsAndConditions = lazy(() => import('./components/TermsAndConditions').then((module) => ({ default: module.TermsAndConditions })));
const Credits = lazy(() => import('./components/Credits').then((module) => ({ default: module.Credits })));
const AdminTest = lazy(() => import('./components/AdminTest').then((module) => ({ default: module.AdminTest })));
const AdminUrlInspection = lazy(() => import('./components/AdminUrlInspection').then((module) => ({ default: module.AdminUrlInspection })));
const EntityIndexPage = lazy(() => import('./components/EntityIndexPage').then((module) => ({ default: module.EntityIndexPage })));
const FilmEntityPage = lazy(() => import('./components/FilmEntityPage').then((module) => ({ default: module.FilmEntityPage })));
const SeriesEntityPage = lazy(() => import('./components/SeriesEntityPage').then((module) => ({ default: module.SeriesEntityPage })));
const ActorEntityPage = lazy(() => import('./components/ActorEntityPage').then((module) => ({ default: module.ActorEntityPage })));
const BirthdayArticlePage = lazy(() => import('./components/BirthdayArticlePage').then((module) => ({ default: module.BirthdayArticlePage })));
const BirthdayArchivePage = lazy(() => import('./components/BirthdayArchivePage').then((module) => ({ default: module.BirthdayArchivePage })));
const NewsPage = lazy(() => import('./components/NewsPage').then((module) => ({ default: module.NewsPage })));

// Map category filter to URL slug
const getCategorySlug = (category: TimeSlotFilter): string => {
  const slugMap: Record<TimeSlotFilter, string> = {
    'Tous': '',
    'Films': 'film-ce-soir',
    'Info': 'infos-ce-soir',
    'Documentaires': 'documentaires-ce-soir',
    'Divertissement': 'divertissement-ce-soir',
    'Series': 'series-ce-soir',
    'Sport': 'sport-ce-soir',
    'Jeunesse': 'jeunesse-ce-soir',
    'Culture': 'culture-ce-soir'
  };
  return slugMap[category] || category.toLowerCase().replace(/\s+/g, '-');
};

const getHomeUrl = (view: TimeView, category?: TimeSlotFilter): string => {
  if (category && view === 'tonight') {
    return `/${getCategorySlug(category)}`;
  }
  if (view === 'now') return '/en-direct';
  if (view === 'tomorrow') return '/demain';
  return '/';
};

const getFilterLabel = (filter: TimeSlotFilter): string => {
  const labels: Record<TimeSlotFilter, string> = {
    Tous: 'Tous',
    Films: 'Films',
    Info: 'Info',
    Documentaires: 'Documentaires',
    Divertissement: 'Divertissement',
    Series: 'Séries',
    Sport: 'Sport',
    Jeunesse: 'Jeunesse',
    Culture: 'Culture'
  };
  return labels[filter] || filter;
};

const PROGRAM_LOOKBACK_DAYS = 30;
const PROGRAM_LOOKAHEAD_DAYS = 30;
const HOME_PRIORITY_CHANNEL_IDS = [
  'tf1',
  'france-2',
  'france-3',
  'canal-plus',
  'france-5',
  'm6',
  'arte',
  'w9',
  'tmc',
  'tfx',
];
const LIVE_EXTRA_CHANNEL_IDS_A = [
  'canal',
  'lci',
  'france-4',
  'bfm-tv',
  'cnews',
  'cstar',
  'gulli',
  '6ter',
  'rmc-decouverte',
  'rmc-story',
];
const LIVE_EXTRA_CHANNEL_IDS_B = [
  'franceinfo',
  'bfm-grand-littoral',
  'bfm-alsace',
  'automoto-la-chaine',
  'bfm-2',
  'bet',
  'adultswimfr',
  'bfm-business',
  'bfm-grand-lille',
  'bblack-classik',
];

const HEAD_SEO_LINKS = [
  { href: '/en-direct', label: 'Programme en direct', description: 'La vue live TNT à pousser sur les requêtes en direct et en cours.' },
  { href: '/film-ce-soir', label: 'Films ce soir', description: 'Le hub film prioritaire pour les choix de prime time et la longue traîne cinéma.' },
  { href: '/sport-ce-soir', label: 'Sport ce soir', description: 'La page sport à renforcer pour les directs à forte demande ce soir.' },
  { href: '/demain', label: 'Programme TV demain', description: 'Le hub de planification du lendemain, utile sur les requêtes de préparation.' },
  { href: '/', label: 'Programme TV ce soir', description: 'La page principale du prime time TNT et le point d’entrée éditorial.' },
  { href: '/series-ce-soir', label: 'Séries ce soir', description: 'Les séries du soir, chaîne par chaîne.' },
  { href: '/documentaires-ce-soir', label: 'Documentaires ce soir', description: 'Les documentaires et magazines découverte du soir.' },
  { href: '/infos-ce-soir', label: 'Info ce soir', description: 'Journaux et magazines d’actualité à la télévision.' },
];

const HEAD_CHANNEL_LINKS = [
  { channelId: 'tf1', label: 'Programme TF1 ce soir' },
  { channelId: 'france-2', label: 'Programme France 2 ce soir' },
  { channelId: 'france-3', label: 'Programme France 3 ce soir' },
  { channelId: 'm6', label: 'Programme M6 ce soir' },
  { channelId: 'arte', label: 'Programme ARTE ce soir' },
  { channelId: 'tmc', label: 'Programme TMC ce soir' },
];

const addDaysToDateString = (dateStr: string, days: number): string => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().split('T')[0];
};

const getProgramSlugLegacy = (title: string): string => {
  const ascii = (title || '')
    .toLowerCase()
    .split('')
    .filter(ch => ch.charCodeAt(0) < 128)
    .join('');
  return ascii
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

const buildBootstrapChannelFallback = (
  channelId: string | null | undefined,
  programs: any[] | null | undefined
): Channel | null => {
  if (!channelId || !Array.isArray(programs) || programs.length === 0) {
    return null;
  }

  const matchingPrograms = programs.filter((program) => String(program?.channel_id || '') === channelId);
  const fallbackPrograms = matchingPrograms.length > 0
    ? matchingPrograms
    : programs.every((program) => !program?.channel_id)
      ? programs
      : [];
  if (fallbackPrograms.length === 0) {
    return null;
  }

  const firstProgram = fallbackPrograms[0];

  return {
    id: channelId,
    name: firstProgram?.channels?.name || channelId,
    number: resolveChannelNumber(firstProgram?.channels?.channel_number, channelId, firstProgram?.channels?.name),
    logo: firstProgram?.channels?.logo_url || null,
    type: 'Generalista',
    programs: fallbackPrograms.map((program) => ({
      id: String(program?.id || `${program?.channel_id || ''}|${program?.start_time || ''}|${program?.title || ''}`),
      title: program?.title || '',
      startTime: program?.start_time || '',
      endTime: program?.end_time || '',
      category: program?.genre || 'Général',
      description: program?.description || '',
      posterUrl: program?.poster_url || '',
      replayUrl: program?.replay_url || '',
      isLive: false,
    })),
  };
};

const App: React.FC = () => {
  const mainRef = useRef<HTMLElement | null>(null);
  const bootstrapData = getBootstrapData();
  const currentPath = typeof window !== 'undefined' ? normalizePathname(window.location.pathname) : '';
  const currentBootstrapData = normalizePathname(bootstrapData?.routePath || '') === currentPath ? bootstrapData : null;
  const bootstrapPrograms = currentBootstrapData?.programs ?? null;
  const bootstrapProgramsKey = currentBootstrapData?.routePath || '';

  const [filter, setFilter] = useState<TimeSlotFilter>(() => {
    if (currentBootstrapData?.filter) return currentBootstrapData.filter;
    return getInitialFilterFromUrl();
  });
  const [viewMode, setViewMode] = useState<TimeView>(() => {
    if (currentBootstrapData?.viewMode) return currentBootstrapData.viewMode;
    return getInitialViewModeFromUrl();
  });
  const [pageState, setPageState] = useState<PageState>(getInitialPageStateFromUrl);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showFavoriteButton, setShowFavoriteButton] = useState(false);
  const [lastUpdateValue, setLastUpdateValue] = useState<string | null>(
    typeof currentBootstrapData?.generatedAt === 'string' ? currentBootstrapData.generatedAt : null
  );

  const [programFallback, setProgramFallback] = useState<{ channel: Channel; program: Program } | null>(
    currentBootstrapData?.programFallback || null
  );

  const bootstrapChannelFallback = useMemo(() => (
    currentBootstrapData?.pageState?.type === 'channel'
      ? buildBootstrapChannelFallback(currentBootstrapData.pageState.channelId, bootstrapPrograms)
      : null
  ), [currentBootstrapData, bootstrapPrograms]);

  const pendingRouteChannelFallback = useMemo(() => (
    pageState.type === 'channel'
      ? buildBootstrapChannelFallback(pageState.channelId, bootstrapPrograms)
      : null
  ), [pageState, bootstrapPrograms]);

  const normalizeChannelKey = (value: unknown) =>
    String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const findChannelById = (id?: string | null) => {
    if (!id) return undefined;
    const normalized = normalizeChannelKey(id);
    return (
      channels.find(c => normalizeChannelKey(c.id) === normalized) ||
      channels.find(c => normalizeChannelKey(getChannelSlug(c.id)) === normalized) ||
      channels.find(c => normalizeChannelKey(c.name) === normalized) ||
      (bootstrapChannelFallback && (
        normalizeChannelKey(bootstrapChannelFallback.id) === normalized ||
        normalizeChannelKey(getChannelSlug(bootstrapChannelFallback.id)) === normalized ||
        normalizeChannelKey(bootstrapChannelFallback.name) === normalized
      ) ? bootstrapChannelFallback : undefined) ||
      (pendingRouteChannelFallback && (
        normalizeChannelKey(pendingRouteChannelFallback.id) === normalized ||
        normalizeChannelKey(getChannelSlug(pendingRouteChannelFallback.id)) === normalized ||
        normalizeChannelKey(pendingRouteChannelFallback.name) === normalized
      ) ? pendingRouteChannelFallback : undefined)
    );
  };

  useEffect(() => {
    if (pageState.type !== 'program') {
      setProgramFallback(null);
    }
  }, [pageState.type, pageState.programId, pageState.channelId]);

  // Calculate time range for homepage based on viewMode
  const timeRange = useMemo(() => {
    // Round current time to nearest 15 minutes to avoid redundant fetches
    const now = new Date();
    const roundedMinutes = Math.floor(now.getMinutes() / 15) * 15;
    const stableNow = new Date(now);
    stableNow.setMinutes(roundedMinutes, 0, 0);
    const nowTime = stableNow.getTime();

    if (viewMode === 'now') {
      // For "maintenant": -2 hours to +6 hours (ensure next program is included)
      const startTime = new Date(nowTime - (2 * 60 * 60 * 1000));
      const endTime = new Date(nowTime + (6 * 60 * 60 * 1000));
      return { startTime: startTime.toISOString(), endTime: endTime.toISOString() };
    } else if (viewMode === 'tonight') {
      // For "ce-soir": 18:00 today to 02:00 tomorrow
      const tonightStart = new Date(stableNow);
      tonightStart.setHours(18, 0, 0, 0);
      const tonightEnd = new Date(tonightStart);
      tonightEnd.setDate(tonightEnd.getDate() + 1);
      tonightEnd.setHours(2, 0, 0, 0);
      return { startTime: tonightStart.toISOString(), endTime: tonightEnd.toISOString() };
    } else if (viewMode === 'tomorrow') {
      // For "demain": 00:00 to 23:59 tomorrow
      const tomorrowStart = new Date(stableNow);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      tomorrowStart.setHours(0, 0, 0, 0);
      const tomorrowEnd = new Date(tomorrowStart);
      tomorrowEnd.setHours(23, 59, 59, 999);
      return { startTime: tomorrowStart.toISOString(), endTime: tomorrowEnd.toISOString() };
    }

    // Default: -2 to +6 hours for homepage
    const startTime = new Date(nowTime - (2 * 60 * 60 * 1000));
    const endTime = new Date(nowTime + (6 * 60 * 60 * 1000));
    return { startTime: startTime.toISOString(), endTime: endTime.toISOString() };
  }, [viewMode, currentTime]);

  // Data Fetching - fetch programs based on time range or channel-specific
  const channelProgramsParams = useMemo(() => {
    // Handle program-loading state: load programs for channel to find the program
    if (pageState.type === 'program-loading') {
      // We need to find the channel first, then load its programs
      // For now, return null and handle in useEffect
      return null;
    }

    // When viewing a program page, also load programs for that channel
    // This ensures the program is available in the channels array
    if (pageState.type === 'program' && pageState.channelId) {
      if (pageState.programDate) {
        return {
          channelId: pageState.channelId,
          date: pageState.programDate
        };
      }

      const today = getTodayInParis();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      const startTime = new Date(today + 'T00:00:00').toISOString();
      const endTime = new Date(tomorrowStr + 'T23:59:59').toISOString();
      return {
        channelId: pageState.channelId,
        startTime,
        endTime
      };
    }

    if (pageState.type === 'channel' && pageState.channelId) {
      // For channel pages, calculate time range based on channelViewMode
      const now = new Date();
      const nowTime = now.getTime();
      const channelViewMode = pageState.channelViewMode || 'aujourdhui';

      if (channelViewMode === 'maintenant') {
        // -2 hours to +4 hours
        const startTime = new Date(nowTime - (2 * 60 * 60 * 1000));
        const endTime = new Date(nowTime + (4 * 60 * 60 * 1000));
        return {
          channelId: pageState.channelId,
          endTime: endTime.toISOString(),
          minEndTime: new Date().toISOString()
        };
      } else if (channelViewMode === 'ce-soir') {
        // 18:00 today to 02:00 tomorrow
        const tonightStart = new Date(now);
        tonightStart.setHours(18, 0, 0, 0);
        const tonightEnd = new Date(tonightStart);
        tonightEnd.setDate(tonightEnd.getDate() + 1);
        tonightEnd.setHours(2, 0, 0, 0);
        return {
          channelId: pageState.channelId,
          startTime: tonightStart.toISOString(),
          endTime: tonightEnd.toISOString()
        };
      } else if (channelViewMode === 'demain') {
        // 00:00 to 23:59 tomorrow
        const tomorrowStart = new Date(now);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        tomorrowStart.setHours(0, 0, 0, 0);
        const tomorrowEnd = new Date(tomorrowStart);
        tomorrowEnd.setHours(23, 59, 59, 999);
        return {
          channelId: pageState.channelId,
          startTime: tomorrowStart.toISOString(),
          endTime: tomorrowEnd.toISOString()
        };
      } else {
        // aujourdhui: focus on the useful part of the current day instead of the whole raw grid
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        return {
          channelId: pageState.channelId,
          endTime: endOfDay.toISOString(),
          minEndTime: new Date(nowTime - (90 * 60 * 1000)).toISOString(),
        };
      }
    }
    return null;
  }, [pageState.type, pageState.channelId, pageState.channelViewMode, pageState.programDate, pageState.programId]);

  const baseProgramsParams = channelProgramsParams || {
    startTime: timeRange.startTime,
    endTime: timeRange.endTime
  };

  const recommenderProgramsParams = useMemo(() => {
    if (pageState.type !== 'recommender') return null;

    const now = new Date();
    const endOfWindow = new Date(now);
    endOfWindow.setDate(endOfWindow.getDate() + 1);
    endOfWindow.setHours(2, 0, 0, 0);

    return {
      startTime: now.toISOString(),
      endTime: endOfWindow.toISOString(),
    };
  }, [pageState.type]);

  const programFields = pageState.type === 'home'
    ? 'id, channel_id, title, start_time, end_time, genre, poster_url, replay_url'
    : undefined;

  const cacheTtlMs = pageState.type === 'home'
    ? (viewMode === 'now' ? 60000 : 300000)
    : pageState.type === 'channel'
      ? 300000
      : 300000;

  const isHomePage = pageState.type === 'home';
  const isSearchPage = pageState.type === 'search';
  const isRecommenderPage = pageState.type === 'recommender';
  const shouldFetchPrograms = isHomePage || isSearchPage || isRecommenderPage || pageState.type === 'channel' || pageState.type === 'program';
  const useLiveFastLoading = isHomePage && viewMode === 'now';
  // Hotfix: disable progressive loading for non-live home to avoid repeated heavy queries.
  const useProgressiveHomeLoading = false;
  const hasBootstrapPrograms = Array.isArray(bootstrapPrograms) && bootstrapPrograms.length > 0;
  const bootstrapFilter = currentBootstrapData?.filter || 'Tous';
  const bootstrapViewMode = currentBootstrapData?.viewMode || 'tonight';
  const isMatchingHomeBootstrapSnapshot = isHomePage
    && hasBootstrapPrograms
    && bootstrapFilter === filter
    && bootstrapViewMode === viewMode;
  const skipRuntimeFetchWithBootstrap = (pageState.type === 'channel' && !!bootstrapChannelFallback)
    || (isMatchingHomeBootstrapSnapshot && !useLiveFastLoading);

  const effectiveProgramsParams = isRecommenderPage && recommenderProgramsParams
    ? recommenderProgramsParams
    : baseProgramsParams;

  const programsQueryBase = (isHomePage || isSearchPage || isRecommenderPage)
    ? {
      ...effectiveProgramsParams,
      ...(isHomePage && filter !== 'Tous'
        ? {
          categorySlug: getCategorySlug(filter),
        }
        : {}),
      // For "now": include programs still on air even if they started earlier
      ...(isHomePage && viewMode === 'now'
        ? {
          // Keep live query bounded in time to avoid DB timeouts.
          startTime: new Date(currentTime.getTime() - (8 * 60 * 60 * 1000)).toISOString(),
          endTime: timeRange.endTime,
          minEndTime: currentTime.toISOString()
        }
        : {}),
      pageSize: isSearchPage ? 300 : isRecommenderPage ? 1000 : isHomePage && viewMode === 'tonight' ? 1000 : 400,
      maxPages: isSearchPage ? 3 : isRecommenderPage ? 6 : isHomePage && viewMode === 'tonight' ? 4 : 2,
      maxPrograms: isSearchPage ? 900 : isRecommenderPage ? 6000 : isHomePage && viewMode === 'tonight' ? 4000 : 800,
      programFields,
      cacheTtlMs,
    }
    : { ...effectiveProgramsParams, cacheTtlMs };

  const {
    programs: priorityPrograms,
    loading: priorityLoading
  } = usePrograms((useProgressiveHomeLoading || useLiveFastLoading)
    ? {
      ...programsQueryBase,
      channelIds: HOME_PRIORITY_CHANNEL_IDS,
      splitChannelQueries: true,
      pageSize: 400,
      maxPages: 2,
      maxPrograms: 2500,
      initialData: useLiveFastLoading ? bootstrapPrograms : null,
      initialDataKey: useLiveFastLoading ? bootstrapProgramsKey : '',
      skipFetchIfInitialData: useLiveFastLoading && hasBootstrapPrograms,
    }
    : { enabled: false }
  );

  const {
    programs: secondaryPrograms,
    loading: secondaryLoading
  } = usePrograms(useProgressiveHomeLoading
    ? {
      ...programsQueryBase,
      excludeChannelIds: HOME_PRIORITY_CHANNEL_IDS,
      enabled: !priorityLoading,
    }
    : { enabled: false }
  );

  const {
    programs: liveExtraProgramsA,
    loading: liveExtraLoadingA
  } = usePrograms(useLiveFastLoading
    ? {
      ...programsQueryBase,
      channelIds: LIVE_EXTRA_CHANNEL_IDS_A,
      splitChannelQueries: true,
      pageSize: 400,
      maxPages: 2,
      maxPrograms: 1200,
      enabled: !priorityLoading,
    }
    : { enabled: false }
  );

  const {
    programs: liveExtraProgramsB,
    loading: liveExtraLoadingB
  } = usePrograms(useLiveFastLoading
    ? {
      ...programsQueryBase,
      channelIds: LIVE_EXTRA_CHANNEL_IDS_B,
      splitChannelQueries: true,
      pageSize: 400,
      maxPages: 2,
      maxPrograms: 1200,
      enabled: !priorityLoading,
    }
    : { enabled: false }
  );

  const {
    programs: liveBackgroundPrograms,
    loading: liveBackgroundLoading
  } = usePrograms(useLiveFastLoading
    ? {
      ...programsQueryBase,
      // Start full live fetch after fast lanes, then merge to show all channels.
      enabled: !priorityLoading && !liveExtraLoadingA && !liveExtraLoadingB,
      splitChannelQueries: false,
      pageSize: 1000,
      maxPages: 10,
      maxPrograms: 12000,
    }
    : { enabled: false }
  );

  // Sur pagine programme: pas de fetch massif - on a déjà le programme (programFallback)
  // et les alternatives viennent de loadRemoteSuggestions dans ProgramPage
  const skipProgramsFetchOnProgramPage = pageState.type === 'program-loading'
    || (pageState.type === 'program' && !hasBootstrapPrograms);
  const {
    programs: defaultPrograms,
    loading: defaultLoading
  } = usePrograms(shouldFetchPrograms && !useProgressiveHomeLoading && !useLiveFastLoading && !skipProgramsFetchOnProgramPage
    ? {
      ...programsQueryBase,
      initialData: bootstrapPrograms,
      initialDataKey: bootstrapProgramsKey,
      skipFetchIfInitialData: skipRuntimeFetchWithBootstrap,
    }
    : { enabled: false }
  );

  const rawPrograms = useMemo(() => {
    if (useLiveFastLoading) {
      const merged = [...priorityPrograms, ...liveExtraProgramsA, ...liveExtraProgramsB, ...liveBackgroundPrograms];
      const uniquePrograms = new Map<string, any>();

      merged.forEach((program: any) => {
        const fallbackKey = `${program?.channel_id || ''}|${program?.start_time || ''}|${program?.title || ''}`;
        const key = String(program?.id || fallbackKey);
        if (!uniquePrograms.has(key)) {
          uniquePrograms.set(key, program);
        }
      });

      return Array.from(uniquePrograms.values());
    }

    if (!useProgressiveHomeLoading) return defaultPrograms;
    const merged = [...priorityPrograms, ...secondaryPrograms];
    const uniquePrograms = new Map<string, any>();

    merged.forEach((program: any) => {
      const fallbackKey = `${program?.channel_id || ''}|${program?.start_time || ''}|${program?.title || ''}`;
      const key = String(program?.id || fallbackKey);
      if (!uniquePrograms.has(key)) {
        uniquePrograms.set(key, program);
      }
    });

    return Array.from(uniquePrograms.values());
  }, [useLiveFastLoading, useProgressiveHomeLoading, defaultPrograms, priorityPrograms, secondaryPrograms, liveExtraProgramsA, liveExtraProgramsB, liveBackgroundPrograms]);

  const hydratedPrograms = useMemo(() => {
    const merged = [...(Array.isArray(bootstrapPrograms) ? bootstrapPrograms : []), ...(Array.isArray(rawPrograms) ? rawPrograms : [])];
    const uniquePrograms = new Map<string, any>();

    merged.forEach((program: any) => {
      const fallbackKey = `${program?.channel_id || ''}|${program?.start_time || ''}|${program?.title || ''}`;
      const key = String(program?.id || fallbackKey);
      if (!uniquePrograms.has(key)) {
        uniquePrograms.set(key, program);
      }
    });

    return Array.from(uniquePrograms.values());
  }, [bootstrapPrograms, rawPrograms]);

  const loading = shouldFetchPrograms && (useLiveFastLoading
    ? (priorityLoading && priorityPrograms.length === 0)
    : useProgressiveHomeLoading
    ? (priorityLoading && priorityPrograms.length === 0)
    : defaultLoading);

  const loadingMoreHomeChannels = useLiveFastLoading
    ? (!priorityLoading && (liveExtraLoadingA || liveExtraLoadingB || liveBackgroundLoading))
    : (useProgressiveHomeLoading && !priorityLoading && secondaryLoading);

  // Adapter: Convert raw Supabase data to App's internal Channel/Program structure
  const channels = useMemo(() => {
    if (!hydratedPrograms) return [];

    const channelMap = new Map<string, Channel>();

    // Custom Sort Order Map (User preference)
    const SORT_ORDER: Record<string, number> = {
      'tf1': 1,
      'france2': 2, 'france-2': 2,
      'france3': 3, 'france-3': 3,
      'canal': 4, 'canal-plus': 4,
      'france5': 5, 'france-5': 5,
      'm6': 6,
      'arte': 7,
      'w9': 9,
      'tmc': 10,
      'tfx': 11,
      'nrj12': 12,
      'lci': 13,
      'bfmtv': 14, 'bfm-tv': 14,
      'cnews': 15,
      'c8': 16,
      'gulli': 18,
    };

    hydratedPrograms.forEach((p: any) => {
      // Ensure channel_id is a string
      const channelId = String(p.channel_id || '');
      if (!channelId) return;

      // Create Channel if not exists
      if (!channelMap.has(channelId)) {
        channelMap.set(channelId, {
          id: channelId,
          name: p.channels?.name || channelId,
          number: resolveChannelNumber(p.channels?.channel_number, channelId, p.channels?.name),
          logo: p.channels?.logo_url || null,
          type: 'Generalista', // Default, logic to infer type can be added
          programs: []
        });
      }

      // Add Program
      const channel = channelMap.get(channelId);
      if (channel && p.id) {
        channel.programs.push({
          id: String(p.id),
          title: p.title || '',
          startTime: p.start_time || '',
          endTime: p.end_time || '',
          category: p.genre || 'Général',
          description: p.description || '',
          posterUrl: p.poster_url || '',
          replayUrl: p.replay_url || '',
          isLive: false // Calculated in render
        });
      }
    });

    // Convert to array and SORT by specific list, then by number
    return Array.from(channelMap.values()).sort((a, b) => {
      // Normalize ID for checking - ensure it's a string
      const idA = String(a.id || '').toLowerCase().replace(/\s/g, '');
      const idB = String(b.id || '').toLowerCase().replace(/\s/g, '');

      const orderA = SORT_ORDER[idA] || 999;
      const orderB = SORT_ORDER[idB] || 999;

      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.number - b.number;
    });
  }, [hydratedPrograms]);

  // Update clock every minute for progress bars
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Warm the heavy route chunks once the first screen is interactive.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const preloadRouteChunks = () => {
      import('./components/ChannelPage');
      import('./components/ProgramPage');
      import('./components/SearchPage');
      import('./components/Recommender');
      import('./components/Credits');
    };

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(preloadRouteChunks, { timeout: 1800 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(preloadRouteChunks, 1200);
    return () => window.clearTimeout(timeoutId);
  }, []);

  // Read the importer timestamp from the public pipeline report instead of querying Supabase.
  useEffect(() => {
    let isMounted = true;
    const fetchLastUpdate = async () => {
      try {
        const value = await fetchLatestImportTimestamp();
        if (value && isMounted) {
          setLastUpdateValue(value);
        }
      } catch (err) {
        console.warn('[App] Failed to fetch last update:', err);
      }
    };

    fetchLastUpdate();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredChannels = useMemo(() => {
    // Filter out channels that have no programs in the current view
    const channelsWithPrograms = channels.filter(channel => {
      if (!channel.programs || channel.programs.length === 0) return false;

      const now = currentTime;
      const nowTime = now.getTime();
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

      const isProgramInView = (program: Program) => {
        const start = new Date(program.startTime).getTime();
        const end = new Date(program.endTime).getTime();
        if (viewMode === 'now') {
          const twoHoursAgo = nowTime - (2 * 60 * 60 * 1000);
          const fourHoursLater = nowTime + (4 * 60 * 60 * 1000);
          return start < fourHoursLater && end > twoHoursAgo;
        }
        if (viewMode === 'tomorrow') {
          return start >= tomorrowStart.getTime() && start <= tomorrowEnd.getTime();
        }
        return start >= tonightStart.getTime() && start <= tonightEnd.getTime();
      };

      return channel.programs.some(isProgramInView);
    });

    if (filter === 'Tous') return channelsWithPrograms;

    const now = currentTime;
    const nowTime = now.getTime();
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

    const isProgramInView = (program: Program) => {
      const start = new Date(program.startTime).getTime();
      const end = new Date(program.endTime).getTime();
      if (viewMode === 'now') {
        // For "maintenant": show programs from -2 hours to +4 hours
        const twoHoursAgo = nowTime - (2 * 60 * 60 * 1000);
        const fourHoursLater = nowTime + (4 * 60 * 60 * 1000);
        // Include if program overlaps with the range (starts before end AND ends after start)
        return start < fourHoursLater && end > twoHoursAgo;
      }
      if (viewMode === 'tomorrow') {
        return start >= tomorrowStart.getTime() && start <= tomorrowEnd.getTime();
      }
      return start >= tonightStart.getTime() && start <= tonightEnd.getTime();
    };

    return channels.filter(channel =>
      channel.programs.some(program => isProgramInView(program) && programMatchesCategory(program.category, filter))
    );
  }, [filter, channels, currentTime, viewMode]);

  const featuredMobileChannels = useMemo(
    () => filteredChannels.slice(0, 10),
    [filteredChannels]
  );

  const remainingMobileChannels = useMemo(
    () => filteredChannels.slice(10),
    [filteredChannels]
  );

  const liveCount = useMemo(() => {
    return channels.filter(channel =>
      channel.programs.some(p => {
        const start = new Date(p.startTime);
        const end = new Date(p.endTime);
        return currentTime >= start && currentTime <= end;
      })
    ).length;
  }, [currentTime, channels]);

  const navigateToChannel = (channel: Channel, channelViewMode: ChannelViewMode = viewMode === 'now' ? 'maintenant' : viewMode === 'tomorrow' ? 'demain' : 'ce-soir') => {
    const channelUrl = getChannelUrl(channel.id, channel.isRadio || false, channelViewMode);
    window.history.pushState({}, '', channelUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
    const subView: TimeView =
      channelViewMode === 'ce-soir' ? 'tonight' :
        channelViewMode === 'demain' ? 'tomorrow' :
          'now';
    setShowFavoriteButton(false);
    setPageState({
      type: 'channel',
      channelId: channel.id,
      subView,
      channelViewMode
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToProgram = (channel: Channel, program: Program) => {
    const channelSlug = getChannelSlug(channel.id);
    const isRadio = channel.isRadio || false;
    const programUrl = isRadio
      ? `/radio/${channelSlug}/${getProgramSlugFromTitle(program.title)}`
      : getProgramUrl(channelSlug, program.title);
    // Treat leaf pages as MPA: force full reload to avoid stale SPA state on program pages.
    trackProgramView(program.title, channel.name);
    trackPageView(programUrl, `${program.title} - ${channel.name}`);
    window.location.assign(programUrl);
  };

  const navigateToRecommender = () => {
    window.history.pushState({}, '', '/recommandes');
    window.dispatchEvent(new PopStateEvent('popstate'));
    setShowFavoriteButton(false);
    setPageState({ type: 'recommender' });
    trackRecommender();
    trackPageView('/recommandes', 'Recommandés pour vous');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToNews = () => {
    window.history.pushState({}, '', NEWS_ROUTE);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setShowFavoriteButton(false);
    setPageState({ type: 'news' });
    trackPageView(NEWS_ROUTE, 'Actualités TV');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateHome = (category?: TimeSlotFilter, targetView?: TimeView) => {
    const safeCategory = typeof category === 'string' ? category : undefined;
    const resolvedView = safeCategory ? 'tonight' : (targetView || viewMode);
    const url = getHomeUrl(resolvedView, safeCategory && safeCategory !== 'Tous' ? safeCategory : undefined);
    window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setShowFavoriteButton(false);
    setPageState({ type: 'home', category: safeCategory });
    if (safeCategory) setFilter(safeCategory);
    else setFilter('Tous');
    setViewMode(resolvedView);
    trackPageView(url, resolvedView === 'now' ? 'Programme TNT en direct' : resolvedView === 'tomorrow' ? 'Programme TNT demain' : 'Programme TNT ce soir');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFilterChange = (newFilter: TimeSlotFilter) => {
    const url = newFilter !== 'Tous'
      ? `/${getCategorySlug(newFilter)}`
      : getHomeUrl('tonight');
    window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setFilter(newFilter);
    setViewMode('tonight');
    setPageState({ type: 'home', category: newFilter !== 'Tous' ? newFilter : undefined });
    trackFilterChange(newFilter);
    trackPageView(url, newFilter !== 'Tous' ? getCategorySeoTitle(newFilter) : 'Programme TNT ce soir');
  };

  const updateChannelSubview = (view: TimeView) => {
    if (pageState.type === 'channel') {
      const channel = findChannelById(pageState.channelId);
      if (channel) {
        const channelViewMode: ChannelViewMode =
          view === 'tonight' ? 'ce-soir' :
            view === 'tomorrow' ? 'demain' :
              'maintenant';
        navigateToChannel(channel, channelViewMode);
      }
    } else if (pageState.type === 'home') {
      const category = view === 'tonight' ? pageState.category : undefined;
      const newUrl = getHomeUrl(view, category);
      window.history.pushState({}, '', newUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
      setViewMode(view);
      setPageState({ type: 'home', category });
      trackPageView(
        newUrl,
        view === 'now'
          ? 'Programme TNT en direct'
          : view === 'tomorrow'
            ? 'Programme TNT demain'
            : (category ? getCategorySeoTitle(category) : 'Programme TNT ce soir')
      );
    } else {
      const newUrl = getHomeUrl(view);
      window.history.pushState({}, '', newUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
      setViewMode(view);
      setPageState({ type: 'home' });
      setFilter('Tous');
      trackPageView(newUrl, view === 'now' ? 'Programme TNT en direct' : view === 'tomorrow' ? 'Programme TNT demain' : 'Programme TNT ce soir');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Track initial page view
  useEffect(() => {
    trackPageView(window.location.pathname, document.title);
  }, []);

  // Track scroll depth per page (SPA-safe)
  useEffect(() => {
    const thresholds = [25, 50, 75, 100];
    const seen = new Set<number>();
    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        const doc = document.documentElement;
        const scrollTop = window.scrollY || doc.scrollTop;
        const scrollHeight = doc.scrollHeight - doc.clientHeight;
        if (scrollHeight <= 0) return;
        const percent = Math.round((scrollTop / scrollHeight) * 100);
        thresholds.forEach((t) => {
          if (percent >= t && !seen.has(t)) {
            seen.add(t);
            trackScrollDepth(t, window.location.pathname);
          }
        });
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [pageState.type, pageState.channelId, pageState.programId, pageState.category, pageState.channelViewMode, viewMode]);

  // Parse URL on mount and popstate
  useEffect(() => {
    // Don't parse URL if channels are still loading (empty array means loading)
    // Wait for channels to be loaded before trying to match programs
    if (loading || (channels.length === 0 && !bootstrapChannelFallback && !pendingRouteChannelFallback)) {
      return;
    }

    const parseUrl = () => {
      const pathname = normalizePathname(window.location.pathname);

      // Admin diagnostics
      if (pathname === '/admin-test') {
        setPageState({ type: 'admin-test' });
        return;
      }
      if (pathname === '/admin-url-inspection') {
        setPageState({ type: 'admin-url-inspection' });
        return;
      }

      // Parse channel URL
      if ((pathname === '/en-direct' || pathname === '/maintenant')) {
        setViewMode('now');
        setFilter('Tous');
        setPageState({ type: 'home' });
        return;
      }

      if (pathname === '/demain') {
        setViewMode('tomorrow');
        setFilter('Tous');
        setPageState({ type: 'home' });
        return;
      }

      if (pathname === '/ce-soir') {
        if (window.location.pathname === '/ce-soir' || window.location.pathname === '/ce-soir/') {
          window.history.replaceState({}, '', '/');
        }
        setViewMode('tonight');
        setFilter('Tous');
        setPageState({ type: 'home' });
        return;
      }

      if (pathname === '/recommandes') {
        setPageState({ type: 'recommender' });
        return;
      }

      if (pathname === NEWS_ROUTE || pathname === LEGACY_NEWS_ROUTE) {
        if (pathname === LEGACY_NEWS_ROUTE) {
          window.history.replaceState({}, '', NEWS_ROUTE);
        }
        setPageState({ type: 'news' });
        return;
      }

      const birthdayArticleMatch = pathname.match(/^\/anniversaire\/([^/]+)\/?$/);
      if (pathname === '/anniversaires-acteurs') {
        setPageState({ type: 'birthday-archive' });
        return;
      }
      if (pathname === '/anniversaire-du-jour') {
        setPageState({ type: 'birthday' });
        return;
      }
      if (birthdayArticleMatch) {
        setPageState({ type: 'birthday', slug: birthdayArticleMatch[1] });
        return;
      }

      if (pathname === '/recherche') {
        const urlParams = new URLSearchParams(window.location.search);
        const query = urlParams.get('qs') || '';
        if (query) {
          setPageState({ type: 'search', query });
          return;
        }
      }

      if (pathname === '/politique-cookies') {
        setPageState({ type: 'cookie-policy' });
        return;
      }

      if (pathname === '/conditions-generales') {
        setPageState({ type: 'terms' });
        return;
      }

      if (pathname === '/credits') {
        setPageState({ type: 'credits' });
        return;
      }

      const entityPath = parseEntityPath(pathname);
      if (entityPath) {
        if (entityPath.isIndex) {
          setPageState({ type: 'entity-index', entityType: entityPath.type });
          return;
        }
        setPageState({ type: 'entity', entityType: entityPath.type, slug: entityPath.slug || '' });
        return;
      }

      // Parse program URL
      const programUrl = parseProgramUrl(pathname);
      if (programUrl) {
        // GUARD: If we are already loading this exact program, do nothing
        if (pageState.type === 'program-loading' &&
          pageState.channelSlug === programUrl.channelSlug &&
          pageState.programSlug === programUrl.programSlug &&
          pageState.programAiringToken === programUrl.programAiringToken) {
          return;
        }

        // GUARD: If we are already viewing this program, do nothing (even if data reloading triggers this effect)
        if (pageState.type === 'program' &&
          pageState.channelSlug === programUrl.channelSlug &&
          pageState.programSlug === programUrl.programSlug &&
          pageState.programAiringToken === programUrl.programAiringToken) {
          return;
        }

        // GUARD: If we already determined this program is not found, do nothing
        if (pageState.type === 'notfound' &&
          pageState.channelSlug === programUrl.channelSlug &&
          pageState.programSlug === programUrl.programSlug &&
          pageState.programAiringToken === programUrl.programAiringToken) {
          return;
        }

        // First, try to find channel in already loaded channels
        let channel = findChannelById(programUrl.channelSlug);

        // If channel found, check if program exists in loaded programs
        if (channel && channel.programs.length > 0) {
          const program = channel.programs.find(p => {
            const programSlug = getProgramSlugFromTitle(p.title || '');
            const legacySlug = getProgramSlugLegacy(p.title || '');
            if (programSlug !== programUrl.programSlug && legacySlug !== programUrl.programSlug) {
              return false;
            }
            if (!programUrl.programAiringToken) {
              return true;
            }
            return getProgramAiringToken(p.startTime || '') === programUrl.programAiringToken;
          });
          if (program) {
            setPageState({
              type: 'program',
              channelId: channel.id,
              programId: program.id,
              channelSlug: programUrl.channelSlug,
              programSlug: programUrl.programSlug,
              programAiringToken: programUrl.programAiringToken,
            });
            return;
          }
        }

        // If program not found in loaded data, we need to load programs for this channel
        // Set a temporary state to trigger program loading, then retry
        // For now, set pageState to trigger loading, then we'll retry in next effect
        setPageState({
          type: 'program-loading',
          channelSlug: programUrl.channelSlug,
          programSlug: programUrl.programSlug,
          programAiringToken: programUrl.programAiringToken,
        });
        return;
      }

      if (pathname.startsWith('/programme/')) {
        setPageState({ type: 'notfound', notFoundType: 'program' });
        return;
      }

      const channelUrl = parseChannelUrl(pathname);
      if (channelUrl && channelUrl.channelId) {
        const channel = findChannelById(channelUrl.channelId);
        const fallbackChannel =
          bootstrapChannelFallback && bootstrapChannelFallback.id === channelUrl.channelId
            ? bootstrapChannelFallback
            : pendingRouteChannelFallback && pendingRouteChannelFallback.id === channelUrl.channelId
              ? pendingRouteChannelFallback
              : null;

        if (channel || fallbackChannel) {
          const resolvedChannel = channel || fallbackChannel!;
          const subView: TimeView = channelUrl.viewMode === 'ce-soir'
            ? 'tonight'
            : channelUrl.viewMode === 'demain'
              ? 'tomorrow'
              : 'now';
          setPageState({
            type: 'channel',
            channelId: resolvedChannel.id,
            subView,
            channelViewMode: channelUrl.viewMode
          });
          return;
        } else if (!loading && !bootstrapChannelFallback && !pendingRouteChannelFallback) {
          setPageState({ type: 'notfound', notFoundType: 'channel' });
          return;
        }
      }

      // Map URL paths to category filters (ce soir)
      const urlToCategory: Record<string, TimeSlotFilter> = {
        '/film-ce-soir': 'Films',
        '/series-ce-soir': 'Series',
        '/sport-ce-soir': 'Sport',
        '/documentaires-ce-soir': 'Documentaires',
        '/divertissement-ce-soir': 'Divertissement',
        '/infos-ce-soir': 'Info',
        '/jeunesse-ce-soir': 'Jeunesse',
        '/culture-ce-soir': 'Culture'
      };

      if (urlToCategory[pathname]) {
        const category = urlToCategory[pathname];
        setViewMode('tonight');
        setFilter(category);
        setPageState({ type: 'home', category });
        return;
      }

      // Default to home
      if (pathname === '/' || pathname === '') {
        setViewMode('tonight');
        setFilter('Tous');
        setPageState({ type: 'home' });
      }
    };

    parseUrl();
    window.addEventListener('popstate', parseUrl);
    return () => window.removeEventListener('popstate', parseUrl);
  }, [channels, loading, bootstrapChannelFallback, pendingRouteChannelFallback]);

  // Handle program-loading: when navigating directly to a program URL, load programs for that channel
  useEffect(() => {
    if (pageState.type !== 'program-loading') return;

    let cancelled = false;
    const expectedPathname = window.location.pathname;
    const expectedSearch = window.location.search;
    const isStale = () =>
      cancelled ||
      window.location.pathname !== expectedPathname ||
      window.location.search !== expectedSearch;

    const loadProgramForUrl = async () => {
      try {
        // Find channel by slug
        const { data: channelsData } = await supabase
          .from(CHANNELS_TABLE)
          .select('channel_id, name, logo_url, channel_number')
          .limit(500);

        if (isStale()) return;

        if (!channelsData) {
          if (isStale()) return;
          setPageState({
            type: 'notfound',
            notFoundType: 'program',
            channelSlug: pageState.channelSlug,
            programSlug: pageState.programSlug,
            programAiringToken: pageState.programAiringToken,
          });
          return;
        }

        const foundChannel = channelsData.find(c => {
          const slug = getChannelSlug(String(c.channel_id || ''));
          return slug.toLowerCase() === String(pageState.channelSlug || '').toLowerCase();
        });

        if (!foundChannel) {
          if (isStale()) return;
          setPageState({
            type: 'notfound',
            notFoundType: 'program',
            channelSlug: pageState.channelSlug,
            programSlug: pageState.programSlug,
            programAiringToken: pageState.programAiringToken,
          });
          return;
        }

        const today = getTodayInParis();
        const startDate = addDaysToDateString(today, -PROGRAM_LOOKBACK_DAYS);
        const endDate = addDaysToDateString(today, PROGRAM_LOOKAHEAD_DAYS);

        const selectBestMatch = (items: any[]) => {
          if (!items || !items.length) return null;
          const now = new Date();
          const withTimes = items.filter(p => p.start_time && p.end_time);
          const isLive = (p: any) => {
            const start = new Date(p.start_time);
            const end = new Date(p.end_time);
            return now >= start && now <= end;
          };
          const live = withTimes.find(isLive);
          if (live) return live;

          const upcoming = withTimes
            .filter(p => new Date(p.start_time) >= now)
            .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0];
          if (upcoming) return upcoming;

          const recent = withTimes
            .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())[0];
          return recent || items[0];
        };

        const nowIso = new Date().toISOString();
        let foundProgram = null;
        const targetAiringToken = pageState.programAiringToken || null;

        if (targetAiringToken) {
          const selectFields = 'id, title, start_time, end_time, date, slug, description, genre, poster_url, replay_url';

          const { data: tokenCandidates, error: tokenCandidatesError } = await supabase
            .from(PROGRAMS_TABLE)
            .select(selectFields)
            .eq('channel_id', foundChannel.channel_id)
            .eq('slug', pageState.programSlug)
            .order('start_time', { ascending: true })
            .limit(500);

          if (tokenCandidatesError) {
            console.error('[App] Program lookup token candidates error:', tokenCandidatesError);
          }

          if (isStale()) return;

          if (tokenCandidates && tokenCandidates.length > 0) {
            foundProgram = tokenCandidates.find((candidate: any) =>
              getProgramAiringToken(String(candidate.start_time || '')) === targetAiringToken
            ) || null;
          }

          if (!foundProgram) {
            const targetDate = targetAiringToken.slice(0, 10);
            const { data: dateCandidates, error: dateCandidatesError } = await supabase
              .from(PROGRAMS_TABLE)
              .select(selectFields)
              .eq('channel_id', foundChannel.channel_id)
              .eq('date', targetDate)
              .order('start_time', { ascending: true })
              .limit(500);

            if (dateCandidatesError) {
              console.error('[App] Program lookup date candidates error:', dateCandidatesError);
            }

            if (isStale()) return;

            if (dateCandidates && dateCandidates.length > 0) {
              foundProgram = dateCandidates.find((candidate: any) => {
                const titleSlug = getProgramSlugFromTitle(String(candidate.title || ''));
                return titleSlug === pageState.programSlug &&
                  getProgramAiringToken(String(candidate.start_time || '')) === targetAiringToken;
              }) || null;
            }
          }

          if (!foundProgram) {
            if (isStale()) return;
            setPageState({
              type: 'notfound',
              notFoundType: 'program',
              channelSlug: pageState.channelSlug,
              programSlug: pageState.programSlug,
              programAiringToken: pageState.programAiringToken,
            });
            return;
          }
        }

        // 1) Exact slug match: pick live or upcoming first (closest in time).
        if (!foundProgram) {
          const { data: liveOrUpcoming, error: liveOrUpcomingError } = await supabase
          .from(PROGRAMS_TABLE)
          .select('id, title, start_time, end_time, date, slug, description, genre, poster_url, replay_url')
          .eq('channel_id', foundChannel.channel_id)
          .eq('slug', pageState.programSlug)
          .gte('end_time', nowIso)
          .order('start_time', { ascending: true })
          .limit(1)
          .maybeSingle();

          if (liveOrUpcomingError) {
            console.error('[App] Program lookup live/upcoming error:', liveOrUpcomingError);
          }

          if (isStale()) return;

          if (liveOrUpcoming) {
            foundProgram = liveOrUpcoming;
            console.log(`[App] Program lookup: channel=${foundChannel.channel_id}, slug=${pageState.programSlug}, strategy=live_or_upcoming, selected=${foundProgram.id}, date=${foundProgram.date}`);
          }
        }

        // 2) Exact slug match fallback: latest past episode.
        if (!foundProgram) {
          const { data: latestPast, error: latestPastError } = await supabase
            .from(PROGRAMS_TABLE)
            .select('id, title, start_time, end_time, date, slug, description, genre, poster_url, replay_url')
            .eq('channel_id', foundChannel.channel_id)
            .eq('slug', pageState.programSlug)
            .lt('end_time', nowIso)
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestPastError) {
            console.error('[App] Program lookup latest past error:', latestPastError);
          }

          if (isStale()) return;

          if (latestPast) {
            foundProgram = latestPast;
            console.log(`[App] Program lookup: channel=${foundChannel.channel_id}, slug=${pageState.programSlug}, strategy=latest_past, selected=${foundProgram.id}, date=${foundProgram.date}`);
          }
        }

        // 3) Safety net: broader exact-slug sample around date window.
        if (!foundProgram) {
          const { data: programData, error: programError } = await supabase
            .from(PROGRAMS_TABLE)
            .select('id, title, start_time, end_time, date, slug, description, genre, poster_url, replay_url')
            .eq('channel_id', foundChannel.channel_id)
            .eq('slug', pageState.programSlug)
            .order('start_time', { ascending: false })
            .limit(200);

          console.log(
            `[App] Program lookup (fallback sample): channel=${foundChannel.channel_id}, slug=${pageState.programSlug}, found=${programData?.length || 0}`,
            programError ? `ERROR: ${programError.message}` : ''
          );

          if (programError) {
            console.error('[App] Program lookup fallback sample error:', programError);
          }

          if (isStale()) return;

          if (programData && programData.length > 0) {
            const inRange = programData.filter(p => {
              const pDate = p.date;
              return pDate >= startDate && pDate <= endDate;
            });

            if (inRange.length > 0) {
              console.log(`[App] Found ${inRange.length} programs in date range [${startDate}, ${endDate}]`);
            } else {
              console.log(`[App] Found ${programData.length} programs but none in date range [${startDate}, ${endDate}]`);
              console.log('[App] Program dates found:', programData.map(p => p.date).slice(0, 5));
            }

            const candidates = inRange.length > 0 ? inRange : programData;
            foundProgram = selectBestMatch(candidates);
            console.log(`[App] Selected program from fallback sample: ${foundProgram?.id} (date: ${foundProgram?.date})`);
          }
        }

        if (!foundProgram) {
          // 2. Fallback: Try searching by title if slug is NULL or doesn't match
          // This handles cases where slug wasn't populated or differs slightly
          console.log(`[App] Exact slug match failed, trying fallback search...`);
          
          // First, try searching by title with the slug as search term
          const slugSearchTerm = pageState.programSlug.replace(/-/g, '%');
          const { data: titleSearchData } = await supabase
            .from(PROGRAMS_TABLE)
            .select('id, title, start_time, end_time, date, slug, poster_url, replay_url')
            .eq('channel_id', foundChannel.channel_id)
            .gte('date', startDate)
            .lte('date', endDate)
            .ilike('title', `%${slugSearchTerm}%`)
            .order('start_time', { ascending: true })
            .limit(50);

          if (titleSearchData && titleSearchData.length > 0) {
            if (isStale()) return;
            // Filter candidates where the generated slug matches the URL slug
            const exactMatches = titleSearchData.filter(p => {
              const generated = getProgramSlugFromTitle(p.title || '');
              return generated === pageState.programSlug;
            });

            if (exactMatches.length > 0) {
              foundProgram = selectBestMatch(exactMatches);
              console.log(`[App] Found program via title search + slug match: ${foundProgram?.id}`);
            } else {
              // Try fuzzy match as last resort
              const fuzzyMatches = titleSearchData.filter(p => {
                const generated = getProgramSlugFromTitle(p.title || '');
                // Allow partial match for similar slugs
                const urlParts = pageState.programSlug.split('-');
                const genParts = generated.split('-');
                const commonParts = urlParts.filter(p => genParts.includes(p));
                return commonParts.length >= Math.min(2, urlParts.length - 1);
              });

              if (fuzzyMatches.length > 0) {
                foundProgram = selectBestMatch(fuzzyMatches);
                console.log(`[App] Found program via fuzzy match: ${foundProgram?.id}`);
              }
            }
          }

          // 3. Final fallback: Broad search + precise JS filtering
          // If still not found, search using significant terms from the slug
          if (!foundProgram) {
            const slugParts = pageState.programSlug.split('-').filter(p => p.length > 2);
            
            // Try multiple search strategies:
            // 1. Search with original slug parts
            // 2. Search with apostrophe variations (dhiver -> d'hiver)
            const searchTerms: string[] = [];
            
            if (slugParts.length > 0) {
              // Original search term
              searchTerms.push(slugParts.slice(0, 3).join('%'));
              
              // Try adding apostrophes for common patterns (e.g., "dhiver" -> "d'hiver")
              const apostrophePatterns: Record<string, string> = {
                'dhiver': "d'hiver",
                'dete': "d'été",
                'hiver': "d'hiver",
                'ete': "d'été"
              };
              
              const modifiedParts = slugParts.map(part => {
                const lower = part.toLowerCase();
                if (apostrophePatterns[lower]) {
                  return apostrophePatterns[lower];
                }
                // Check if part starts with 'd' and next char is vowel (common French pattern)
                if (lower.startsWith('d') && lower.length > 1 && /[aeiouh]/.test(lower[1])) {
                  return `d'${lower.slice(1)}`;
                }
                return part;
              });
              
              if (modifiedParts.join('-') !== slugParts.join('-')) {
                searchTerms.push(modifiedParts.slice(0, 3).join('%'));
              }
            }

            // Try each search term
            for (const searchTerm of searchTerms) {
              if (!searchTerm) continue;
              
              // Search both in title and slug fields (slug might have different format)
              const { data: broadData } = await supabase
                .from(PROGRAMS_TABLE)
                .select('id, title, start_time, end_time, date, slug, poster_url, replay_url')
                .eq('channel_id', foundChannel.channel_id)
                .gte('date', startDate)
                .lte('date', endDate)
                .or(`title.ilike.%${searchTerm}%,slug.ilike.%${searchTerm}%`)
                .order('start_time', { ascending: true })
                .limit(50); // Fetch more candidates

              if (broadData && broadData.length > 0) {
                if (isStale()) return;
                // Filter candidates where the generated slug matches the URL slug
                const exactMatches = broadData.filter(p => {
                  const generated = getProgramSlugFromTitle(p.title || '');
                  // Allow exact match or if one contains the other (for safety)
                  return generated === pageState.programSlug ||
                    generated.includes(pageState.programSlug) ||
                    pageState.programSlug.includes(generated);
                });

                if (exactMatches.length > 0) {
                  foundProgram = selectBestMatch(exactMatches);
                  console.log(`[App] Found program via broad search: ${foundProgram?.id}`);
                  break; // Found a match, stop searching
                } else if (!foundProgram) {
                  // Keep the first broad match as fallback
                  foundProgram = selectBestMatch(broadData);
                }
              }
            }
          }
        }


        if (foundProgram) {
          const fallbackChannel: Channel = {
            id: String(foundChannel.channel_id),
            name: foundChannel.name || String(foundChannel.channel_id),
            number: resolveChannelNumber(foundChannel.channel_number, foundChannel.channel_id, foundChannel.name),
            logo: foundChannel.logo_url || null,
            type: 'Generalista',
            programs: [],
          };

          const fallbackProgram: Program = {
            id: String(foundProgram.id),
            title: foundProgram.title || '',
            startTime: foundProgram.start_time || '',
            endTime: foundProgram.end_time || '',
            category: foundProgram.genre || 'Général',
            description: foundProgram.description || '',
            posterUrl: foundProgram.poster_url || '',
            replayUrl: foundProgram.replay_url || '',
            isLive: false,
          };

          if (isStale()) return;
          setProgramFallback({ channel: fallbackChannel, program: fallbackProgram });
          if (isStale()) return;
          setPageState({
            type: 'program',
            channelId: foundChannel.channel_id,
            programId: String(foundProgram.id),
            programDate: foundProgram.date || undefined,
            channelSlug: pageState.channelSlug,
            programSlug: pageState.programSlug,
            programAiringToken: pageState.programAiringToken,
          });
        } else {
          if (isStale()) return;
          setPageState({
            type: 'notfound',
            notFoundType: 'program',
            channelSlug: pageState.channelSlug,
            programSlug: pageState.programSlug,
            programAiringToken: pageState.programAiringToken,
          });
        }
      } catch (error) {
        console.error('[App] Error in loadProgramForUrl:', error);
        if (isStale()) return;
        setPageState({
          type: 'notfound',
          notFoundType: 'program',
          channelSlug: pageState.channelSlug,
          programSlug: pageState.programSlug,
          programAiringToken: pageState.programAiringToken,
        });
      }
    };

    loadProgramForUrl();

    return () => {
      cancelled = true;
    };
  }, [pageState.type, pageState.channelSlug, pageState.programSlug, pageState.programAiringToken]);

  // SEO for homepage and primary listings
  const siteOrigin = window.location.origin;
  const isCategoryPage = pageState.type === 'home' && pageState.category && pageState.category !== 'Tous';
  const canonicalPath = isCategoryPage
    ? `/${getCategorySlug(pageState.category)}`
    : getHomeUrl(viewMode);
  const canonicalUrl = `${siteOrigin}${canonicalPath}`;

  let seoTitle = '';
  let seoDescription = '';
  let seoImage = `${siteOrigin}/static/img/programmecesoir-social.jpg`;

  if (isCategoryPage) {
    seoTitle = `${getCategorySeoTitle(pageState.category)} - Programme Ce Soir`;
    seoDescription = getCategorySeoDescription(pageState.category);
  } else {
    const seoType = viewMode === 'now' ? 'now' : viewMode === 'tomorrow' ? 'tomorrow' : 'home';
    const seo = getSeoForPage({ type: seoType, canonicalUrl });
    seoTitle = seo.title;
    seoDescription = seo.description;
    seoImage = seo.image;
  }

  useSEO({
    title: seoTitle,
    description: seoDescription,
    url: canonicalPath,
    canonicalUrl,
    image: seoImage,
    category: isCategoryPage ? pageState.category : undefined,
  });

  // Add homepage and category-specific structured data
  useEffect(() => {
    if (pageState.type !== 'home') return;

    const siteUrl = window.location.origin;
    const now = new Date();
    const nowTime = now.getTime();
    const soonWindowMs = 30 * 60 * 1000;

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

    const isProgramInView = (program: Program) => {
      const start = new Date(program.startTime).getTime();
      const end = new Date(program.endTime).getTime();
      if (viewMode === 'now') {
        const isLive = nowTime >= start && nowTime <= end;
        const startsSoon = start > nowTime && start <= nowTime + soonWindowMs;
        return isLive || startsSoon;
      }
      if (viewMode === 'tomorrow') {
        return start >= tomorrowStart.getTime() && start <= tomorrowEnd.getTime();
      }
      return start >= tonightStart.getTime() && start <= tonightEnd.getTime();
    };

    const category = pageState.category && pageState.category !== 'Tous' ? pageState.category : null;

    const entries: { program: Program; channel: Channel; programUrl: string; image: string }[] = [];
    channels.forEach(channel => {
      const filtered = channel.programs.filter(program => {
        if (!isProgramInView(program)) return false;
        if (!category) return true;
        return programMatchesCategory(program.category, category);
      });

      const limit = category ? 20 : 10;
      filtered.slice(0, limit).forEach(program => {
        const channelSlug = getChannelSlug(channel.id);
        const programPath = channel.isRadio
          ? `/radio/${channelSlug}/${getProgramSlugFromTitle(program.title)}`
          : getProgramUrl(channelSlug, program.title);
        const programUrl = `${siteUrl}${programPath}`;
        entries.push({
          program,
          channel,
          programUrl,
          image: channel.logo || `${siteUrl}/static/img/programmecesoir-social.jpg`,
        });
      });
    });

    const truncate = (value: string, max = 160) => {
      const cleaned = (value || '').replace(/\s+/g, ' ').trim();
      if (!cleaned) return '';
      if (cleaned.length <= max) return cleaned;
      return `${cleaned.slice(0, max - 1).trim()}…`;
    };

    // Keep ItemList URLs unique across listing pages.
    const uniqueEntriesByUrl = new Map<string, { program: Program; channel: Channel; programUrl: string; image: string }>();
    entries.forEach((entry) => {
      if (!uniqueEntriesByUrl.has(entry.programUrl)) {
        uniqueEntriesByUrl.set(entry.programUrl, entry);
      }
    });
    const limitedEntries = Array.from(uniqueEntriesByUrl.values()).slice(0, category ? 40 : 30);

    const itemListElement = limitedEntries.map((entry, index) => {
      const { program, channel, programUrl, image } = entry;
      const startDate = new Date(program.startTime).toISOString();
      const endDate = new Date(program.endTime).toISOString();
      const isLive = nowTime >= new Date(program.startTime).getTime() && nowTime <= new Date(program.endTime).getTime();
      return {
        '@type': 'ListItem',
        position: index + 1,
        item: { '@id': `${programUrl}#broadcast` },
      };
    });

    const listName = category
      ? `Programme ${category} ce soir`
      : viewMode === 'now'
        ? 'Programme TNT maintenant'
        : viewMode === 'tomorrow'
          ? 'Programme TNT de demain'
          : 'Programme TNT ce soir';

    const listDescription = category
      ? `Liste des programmes ${category} diffusés ce soir sur la TNT`
      : viewMode === 'now'
        ? 'Liste des programmes TNT actuellement diffusés ou imminents'
        : viewMode === 'tomorrow'
          ? 'Liste des programmes TNT de demain'
          : 'Liste des programmes TNT de ce soir';

    const structuredDataArray: any[] = [
      ...(category ? [] : buildSiteGraph(siteUrl)),
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: siteUrl,
          },
          ...(category ? [{
            '@type': 'ListItem',
            position: 2,
            name: category,
            item: `${siteUrl}/${getCategorySlug(category as TimeSlotFilter)}`,
          }] : []),
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': `${canonicalUrl}#collectionpage`,
        name: listName,
        description: listDescription,
        url: canonicalUrl,
        inLanguage: 'fr-FR',
        isPartOf: { '@id': `${siteUrl}/#website` },
        mainEntity: { '@id': `${canonicalUrl}#program-list` },
        about: {
          '@type': 'Thing',
          name: category
            ? category
            : viewMode === 'now'
              ? 'Programme TV en direct'
              : viewMode === 'tomorrow'
                ? 'Programme TV de demain'
                : 'Programme TV ce soir',
        },
      },
    ];

    if (itemListElement.length > 0) {
      structuredDataArray.push({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        '@id': `${canonicalUrl}#program-list`,
        name: listName,
        description: listDescription,
        numberOfItems: itemListElement.length,
        itemListElement,
      });
      limitedEntries.forEach(({ program, channel, programUrl, image }) => {
        const channelPath = getChannelUrl(channel.id, channel.isRadio, 'aujourdhui');
        structuredDataArray.push(...buildProgramWorkGraph({
          siteUrl,
          fullUrl: programUrl,
          title: program.title,
          description: truncate(program.description || `${program.title} sur ${channel.name}`),
          image,
          category: program.category,
          startTime: program.startTime,
          endTime: program.endTime,
          channelName: channel.name,
          channelUrl: channelPath,
        }));
      });
    }

    if (!category && viewMode === 'tonight') {
      structuredDataArray.push(buildFaqGraph(HOME_FAQ_DATA));
    }

    const oldScripts = document.querySelectorAll('script[data-seo="homepage"]');
    oldScripts.forEach(script => script.remove());

    structuredDataArray.forEach(data => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo', 'homepage');
      script.textContent = JSON.stringify(data);
      document.head.appendChild(script);
    });

    return () => {
      const scripts = document.querySelectorAll('script[data-seo="homepage"]');
      scripts.forEach(script => script.remove());
    };
  }, [pageState.type, pageState.category, channels, viewMode]);

  // Content rendering based on state
  const renderContent = () => {
    if (loading && channels.length === 0) {
      return <div className="flex h-screen items-center justify-center">Chargement...</div>;
    }

    if (pageState.type === 'recommender') {
      return (
        <Recommender
          channels={channels}
          onProgramClick={(channel, program) => {
            trackProgramClick(program.title, channel.name);
            navigateToProgram(channel, program);
          }}
        />
      );
    }

    if (pageState.type === 'search') {
      return (
        <SearchPage
          searchQuery={pageState.query}
          channels={channels}
          onProgramClick={(channel, program) => {
            trackProgramClick(program.title, channel.name);
            navigateToProgram(channel, program);
          }}
          onChannelClick={(channel) => {
            trackChannelClick(channel.name);
            navigateToChannel(channel);
          }}
          onBack={navigateHome}
        />
      );
    }

    if (pageState.type === 'cookie-policy') {
      return (
        <CookiePolicy
          onBack={navigateHome}
        />
      );
    }

    if (pageState.type === 'terms') {
      return (
        <TermsAndConditions
          onBack={navigateHome}
        />
      );
    }

    if (pageState.type === 'credits') {
      return (
        <Credits
          onBack={navigateHome}
        />
      );
    }

    if (pageState.type === 'birthday') {
      return (
        <BirthdayArticlePage
          slug={pageState.slug}
          initialData={
            pageState.slug
              ? currentBootstrapData?.birthdayArticle || null
              : (isBirthdayPayloadCurrent(currentBootstrapData?.birthdayArticle || null)
                ? currentBootstrapData?.birthdayArticle || null
                : null)
          }
        />
      );
    }

    if (pageState.type === 'birthday-archive') {
      return (
        <BirthdayArchivePage
          initialData={currentBootstrapData?.birthdayArchive || null}
        />
      );
    }

    if (pageState.type === 'news') {
      return <NewsPage initialData={currentBootstrapData?.newsPage || null} />;
    }

    if (pageState.type === 'entity-index') {
      return (
        <EntityIndexPage
          type={pageState.entityType}
          initialData={currentBootstrapData?.entityIndex || null}
          initialBirthdayArticle={
            pageState.entityType === 'actor' &&
            isBirthdayPayloadCurrent(currentBootstrapData?.birthdayArticle || null)
              ? currentBootstrapData?.birthdayArticle || null
              : null
          }
        />
      );
    }

    if (pageState.type === 'entity') {
      const initialEntity = currentBootstrapData?.entity || null;
      if (pageState.entityType === 'film') {
        return <FilmEntityPage slug={pageState.slug} initialData={initialEntity?.type === 'film' ? initialEntity : null} />;
      }
      if (pageState.entityType === 'series') {
        return <SeriesEntityPage slug={pageState.slug} initialData={initialEntity?.type === 'series' ? initialEntity : null} />;
      }
      return <ActorEntityPage slug={pageState.slug} initialData={initialEntity?.type === 'actor' ? initialEntity : null} />;
    }

    if (pageState.type === 'admin-test') {
      return <AdminTest />;
    }

    if (pageState.type === 'admin-url-inspection') {
      return <AdminUrlInspection />;
    }

    if (pageState.type === 'notfound') {
      return (
        <NotFoundPage
          type={pageState.notFoundType}
          onBack={navigateHome}
        />
      );
    }

    if (pageState.type === 'channel') {
      const channel =
        findChannelById(pageState.channelId) ||
        pendingRouteChannelFallback ||
        bootstrapChannelFallback;
      if (!channel) {
        if (loading || channels.length === 0) {
          return <div className="flex h-screen items-center justify-center">Chargement de la chaîne...</div>;
        }
        return (
          <NotFoundPage
            type="channel"
            onBack={navigateHome}
          />
        );
      }

      return (
        <ChannelPage
          channel={channel}
          allChannels={channels}
          view={pageState.subView}
          channelViewMode={pageState.channelViewMode || 'aujourdhui'}
          onViewChange={updateChannelSubview}
          onBack={navigateHome}
          onProgramClick={(p) => {
            trackProgramClick(p.title, channel.name);
            navigateToProgram(channel, p);
          }}
          onChannelClick={(c) => {
            trackChannelClick(c.name);
            navigateToChannel(c);
          }}
          onNavigateToView={(viewMode) => navigateToChannel(channel, viewMode)}
        />
      );
    }

    if (pageState.type === 'program-loading') {
      return <div className="flex h-screen items-center justify-center">Chargement du programme...</div>;
    }

    if (pageState.type === 'program') {
      const channel = findChannelById(pageState.channelId) || programFallback?.channel;
      const program = channel?.programs.find(p => p.id === pageState.programId)
        || (programFallback && programFallback.program.id === pageState.programId ? programFallback.program : undefined);
      if ((!channel || !program) && loading) {
        return <div className="flex h-screen items-center justify-center">Chargement du programme...</div>;
      }
      if (!channel || !program) {
        // If program not found in loaded channels, it might still be loading
        // Wait a bit and show loading, or show 410
        return (
          <NotFoundPage
            type="program"
            onBack={navigateHome}
          />
        );
      }

      return (
        <ProgramPage
          channel={channel}
          program={program}
          allChannels={channels}
          onBackToChannel={() => {
            trackChannelClick(channel.name);
            navigateToChannel(channel);
          }}
          onBackHome={navigateHome}
          onDescriptionVisibilityChange={(isVisible) => setShowFavoriteButton(isVisible)}
        />
      );
    }

    return (
      <>
        <Hero
          currentFilter={filter}
          onFilterChange={handleFilterChange}
          liveCount={liveCount}
          viewMode={viewMode}
          currentTime={currentTime}
        />

        <section className="container mx-auto px-4 py-8 sm:py-10 md:py-12">
          <div className="flex items-center justify-between gap-3 mb-6 md:mb-8">
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">
              {filter !== 'Tous'
                ? `Chaînes qui diffusent ${getFilterLabel(filter)} ${viewMode === 'tomorrow' ? 'demain' : viewMode === 'now' ? 'en direct' : 'ce soir'}`
                : viewMode === 'now'
                  ? 'Chaînes en direct'
                  : viewMode === 'tomorrow'
                    ? 'Programme de demain'
                    : 'Chaînes de ce soir'}
            </h2>
            <div className="hidden sm:flex items-center gap-2 text-sm text-slate-400 shrink-0">
              <span className={`w-3 h-3 rounded-full ${viewMode === 'now' ? 'bg-emerald-500 animate-pulse' : 'bg-orange-500'}`}></span>
              {viewMode === 'now' ? 'Mis à jour en temps réel' : viewMode === 'tomorrow' ? 'Guide de demain' : 'Prime time'}
            </div>
          </div>

          {loadingMoreHomeChannels && (
            <p className="text-sm text-slate-500 mb-4 md:mb-6">
              Chargement des autres chaînes en cours...
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredChannels.length > 0 ? (
              <>
                {featuredMobileChannels.map(channel => (
                  <ChannelCard
                    key={channel.id}
                    channel={channel}
                    viewMode={viewMode}
                    onClick={() => {
                      trackChannelClick(channel.name);
                      navigateToChannel(channel);
                    }}
                  />
                ))}

                {remainingMobileChannels.map(channel => (
                  <ChannelCard
                    key={channel.id}
                    channel={channel}
                    viewMode={viewMode}
                    onClick={() => {
                      trackChannelClick(channel.name);
                      navigateToChannel(channel);
                    }}
                  />
                ))}
              </>
            ) : (
              <div className="col-span-full py-16 md:py-20 text-center">
                <p className="text-slate-400 text-lg">Aucune chaîne trouvée.</p>
              </div>
            )}
          </div>
        </section>

        <section className="bg-slate-100 py-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-extrabold text-slate-900 mb-6">Guide TNT</h2>
              <p className="text-slate-600 leading-relaxed mb-10">
                Les liens ci-dessous concentrent les signaux SEO sur les pages head qui performent déjà en audience:
                direct, film, sport, demain et les grandes chaînes TNT.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="mb-4 text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Pages head prioritaires</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {HEAD_SEO_LINKS.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      className="group rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-base font-extrabold text-slate-900">{link.label}</span>
                        <span className="text-blue-600 transition group-hover:translate-x-1">→</span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">{link.description}</p>
                    </a>
                  ))}
                </div>
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="mb-4 text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Chaînes prioritaires</p>
                <div className="space-y-3">
                  {headTrafficChannels.map(({ channel, label }) => (
                    <a
                      key={channel.id}
                      href={getChannelUrl(channel.id, channel.isRadio || false, 'aujourdhui')}
                      onClick={(event) => {
                        event.preventDefault();
                        navigateToChannel(channel);
                      }}
                      className="flex w-full items-center justify-between rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50"
                    >
                      <div>
                        <p className="text-sm font-black text-slate-900">{label}</p>
                        <p className="text-xs font-medium text-slate-500">Accès direct à la grille de {channel.name}</p>
                      </div>
                      <span className="text-blue-600">→</span>
                    </a>
                  ))}
                </div>
                <div className="mt-6 rounded-[1.5rem] border border-blue-100 bg-blue-50 px-4 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-700">Action SEO</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">
                    Depuis les pages chaîne, renforcer en priorité les liens vers <strong>/en-direct</strong>, <strong>/film-ce-soir</strong>,
                    <strong> /sport-ce-soir</strong> et <strong>/demain</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {isRootHomepage && (
          <section aria-label="Questions fréquentes" className="bg-white py-16 border-t border-slate-200">
            <div className="container mx-auto px-4 max-w-4xl">
              <div className="mb-8">
                <h2 className="text-3xl font-extrabold text-slate-900 mb-3">Questions fréquentes</h2>
                <p className="text-slate-600">
                  Les réponses rapides aux questions les plus fréquentes sur le programme TV de ce soir et de demain.
                </p>
              </div>

              <div className="space-y-4">
                {HOME_FAQ_DATA.map(({ q, a }) => (
                  <details
                    key={q}
                    className="group rounded-2xl border border-slate-200 bg-slate-50 px-6 py-5 shadow-sm open:bg-white open:shadow-md"
                  >
                    <summary className="cursor-pointer list-none text-lg font-bold text-slate-900 flex items-center justify-between gap-4">
                      <span>{q}</span>
                      <span className="text-blue-600 transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <p className="mt-4 text-slate-700 leading-relaxed">{a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}
      </>
    );
  };

  // Handle save reminder for Header
  const handleSaveReminder = () => {
    if (pageState.type === 'program') {
      const channel = findChannelById(pageState.channelId);
      const program = channel?.programs.find(p => p.id === pageState.programId);
      if (channel && program) {
        const siteUrl = window.location.origin;
        const channelSlug = getChannelSlug(channel.id);
        const isRadio = channel.isRadio || false;
        const programUrl = isRadio
          ? `${siteUrl}/radio/${channelSlug}/${getProgramSlugFromTitle(program.title)}`
          : `${siteUrl}${getProgramUrl(channelSlug, program.title)}`;

        const startDate = new Date(program.startTime);
        const endDate = new Date(program.endTime);

        const icsOptions = {
          title: `Regarder ${program.title} sur ${channel.name}`,
          description: program.description || `${program.title} sur ${channel.name}`,
          startTime: startDate,
          endTime: endDate,
          location: channel.name,
          url: programUrl,
          reminderMinutes: 15,
        };

        // Detect mobile device
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (isMobile) {
          // On mobile, try to open Google Calendar web directly
          // This provides a better UX on Android devices
          openGoogleCalendar(icsOptions);
        } else {
          // On desktop, download ICS file
          downloadICS(icsOptions, `${program.title.replace(/[^a-z0-9]/gi, '_')}_${channel.name.replace(/[^a-z0-9]/gi, '_')}.ics`);
        }

        // Track the event
        trackSaveReminder(program.title, channel.name);
      }
    }
  };

  // Get current program and channel for Header
  const currentProgram = pageState.type === 'program'
    ? findChannelById(pageState.channelId)?.programs.find(p => p.id === pageState.programId)
    : undefined;
  const currentChannel = pageState.type === 'program'
    ? findChannelById(pageState.channelId)
    : undefined;
  const suspenseFallback = pageState.type === 'program' || pageState.type === 'program-loading'
    ? <div className="flex h-screen items-center justify-center">Chargement du programme...</div>
    : <div className="flex h-screen items-center justify-center">Chargement...</div>;
  const isRootHomepage = pageState.type === 'home' && !pageState.category && viewMode === 'tonight';
  const headTrafficChannels = useMemo(() => (
    HEAD_CHANNEL_LINKS
      .map(({ channelId, label }) => {
        const channel = findChannelById(channelId);
        return channel ? { channel, label } : null;
      })
      .filter((item): item is { channel: Channel; label: string } => Boolean(item))
  ), [channels, bootstrapChannelFallback, pendingRouteChannelFallback]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    const frame = window.requestAnimationFrame(() => {
      mainRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    pageState.type,
    pageState.type === 'channel' ? pageState.channelId : '',
    pageState.type === 'channel' ? pageState.channelViewMode || '' : '',
    pageState.type === 'program' ? pageState.programId : '',
    pageState.type === 'program-loading' ? pageState.programSlug : '',
    pageState.type === 'birthday' ? pageState.slug || 'today' : '',
    pageState.type === 'entity' ? `${pageState.entityType}:${pageState.slug}` : '',
    pageState.type === 'entity-index' ? pageState.entityType : '',
    pageState.type === 'search' ? pageState.query : '',
    pageState.type === 'home' ? pageState.category || '' : '',
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header
        activeView={
          pageState.type === 'recommender'
            ? 'recommender'
            : pageState.type === 'news'
              ? 'news'
              : (pageState.type === 'home' ? viewMode : 'now')
        }
        onViewChange={updateChannelSubview}
        onNavigateRecommender={navigateToRecommender}
        onNavigateNews={navigateToNews}
        onNavigateHome={navigateHome}
        isProgramPage={pageState.type === 'program'}
        showFavoriteButton={showFavoriteButton}
        channels={channels}
        onProgramClick={(channel, program) => {
          trackProgramClick(program.title, channel.name);
          navigateToProgram(channel, program);
        }}
        onChannelClick={(channel) => {
          trackChannelClick(channel.name);
          navigateToChannel(channel);
        }}
        currentProgram={currentProgram}
        currentChannel={currentChannel}
        onSaveReminder={handleSaveReminder}
      />

      <main ref={mainRef} tabIndex={-1} className="flex-grow outline-none">
        <Suspense fallback={suspenseFallback}>
          {renderContent()}
        </Suspense>
      </main>

      <Footer
        onNavigateHome={navigateHome}
        lastUpdate={lastUpdateValue}
        showLastUpdate={true}
      />
    </div>
  );
};

export default App;
