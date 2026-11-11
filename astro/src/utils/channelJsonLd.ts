import type { ChannelRow, ProgramRow } from './supabase';
import { programAbsoluteUrl, shouldIndexProgram } from './programSeo';
import { resolveProgramPoster } from './programPoster';
import { toAbsoluteImageUrl, DEFAULT_OG_IMAGE } from './seoImage';
import { isCurrentlyAiring } from './dates';

const MAX_PROGRAMS_IN_GRAPH = 40;

export type ChannelScheduleView = 'aujourdhui' | 'ce-soir' | 'demain' | 'en-direct';

function scheduleListName(channelName: string, view: ChannelScheduleView): string {
  switch (view) {
    case 'ce-soir':
      return `Programme TV ${channelName} ce soir`;
    case 'demain':
      return `Programme TV ${channelName} demain`;
    case 'en-direct':
      return `${channelName} en direct — programme TV`;
    default:
      return `Programme TV ${channelName} aujourd'hui`;
  }
}

function programUrl(
  channelSlug: string,
  program: ProgramRow,
  scheduleCanonical: string,
): string {
  if (shouldIndexProgram(program)) {
    return programAbsoluteUrl(channelSlug, program.title);
  }
  return scheduleCanonical;
}

/**
 * Rich JSON-LD for channel schedule pages:
 * BroadcastService + CollectionPage + ItemList of BroadcastEvent + BreadcrumbList.
 */
export function buildChannelScheduleJsonLd(opts: {
  channel: ChannelRow;
  channelSlug: string;
  channelName: string;
  canonical: string;
  view: ChannelScheduleView;
  programs: ProgramRow[];
  breadcrumbs?: Array<{ name: string; item: string }>;
}): object[] {
  const {
    channel,
    channelSlug,
    channelName,
    canonical,
    view,
    programs,
  } = opts;

  const serviceId = `${canonical.includes('/ce-soir/') || canonical.includes('/demain/') || canonical.includes('/en-direct/')
    ? `https://programmecesoir.fr/${channelSlug}`
    : canonical}#broadcastservice`;

  const broadcastService: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BroadcastService',
    '@id': serviceId,
    name: channelName,
    broadcastDisplayName: channelName,
    broadcastTimezone: 'Europe/Paris',
    url: `https://programmecesoir.fr/${channelSlug}`,
    inLanguage: 'fr-FR',
  };
  if (channel.logo_url) {
    broadcastService.logo = channel.logo_url;
    broadcastService.image =
      view === 'en-direct'
        ? `https://programmecesoir.fr/og/direct/${channelSlug}.png`
        : channel.logo_url;
  }

  const limited = programs.slice(0, MAX_PROGRAMS_IN_GRAPH);
  const listName = scheduleListName(channelName, view);

  const itemListElement = limited.map((program, index) => {
    const url = programUrl(channelSlug, program, canonical);
    const poster = resolveProgramPoster(program);
    const mediaImage = poster || (channel.logo_url ? toAbsoluteImageUrl(channel.logo_url) : null) || DEFAULT_OG_IMAGE;
    const isMovie = Boolean(program.genre?.toLowerCase().includes('film'));
    const live = isCurrentlyAiring(program.start_time, program.end_time);

    const workPerformed: Record<string, unknown> = {
      '@type': isMovie ? 'Movie' : 'TVEpisode',
      name: program.title,
      image: mediaImage,
      ...(program.description
        ? { description: program.description.substring(0, 300) }
        : {}),
      ...(program.genre ? { genre: program.genre } : {}),
    };

    const event: Record<string, unknown> = {
      '@type': 'BroadcastEvent',
      '@id': `${url}#broadcast`,
      name: `${program.title} sur ${channelName}`,
      startDate: program.start_time,
      endDate: program.end_time,
      isLiveBroadcast: live,
      inLanguage: 'fr-FR',
      url,
      publishedOn: { '@id': serviceId },
      image: mediaImage,
      workPerformed,
    };
    if (program.description) {
      event.description = program.description.substring(0, 300);
    }
    return {
      '@type': 'ListItem',
      position: index + 1,
      item: event,
    };
  });

  const graphs: object[] = [broadcastService];

  if (itemListElement.length > 0) {
    const itemListId = `${canonical}#programme-list`;
    graphs.push({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${canonical}#webpage`,
      name: listName,
      url: canonical,
      inLanguage: 'fr-FR',
      isPartOf: { '@id': 'https://programmecesoir.fr/#website' },
      about: { '@id': serviceId },
      mainEntity: { '@id': itemListId },
    });
    graphs.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      '@id': itemListId,
      name: listName,
      numberOfItems: itemListElement.length,
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement,
    });
  }

  const crumbs = opts.breadcrumbs ?? [
    { name: 'Accueil', item: 'https://programmecesoir.fr' },
    { name: channelName, item: `https://programmecesoir.fr/${channelSlug}` },
  ];

  graphs.push({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: crumb.item,
    })),
  });

  return graphs;
}
