import type { APIRoute } from 'astro';
import {
  getTonightPrograms,
  getProgramsForDate,
  getChannels,
  groupProgramsByChannel,
  getTodayDateFR,
  getTomorrowDateFR,
  getChannelSlugFromId,
} from '../../utils/supabase';
import { pickFeaturedProgram, pickNextPrograms } from '../../utils/programPick';
import { getChannelLogo } from '../../utils/channelLogos';
import { formatTimeFR, isCurrentlyAiring, progressPercent, durationMinutes } from '../../utils/dates';
import { programPath, isAdultOrJunkChannel } from '../../utils/programSeo';
import { buildProgramOverlayAttr } from '../../utils/programOverlayData';
import {
  isPayant,
  isTntLocale,
  isSuisse,
  getTntNumber,
  getChannelSortOrder,
  isRegionalFrance3,
} from '../../utils/channelUrls';
import { resolveCardHeroImage, detectCategoryGroup } from '../../utils/cardImages';
import { getTvStreamUrl } from '../../utils/tvStreams';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const mode = (url.searchParams.get('mode') || 'ce-soir') as 'ce-soir' | 'demain' | 'en-direct' | 'aujourdhui';
  const offset = parseInt(url.searchParams.get('offset') || '50', 10);

  let allChannels = await getChannels();
  let programsList: any[] = [];

  if (mode === 'ce-soir') {
    programsList = await getTonightPrograms();
  } else if (mode === 'demain') {
    const tomorrow = await getTomorrowDateFR();
    programsList = await getProgramsForDate(tomorrow);
  } else {
    const today = await getTodayDateFR();
    programsList = await getProgramsForDate(today);
  }

  const byChannel = groupProgramsByChannel(programsList);

  const filteredChannels = allChannels
    .filter((channel) => {
      const slug = getChannelSlugFromId(channel.channel_id);
      if (isAdultOrJunkChannel(slug)) return false;
      if (isRegionalFrance3(slug)) return false;
      return true;
    })
    .sort((a, b) => {
      const slugA = getChannelSlugFromId(a.channel_id);
      const slugB = getChannelSlugFromId(b.channel_id);
      const numA = getChannelSortOrder(a.channel_number, slugA);
      const numB = getChannelSortOrder(b.channel_number, slugB);
      return numA - numB;
    });

  const activeChannels = filteredChannels
    .map((channel) => ({
      channel,
      programs: byChannel.get(channel.channel_id) ?? [],
    }))
    .filter((cp) => cp.programs.length > 0);

  const extraChannels = activeChannels.slice(offset);

  const items = extraChannels.map(({ channel, programs }) => {
    const slug = getChannelSlugFromId(channel.channel_id);
    const resolvedLogo = getChannelLogo(channel.channel_id, channel.logo_url, channel.name);
    const channelHref =
      mode === 'en-direct'
        ? `/en-direct/${slug}`
        : mode === 'demain'
        ? `/demain/${slug}`
        : mode === 'ce-soir'
        ? `/ce-soir/${slug}`
        : `/${slug}`;

    let primeProgram = pickFeaturedProgram(programs, mode);
    if (mode === 'en-direct' && programs.length > 0) {
      const live = programs.find((p) => isCurrentlyAiring(p.start_time, p.end_time));
      if (live) primeProgram = live;
    }

    const nextPrograms = pickNextPrograms(programs, primeProgram, 1);
    const isLive = primeProgram ? isCurrentlyAiring(primeProgram.start_time, primeProgram.end_time) : false;
    const progress = isLive && primeProgram ? progressPercent(primeProgram.start_time, primeProgram.end_time) : 0;
    const tntNum = getTntNumber(channel.channel_number, slug);
    const isPaid = isPayant(channel.channel_number, slug);
    const isLocal = isTntLocale(slug);
    const isSwiss = isSuisse(slug);
    const catGroup = detectCategoryGroup(primeProgram?.genre, primeProgram?.title);
    const heroImageInfo = resolveCardHeroImage(primeProgram);
    const stream = getTvStreamUrl(slug, channel.name);

    const overlayAttr = primeProgram
      ? buildProgramOverlayAttr(primeProgram, { ...channel, logo_url: resolvedLogo }, slug)
      : null;
    const primeHref = primeProgram ? programPath(slug, primeProgram.title) : channelHref;

    return {
      name: channel.name,
      slug,
      channelNumber: channel.channel_number ?? 999,
      logo: resolvedLogo,
      channelHref,
      tntNum,
      isPaid,
      isLocal,
      isSwiss,
      catGroup,
      heroImageUrl: heroImageInfo.imageUrl,
      streamUrl: stream?.streamUrl || null,
      prime: primeProgram
        ? {
            title: primeProgram.title,
            time: `${formatTimeFR(primeProgram.start_time)} – ${formatTimeFR(primeProgram.end_time)}`,
            duration: durationMinutes(primeProgram.start_time, primeProgram.end_time),
            genre: primeProgram.genre || '',
            description: primeProgram.description ? primeProgram.description.slice(0, 160) : '',
            live: isLive,
            progress,
            href: primeHref,
            overlayAttr,
          }
        : null,
      next:
        nextPrograms.length > 0
          ? {
              time: formatTimeFR(nextPrograms[0].start_time),
              title: nextPrograms[0].title,
            }
          : null,
    };
  });

  return new Response(JSON.stringify({ total: activeChannels.length, count: items.length, items }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=1800',
    },
  });
};
