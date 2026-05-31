/**
 * Utility functions for channel URL slugs
 */

// Map channel IDs to SEO-friendly slugs (optional overrides)
const CHANNEL_SLUGS: Record<string, string> = {
  canal: 'canal-plus',
  bfmtv: 'bfm-tv',
  'france-info': 'franceinfo',
};

// Reverse map: slug to channel ID
const SLUG_TO_CHANNEL: Record<string, string> = Object.fromEntries(
  Object.entries(CHANNEL_SLUGS).map(([id, slug]) => [slug, id])
);

export const getChannelSlug = (channelId: string): string => {
  const base = channelId.toLowerCase().trim();
  if (CHANNEL_SLUGS[base]) return CHANNEL_SLUGS[base];
  return base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

export const getChannelIdFromSlug = (slug: string): string | null => {
  const lowerSlug = slug.toLowerCase();
  // First try exact match in the map
  if (SLUG_TO_CHANNEL[lowerSlug]) {
    return SLUG_TO_CHANNEL[lowerSlug];
  }
  // If not found, try to find by matching slug pattern
  // This handles cases where channel ID might be different from slug
  // Return the slug itself as fallback - the channel matching will happen in App.tsx
  return lowerSlug;
};

export type ChannelViewMode = 'aujourdhui' | 'maintenant' | 'ce-soir' | 'demain';

export const getChannelUrl = (channelId: string, isRadio: boolean = false, viewMode: ChannelViewMode = 'aujourdhui'): string => {
  const slug = getChannelSlug(channelId);
  if (isRadio) {
    const prefix = '/radio';
    const suffix = viewMode === 'aujourdhui' ? '' : `/${viewMode}`;
    if (viewMode === 'maintenant') return `${prefix}/${slug}/en-direct`;
    return `${prefix}/${slug}${suffix}`;
  }
  if (viewMode === 'aujourdhui') return `/${slug}`;
  if (viewMode === 'maintenant') return `/en-direct/${slug}`;
  if (viewMode === 'ce-soir') return `/ce-soir/${slug}`;
  if (viewMode === 'demain') return `/demain/${slug}`;
  return `/${slug}`;
};

export const parseChannelUrl = (pathname: string): { channelId: string | null; viewMode: ChannelViewMode; isRadio: boolean } | null => {
  const reserved = new Set([
    'ce-soir',
    'maintenant',
    'en-direct',
    'demain',
    'programme',
    'recherche',
    'politique-cookies',
    'conditions-generales',
    'credits',
    'films',
    'film',
    'series',
    'serie',
    'acteurs',
    'acteur',
    'recommandes',
    'film-ce-soir',
    'series-ce-soir',
    'sport-ce-soir',
    'documentaires-ce-soir',
    'jeunesse-ce-soir',
    'culture-ce-soir',
    'infos-ce-soir',
    'divertissement-ce-soir',
  ]);

  // Match /ce-soir/slug, /maintenant/slug, /en-direct/slug, /demain/slug
  const prefixedMatch = pathname.match(/^\/(ce-soir|maintenant|en-direct|demain)\/([^\/]+)\/?$/);
  if (prefixedMatch) {
    const viewMode = prefixedMatch[1] === 'en-direct' ? 'maintenant' : (prefixedMatch[1] as ChannelViewMode);
    const slug = prefixedMatch[2];
    const channelId = getChannelIdFromSlug(slug);
    return { channelId, viewMode, isRadio: false };
  }

  // Match /radio/slug or /radio/slug/<view>
  const radioMatch = pathname.match(/^\/radio\/([^\/]+)(?:\/(maintenant|en-direct|ce-soir|demain))?$/);
  if (radioMatch) {
    const slug = radioMatch[1];
    const viewMode = (radioMatch[2] === 'en-direct' ? 'maintenant' : (radioMatch[2] as ChannelViewMode)) || 'aujourdhui';
    const channelId = getChannelIdFromSlug(slug);
    return { channelId, viewMode, isRadio: true };
  }

  // Match /slug (channel root)
  const rootMatch = pathname.match(/^\/([^\/]+)\/?$/);
  if (rootMatch) {
    const slug = rootMatch[1].toLowerCase();
    if (reserved.has(slug)) return null;
    const channelId = getChannelIdFromSlug(slug);
    return { channelId, viewMode: 'aujourdhui', isRadio: false };
  }

  return null;
};
