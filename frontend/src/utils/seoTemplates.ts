export type SeoContextType = 'home' | 'now' | 'tomorrow' | 'channel-day';

export interface SeoContext {
  type: SeoContextType;
  channelName?: string;
  channelSlug?: string;
  dateIso?: string;
  canonicalUrl: string;
}

export interface SeoResult {
  title: string;
  description: string;
  image: string;
  canonicalUrl: string;
  ogTags: { property: string; content: string }[];
  twitterTags: { name: string; content: string }[];
  jsonLd: string[];
}

const SITE_NAME = 'Programme Ce Soir';
const SITE_URL = 'https://programmecesoir.fr';
const COVER_IMAGE = `${SITE_URL}/static/img/programmecesoir-social.jpg`;

const baseOgTags = (title: string, description: string, url: string, image: string) => [
  { property: 'og:type', content: 'website' },
  { property: 'og:locale', content: 'fr_FR' },
  { property: 'og:site_name', content: SITE_NAME },
  { property: 'og:title', content: title },
  { property: 'og:description', content: description },
  { property: 'og:url', content: url },
  { property: 'og:image', content: image },
];

const baseTwitterTags = (title: string, description: string, image: string) => [
  { name: 'twitter:card', content: 'summary_large_image' },
  { name: 'twitter:title', content: title },
  { name: 'twitter:description', content: description },
  { name: 'twitter:image', content: image },
];

export function getSeoForPage(ctx: SeoContext): SeoResult {
  let title = '';
  let description = '';
  let image = COVER_IMAGE;

  if (ctx.type === 'home') {
    title = 'Programme TV TNT ce soir : toutes les chaînes - Programme Ce Soir';
    description = 'Découvrez le programme TV TNT de ce soir : toutes les chaînes en un coup d’œil, horaires détaillés, films, séries et émissions.';
    image = COVER_IMAGE;
  }

  if (ctx.type === 'now') {
    title = 'Programme TNT en direct : ce qui passe à la TV - Programme Ce Soir';
    description = 'Regardez en un coup d’œil ce qui passe en ce moment à la TV sur toutes les chaînes TNT : films, séries, magazines et émissions en direct.';
    image = COVER_IMAGE;
  }

  if (ctx.type === 'tomorrow') {
    title = 'Programme TNT de demain : toutes les chaînes TV - Programme Ce Soir';
    description = 'Consultez le programme TV TNT de demain : horaires détaillés de toutes les chaînes, films, séries, documentaires et divertissements.';
    image = COVER_IMAGE;
  }

  if (ctx.type === 'channel-day') {
    const channelName = ctx.channelName || 'Chaîne TNT';
    const channelSlug = ctx.channelSlug || 'chaine';
    title = `Programme ${channelName} demain : grille TV détaillée - Programme Ce Soir`;
    description = `Découvrez le programme de ${channelName} pour demain : horaires, titres et résumés des émissions, dessins animés, films et séries.`;
    image = `${SITE_URL}/static/img/channels/${channelSlug}.jpg`;
  }

  const ogTags = baseOgTags(title, description, ctx.canonicalUrl, image);
  const twitterTags = baseTwitterTags(title, description, image);

  return {
    title,
    description,
    image,
    canonicalUrl: ctx.canonicalUrl,
    ogTags,
    twitterTags,
    jsonLd: [],
  };
}
