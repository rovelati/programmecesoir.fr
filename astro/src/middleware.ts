import { defineMiddleware } from 'astro:middleware';
import {
  CACHE_ONE_DAY,
  CACHE_ONE_HOUR,
  setCacheControl,
} from './utils/cachePolicy';

const PROGRAMME_PAGE = /^\/programme\/[^/]+\/.+/;
const ACTOR_PAGE = /^\/acteur\/[^/]+/;
/** Grilles chaîne peu volatiles : demain + ce-soir par chaîne */
const STATIC_DAILY = /^\/(demain|ce-soir)(?:\/|$)/;
const EN_DIRECT = /^\/en-direct(?:\/|$)/;

const CHANNEL_REDIRECTS: Record<string, string> = {
  'lcp-public-senat': 'lcp',
  'lequipe': 'la-chaine-lequipe',
  'culturebox': 'france-4',
  'c8': '',
  'nrj12': '',
  'nrj-12': '',
  'cherie-25': '',
  'cherie25': '',
};

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname.replace(/\/+$/, '') || '/';

  // 301 permanent redirects for legacy / defunct channel slugs (eliminates Bing/crawler 404s)
  const channelMatch = path.match(/^\/(?:(ce-soir|en-direct|demain)\/)?([a-z0-9-]+)$/);
  if (channelMatch) {
    const prefix = channelMatch[1];
    const slug = channelMatch[2];
    if (slug in CHANNEL_REDIRECTS) {
      const targetSlug = CHANNEL_REDIRECTS[slug];
      const targetPath = targetSlug
        ? (prefix ? `/${prefix}/${targetSlug}` : `/${targetSlug}`)
        : (prefix ? `/${prefix}` : '/');
      return context.redirect(targetPath, 301);
    }
  }

  const response = await next();
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  // Missing EPG entries may return in a later import; do not cache errors for a day.
  if (response.status >= 400) {
    response.headers.set('Cache-Control', 'public, max-age=0, s-maxage=60');
    return response;
  }

  if (PROGRAMME_PAGE.test(path)) {
    setCacheControl(response, CACHE_ONE_DAY);
    return response;
  }

  if (ACTOR_PAGE.test(path)) {
    setCacheControl(response, CACHE_ONE_HOUR);
    return response;
  }

  if (STATIC_DAILY.test(path)) {
    setCacheControl(response, CACHE_ONE_DAY);
    return response;
  }

  if (EN_DIRECT.test(path)) {
    // Pages en direct : le navigateur ne doit JAMAIS mettre en cache (max-age=0)
    // et le CDN Cloudflare garde au maximum 10s pour garantir un direct absolu en temps réel.
    response.headers.set(
      'Cache-Control',
      'public, max-age=0, s-maxage=10, stale-while-revalidate=10, must-revalidate',
    );
    return response;
  }

  return response;
});
