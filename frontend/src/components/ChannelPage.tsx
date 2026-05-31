
import React, { useMemo, useEffect, useRef, useState } from 'react';
import { Channel, Program, TimeView } from '../types';
import { getNowInParis } from '../utils/timeSlots';
import { useSEO } from '../utils/seo';
import { getSeoForPage } from '../utils/seoTemplates';
import { getChannelUrl, ChannelViewMode, getChannelSlug } from '../utils/channelSlug';
import { getProgramUrlWithAiring } from '../utils/programSlug';
import { getChannelLogo } from '../utils/channelLogos';
import { getRadioStreamUrl } from '../utils/radioStreams';
import { programMatchesCategory, CATEGORY_FILTERS } from '../utils/categoryFilters';
import { getChannelNumberLabel } from '../utils/channelNumbers';
import { getChannelSameAs } from '../utils/knowledgeGraph';
import { getChaineBySlug } from '../data/chaines';
import { buildBroadcastServiceJsonLd } from '../utils/jsonld';
import { fetchEntityIndex } from '../utils/entityData';
import { findEntityIndexMatch, inferEntityTypeFromProgram } from '../utils/entityLinks';
import { getTvStreamUrl } from '../utils/tvStreams';
import type { EntityIndexItem, EntityType } from '../types/entities';

const getCategoryHubLink = (rawCategory: string): { href: string; label: string } | null => {
  const category = String(rawCategory || '').toLowerCase();

  if (category.includes('film') || category.includes('cinema') || category.includes('movie')) {
    return { href: '/film-ce-soir', label: 'Films ce soir' };
  }
  if (category.includes('série') || category.includes('serie') || category.includes('fiction') || category.includes('sitcom') || category.includes('soap')) {
    return { href: '/series-ce-soir', label: 'Séries ce soir' };
  }
  if (category.includes('sport')) {
    return { href: '/sport-ce-soir', label: 'Sport ce soir' };
  }
  if (category.includes('documentaire') || category.includes('documentary') || category.includes('découverte')) {
    return { href: '/documentaires-ce-soir', label: 'Documentaires ce soir' };
  }
  if (category.includes('divertissement') || category.includes('show') || category.includes('magazine') || category.includes('variétés')) {
    return { href: '/divertissement-ce-soir', label: 'Divertissements ce soir' };
  }
  if (category.includes('info') || category.includes('journal') || category.includes('actualité') || category.includes('news')) {
    return { href: '/infos-ce-soir', label: 'Info ce soir' };
  }
  if (category.includes('jeunesse') || category.includes('animation') || category.includes('enfant')) {
    return { href: '/jeunesse-ce-soir', label: 'Jeunesse ce soir' };
  }
  if (category.includes('culture') || category.includes('musique') || category.includes('art')) {
    return { href: '/culture-ce-soir', label: 'Culture ce soir' };
  }

  return null;
};

interface ChannelPageProps {
  channel: Channel;
  allChannels?: Channel[]; // All channels for SEO link building
  view: TimeView;
  channelViewMode?: ChannelViewMode;
  onViewChange: (view: TimeView) => void;
  onBack: () => void;
  onProgramClick: (program: Program) => void;
  onChannelClick?: (channel: Channel) => void;
  onNavigateToView?: (viewMode: ChannelViewMode) => void;
}

export const ChannelPage: React.FC<ChannelPageProps> = ({ channel, allChannels = [], view, channelViewMode = 'aujourdhui', onViewChange, onBack, onProgramClick, onChannelClick, onNavigateToView }) => {
  const [now, setNow] = useState(() => getNowInParis());
  const currentProgramRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  const [logoError, setLogoError] = useState(false);
  const [linkedEntities, setLinkedEntities] = useState<Array<{ type: EntityType; item: EntityIndexItem }>>([]);
  const channelNumberLabel = getChannelNumberLabel(channel.number);

  useEffect(() => {
    setLogoError(false);
  }, [channel.id, channel.logo, channel.name]);

  // Update current time every minute for live updates
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(getNowInParis());
    }, 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  // Get logo with fallback
  const logoUrl = useMemo(() => {
    if (logoError) {
      return getChannelLogo(channel.id, null, channel.name);
    }
    return getChannelLogo(channel.id, channel.logo, channel.name);
  }, [channel.id, channel.logo, channel.name, logoError]);

  const displayDate = useMemo(() => {
    const date = new Date(now);
    if (channelViewMode === 'demain') {
      date.setDate(date.getDate() + 1);
    }
    return date;
  }, [now, channelViewMode]);

  const formattedDate = displayDate.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const formatHour = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const isCurrent = (program: Program) => {
    const nowTime = now.getTime();
    const pStart = new Date(program.startTime).getTime();
    const pEnd = new Date(program.endTime).getTime();
    return nowTime >= pStart && nowTime <= pEnd;
  };

  // Find current program that's on air
  const currentProgram = useMemo(() => {
    if (channelViewMode === 'ce-soir' || channelViewMode === 'demain') return null;

    const sortedPrograms = [...channel.programs].sort((a, b) => {
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });

    const nowTime = now.getTime();
    return sortedPrograms.find(p => {
      const start = new Date(p.startTime).getTime();
      const end = new Date(p.endTime).getTime();
      return nowTime >= start && nowTime <= end;
    }) || null;
  }, [channel.programs, now, channelViewMode]);

  const filteredPrograms = useMemo(() => {
    // Deduplicate programs: same start/end window, keep the most descriptive entry
    const bestByTime = new Map<string, Program>();
    const scoreProgram = (p: Program) => {
      const titleScore = (p.title || '').length;
      const descScore = (p.description || '').length;
      const categoryScore = p.category ? 10 : 0;
      return titleScore + descScore + categoryScore;
    };

    channel.programs.forEach(p => {
      const key = `${p.startTime}|${p.endTime}`;
      const existing = bestByTime.get(key);
      if (!existing || scoreProgram(p) > scoreProgram(existing)) {
        bestByTime.set(key, p);
      }
    });

    const uniquePrograms = Array.from(bestByTime.values());

    // Sort programs by start time to ensure correct order
    const sortedPrograms = [...uniquePrograms].sort((a, b) => {
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });

    const nowTime = now.getTime();

    // Filter based on channelViewMode
    if (channelViewMode === 'maintenant') {
      // En direct: show the program currently on air + next 3 programs
      const liveProgram = sortedPrograms.find(p => {
        const startTime = new Date(p.startTime).getTime();
        const endTime = new Date(p.endTime).getTime();
        return nowTime >= startTime && nowTime <= endTime;
      });

      if (liveProgram) {
        // Find the index of the live program
        const liveIndex = sortedPrograms.indexOf(liveProgram);
        // Return live program + next 3
        return sortedPrograms.slice(liveIndex, liveIndex + 4);
      }

      // If no live program, show next 4 upcoming programs
      const nextProgramIndex = sortedPrograms.findIndex(p => {
        const startTime = new Date(p.startTime).getTime();
        return startTime >= nowTime;
      });

      if (nextProgramIndex !== -1) {
        return sortedPrograms.slice(nextProgramIndex, nextProgramIndex + 4);
      }

      return [];
    } else if (channelViewMode === 'ce-soir' || view === 'tonight') {
      // Show programs from 18:00 today to 02:00 tomorrow
      const tonightStart = new Date(now);
      tonightStart.setHours(18, 0, 0, 0);
      const tonightEnd = new Date(tonightStart);
      tonightEnd.setDate(tonightEnd.getDate() + 1);
      tonightEnd.setHours(2, 0, 0, 0);
      return sortedPrograms.filter(p => {
        const startTime = new Date(p.startTime).getTime();
        return startTime >= tonightStart.getTime() && startTime <= tonightEnd.getTime();
      });
    } else if (channelViewMode === 'demain' || view === 'tomorrow') {
      const tomorrowStart = new Date(now);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      tomorrowStart.setHours(0, 0, 0, 0);
      const tomorrowEnd = new Date(tomorrowStart);
      tomorrowEnd.setHours(23, 59, 59, 999);
      return sortedPrograms.filter(p => {
        const startTime = new Date(p.startTime).getTime();
        return startTime >= tomorrowStart.getTime() && startTime <= tomorrowEnd.getTime();
      });
    } else {
      // 'aujourdhui' - full channel day starting at 08:00 local time,
      // including the program already on air at 08:00.
      const dayStart = new Date(now);
      dayStart.setHours(8, 0, 0, 0);
      const dayEnd = new Date(now);
      dayEnd.setHours(23, 59, 59, 999);
      return sortedPrograms.filter(p => {
        const startTime = new Date(p.startTime).getTime();
        const endTime = new Date(p.endTime).getTime();
        return endTime > dayStart.getTime() && startTime <= dayEnd.getTime();
      });
    }
  }, [channel.programs, channelViewMode, view, now]);

  useEffect(() => {
    let cancelled = false;

    const loadLinkedEntities = async () => {
      const filmIndex = await fetchEntityIndex('film');
      const seriesIndex = await fetchEntityIndex('series');
      if (cancelled) return;

      const results: Array<{ type: EntityType; item: EntityIndexItem }> = [];
      const seen = new Set<string>();

      filteredPrograms.forEach((program) => {
        const entityType = inferEntityTypeFromProgram(program);
        if (!entityType || entityType === 'actor') return;
        const payload = entityType === 'film' ? filmIndex : seriesIndex;
        const matched = findEntityIndexMatch(payload, entityType, program.title);
        if (!matched) return;
        const key = `${entityType}:${matched.slug}`;
        if (seen.has(key)) return;
        seen.add(key);
        results.push({ type: entityType, item: matched });
      });

      setLinkedEntities(results.slice(0, 8));
    };

    loadLinkedEntities();

    return () => {
      cancelled = true;
    };
  }, [filteredPrograms]);

  const isRadio = channel.isRadio || false;

  // Determine SEO content based on channelViewMode
  const channelSlug = getChannelSlug(channel.id);
  const staticChaine = !isRadio ? getChaineBySlug(channelSlug) : undefined;

  const seoHeadline = isRadio
    ? `Programmes radio ${channel.name}`
    : channelViewMode === 'maintenant'
      ? `En direct sur ${channel.name}`
      : channelViewMode === 'ce-soir'
        ? `Ce soir sur ${channel.name} : que regarder`
      : channelViewMode === 'demain'
        ? `Demain sur ${channel.name}`
          : staticChaine
            ? `Programme TV ${staticChaine.nom} aujourd’hui`
            : `Programme ${channel.name}`;

  const viewClass = channelViewMode === 'ce-soir' || view === 'tonight'
    ? 'from-blue-900 to-indigo-950 text-white'
    : 'from-blue-600 to-blue-700 text-white';

  // SEO
  const channelUrl = getChannelUrl(channel.id, channel.isRadio || false, channelViewMode);
  const canonicalUrl = `${window.location.origin}${channelUrl}`;
  const channelSameAs = getChannelSameAs(channel.id, channel.name);

  const baseTitle = isRadio
    ? channelViewMode === 'maintenant'
      ? `En direct sur ${channel.name}`
      : channelViewMode === 'ce-soir'
        ? `${channel.name} ce soir : programme radio et horaires`
        : channelViewMode === 'demain'
          ? `Demain sur ${channel.name}`
          : `Programme radio ${channel.name} aujourd’hui`
    : channelViewMode === 'maintenant'
      ? `En direct sur ${channel.name}`
      : channelViewMode === 'ce-soir'
        ? `${channel.name} ce soir : programme TV et prime time`
      : channelViewMode === 'demain'
          ? `Demain sur ${channel.name}`
          : staticChaine
            ? `Programme TV ${staticChaine.nom} aujourd’hui`
            : `Programme ${channel.name} aujourd’hui`;

  const baseDescription = isRadio
    ? channelViewMode === 'maintenant'
      ? `Programmes radio en direct sur ${channel.name}. Guide complète des émissions en cours le ${formattedDate}.`
      : channelViewMode === 'ce-soir'
        ? `Retrouvez la grille radio de ce soir sur ${channel.name}, avec les émissions à l’antenne et les horaires du début de soirée.`
        : channelViewMode === 'demain'
          ? `Programme radio de demain sur ${channel.name}. Horaires et descriptions détaillées.`
          : `Programme radio ${channel.name} aujourd’hui ${formattedDate}. Horaires et descriptions détaillées.`
    : channelViewMode === 'maintenant'
      ? `Programmes TV en direct sur ${channel.name}. Guide complète des émissions en cours le ${formattedDate}.`
      : channelViewMode === 'ce-soir'
        ? `Consultez la grille de ce soir sur ${channel.name}, avec les horaires, le prime time et les émissions à suivre en première partie de soirée.`
      : channelViewMode === 'demain'
          ? `Programme TV de demain sur ${channel.name}. Horaires et descriptions détaillées.`
          : `Programme TV ${channel.name} aujourd’hui ${formattedDate}. Sélection des émissions en cours et à venir avec horaires détaillés.`;

  // Get channel logo for OG image
  const channelLogoUrl = useMemo(() => {
    return getChannelLogo(channel.id, channel.logo, channel.name);
  }, [channel.id, channel.logo, channel.name]);

  let seoTitle = `${baseTitle} - Programme Ce Soir`;
  let seoDescription = baseDescription;
  let seoImage = channelLogoUrl;

  if (!isRadio && channelViewMode === 'demain') {
    const seo = getSeoForPage({
      type: 'channel-day',
      channelName: channel.name,
      channelSlug,
      canonicalUrl,
    });
    seoTitle = seo.title;
    seoDescription = seo.description;
    seoImage = seo.image;
  }

  useSEO({
    title: seoTitle,
    description: seoDescription,
    url: channelUrl,
    canonicalUrl,
    image: seoImage,
    channelName: channel.name,
    noindex: false, // Explicitly set to index these pages
  });

  // Get radio stream info
  const radioStream = useMemo(() => {
    if (isRadio && channel.streamUrl) {
      return getRadioStreamUrl(channel.id, channel.name);
    }
    return null;
  }, [isRadio, channel.id, channel.name, channel.streamUrl]);

  const tvStream = useMemo(() => {
    if (isRadio) return null;
    return getTvStreamUrl(channel.id, channel.name);
  }, [isRadio, channel.id, channel.name]);

  const liveDestination = useMemo(() => {
    if (isRadio && radioStream) {
      return {
        href: radioStream.streamUrl,
        provider: 'Radio en direct',
        label: `Écouter ${channel.name}`,
        detail: `Ouvrez le flux officiel de ${channel.name} dans un nouvel onglet pour poursuivre l’écoute en direct.`,
      };
    }
    if (tvStream) {
      return {
        href: tvStream.streamUrl,
        provider: tvStream.provider || 'Direct officiel',
        label: `Regarder ${channel.name} en direct`,
        detail: `Basculer vers la page officielle de ${channel.name} pour regarder le direct sur ${tvStream.provider || channel.name}.`,
      };
    }
    if (channel.website) {
      return {
        href: channel.website,
        provider: 'Site officiel',
        label: `Ouvrir le site de ${channel.name}`,
        detail: `Accéder au site officiel de ${channel.name} dans un nouvel onglet.`,
      };
    }
    return null;
  }, [channel.name, channel.website, isRadio, radioStream, tvStream]);

  // Add channel-specific structured data
  useEffect(() => {
    const oldScripts = document.querySelectorAll('script[data-seo="channel"]');
    oldScripts.forEach(script => script.remove());

    if (!isRadio && channelViewMode === 'aujourdhui' && staticChaine) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo', 'channel');
      script.textContent = buildBroadcastServiceJsonLd(staticChaine);
      document.head.appendChild(script);
    } else {
      const siteUrl = window.location.origin;
      const channelLogoUrl = getChannelLogo(channel.id, channel.logo, channel.name);

      const structuredDataArray: any[] = [
        {
          '@context': 'https://schema.org',
          '@type': 'BroadcastService',
          name: channel.name,
          broadcastDisplayName: channel.name,
          description: seoDescription,
          url: `${siteUrl}${channelUrl}`,
          logo: {
            '@type': 'ImageObject',
            url: channelLogoUrl,
          },
          inLanguage: 'fr-FR',
          areaServed: {
            '@type': 'Country',
            name: 'France',
          },
          broadcastTimezone: 'Europe/Paris',
          ...(channelSameAs ? { sameAs: channelSameAs } : {}),
          ...(!isRadio ? {
            hasBroadcastChannel: {
              '@type': 'TelevisionChannel',
              name: channel.name,
              ...(channelSameAs ? { sameAs: channelSameAs } : {}),
            },
          } : {}),
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Accueil',
              item: siteUrl,
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: channel.name,
              item: `${siteUrl}${channelUrl}`,
            },
          ],
        },
      ];

      structuredDataArray.forEach(data => {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute('data-seo', 'channel');
        script.textContent = JSON.stringify(data);
        document.head.appendChild(script);
      });
    }

    return () => {
      const scripts = document.querySelectorAll('script[data-seo="channel"]');
      scripts.forEach(script => script.remove());
    };
  }, [channel, channelUrl, seoDescription, isRadio, channelSameAs, channelViewMode, staticChaine]);

  // Find similar channels (same type, exclude current)
  const similarChannels = useMemo(() => {
    if (!allChannels || allChannels.length === 0) return [];
    return allChannels
      .filter(c => c.id !== channel.id && c.type === channel.type && !c.isRadio === !isRadio)
      .slice(0, 6); // Max 6 similar channels
  }, [allChannels, channel.id, channel.type, isRadio]);

  // Find channels broadcasting same genre as current program
  const channelsWithSameGenre = useMemo(() => {
    if (!currentProgram || !allChannels || allChannels.length === 0) return [];

    const nowTime = now.getTime();
    const programCategory = currentProgram.category;

    // Find which category filter matches the current program
    let matchingCategory: string | null = null;
    for (const [category, genres] of Object.entries(CATEGORY_FILTERS)) {
      if (programMatchesCategory(programCategory, category)) {
        matchingCategory = category;
        break;
      }
    }

    if (!matchingCategory) return [];

    // Find channels broadcasting programs of the same category now
    return allChannels
      .filter(c => {
        if (c.id === channel.id) return false;
        return c.programs.some(p => {
          const start = new Date(p.startTime).getTime();
          const end = new Date(p.endTime).getTime();
          const isOnAir = nowTime >= start && nowTime <= end;
          return isOnAir && programMatchesCategory(p.category, matchingCategory!);
        });
      })
      .slice(0, 6); // Max 6 channels
  }, [currentProgram, allChannels, channel.id, now]);

  const spotlightPrograms = useMemo(() => {
    return filteredPrograms.slice(0, 4);
  }, [filteredPrograms]);

  const categoryHubLinks = useMemo(() => {
    const seen = new Set<string>();
    const links: Array<{ href: string; label: string }> = [];

    filteredPrograms.forEach((program) => {
      const hub = getCategoryHubLink(program.category || '');
      if (!hub || seen.has(hub.href)) return;
      seen.add(hub.href);
      links.push(hub);
    });

    return links.slice(0, 4);
  }, [filteredPrograms]);

  const headPriorityLinks = useMemo(() => {
    const links = [
      {
        href: '/en-direct',
        label: 'Suivre la TNT en direct',
        detail: 'Renforcer la page head live qui concentre les recherches en cours.',
      },
      {
        href: '/film-ce-soir',
        label: 'Voir les films ce soir',
        detail: 'Pousser le hub film quand la chaîne diffuse du cinéma ou du prime time.',
      },
      {
        href: '/sport-ce-soir',
        label: 'Voir le sport ce soir',
        detail: 'Diriger vers le hub sport quand l’audience recherche des événements en direct.',
      },
      {
        href: '/demain',
        label: 'Préparer demain',
        detail: 'Faire remonter la page de planification du lendemain.',
      },
      {
        href: getChannelUrl(channel.id, isRadio, 'maintenant'),
        label: `${channel.name} en direct`,
        detail: `La vue live de ${channel.name} pour capter l’intention immédiate.`,
      },
      {
        href: getChannelUrl(channel.id, isRadio, 'demain'),
        label: `${channel.name} demain`,
        detail: `La grille de ${channel.name} pour les recherches orientées anticipation.`,
      },
    ];

    return links.filter((link, index, array) => array.findIndex((candidate) => candidate.href === link.href) === index);
  }, [channel.id, channel.name, isRadio]);

  const priorityChannelLinks = useMemo(() => {
    const targetIds = ['tf1', 'france-2', 'france-3', 'm6', 'arte', 'canal-plus'];
    return targetIds
      .filter((id) => id !== channel.id)
      .map((id) => allChannels.find((item) => item.id === id))
      .filter((item): item is Channel => Boolean(item))
      .map((item) => ({
        href: getChannelUrl(item.id, item.isRadio || false, 'aujourdhui'),
        label: `Programme ${item.name} ce soir`,
      }));
  }, [allChannels, channel.id]);

  const channelDigest = useMemo(() => {
    const totalPrograms = filteredPrograms.length;
    const firstProgram = filteredPrograms[0];
    const lastProgram = filteredPrograms[filteredPrograms.length - 1];

    const counts = new Map<string, number>();
    filteredPrograms.forEach((program) => {
      const category = String(program.category || 'TV');
      counts.set(category, (counts.get(category) || 0) + 1);
    });

    const topCategories = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category]) => category);

    return {
      totalPrograms,
      firstProgram,
      lastProgram,
      topCategories,
    };
  }, [filteredPrograms]);

  // Auto-scroll to current program when page loads (only for "maintenant" mode)
  useEffect(() => {
    if (channelViewMode === 'maintenant' && currentProgram && currentProgramRef.current && !hasScrolledRef.current && filteredPrograms.length > 0) {
      // Wait a bit for the page to render completely
      const timer = setTimeout(() => {
        if (currentProgramRef.current) {
          // Scroll to the program with some offset from top to account for header
          const element = currentProgramRef.current;
          const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
          const offsetPosition = elementPosition - 200; // 200px from top to account for header

          window.scrollTo({
            top: Math.max(0, offsetPosition), // Don't scroll to negative position
            behavior: 'smooth'
          });

          hasScrolledRef.current = true;
          console.log(`[ChannelPage] ✅ Scrolled to current program: ${currentProgram.title}`);
        }
      }, channelViewMode === 'maintenant' ? 500 : 1000); // Faster scroll for "maintenant" mode

      return () => clearTimeout(timer);
    }

    // Reset scroll flag when view changes or channel changes
    if (channelViewMode === 'ce-soir') {
      hasScrolledRef.current = false;
    }
  }, [currentProgram, channelViewMode, filteredPrograms.length, channel.id]);

  // Reset scroll flag when channel changes
  useEffect(() => {
    hasScrolledRef.current = false;
  }, [channel.id]);

  return (
    <div className="animate-in fade-in duration-500">
      <section className={`relative overflow-hidden pt-6 pb-8 md:pt-12 md:pb-20 bg-gradient-to-br transition-colors duration-700 ${viewClass}`}>
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none">
          <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full fill-current">
            <path d="M45,-76.4C58.9,-69.1,71.2,-57.1,79.4,-42.8C87.6,-28.5,91.8,-11.9,89.5,3.9C87.2,19.8,78.5,34.9,67.6,47.3C56.6,59.8,43.4,69.5,28.7,75.4C14.1,81.3,-2,83.4,-18.2,80.6C-34.4,77.8,-50.7,70.1,-63.4,58.2C-76.2,46.3,-85.4,30.3,-87.6,13.7C-89.9,-2.9,-85.2,-19.9,-76.2,-34.7C-67.3,-49.4,-54.1,-61.8,-39.7,-68.9C-25.3,-75.9,-9.6,-77.6,3,-82.9C15.7,-88.2,31.2,-83.7,45,-76.4Z" transform="translate(100 100)" />
          </svg>
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <button
            onClick={() => onBack()}
            className="inline-flex items-center gap-2 text-white/80 hover:text-white font-semibold mb-10 transition-colors group"
          >
            <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Toutes les chaînes
          </button>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-10">
            <div className="flex items-center gap-4 md:gap-8">
              <div className="w-16 h-16 md:w-32 md:h-32 rounded-xl md:rounded-[2rem] bg-white shadow-lg md:shadow-2xl p-2 md:p-4 flex items-center justify-center border-2 md:border-4 border-white/20 min-w-[64px] md:min-w-[128px]">
                <img
                  src={logoUrl}
                  alt={`Logo ${channel.name}`}
                  className="w-full h-full object-contain max-w-full max-h-full"
                  onError={() => {
                    if (!logoError) {
                      console.warn(`[ChannelPage] Logo failed to load for ${channel.name}, using fallback`);
                      setLogoError(true);
                    }
                  }}
                />
              </div>
              <div className="space-y-0.5 md:space-y-1">
                <p className="text-white/70 text-xs md:text-sm font-bold uppercase tracking-wider md:tracking-[0.3em] mb-1 md:mb-2 drop-shadow-sm">
                  {isRadio ? 'Radio' : 'TNT'} • {isRadio ? 'Fréquence' : 'Chaîne'} {channelNumberLabel}
                </p>
                <h1 className="text-2xl md:text-6xl font-black tracking-tighter drop-shadow-md">
                  {seoHeadline}
                </h1>
                <p className="text-sm md:text-2xl font-medium text-white/90 capitalize mt-1 md:mt-2">
                  {formattedDate}
                </p>
                {/* Current time and progress bar for 'maintenant' mode */}
                {channelViewMode === 'maintenant' && currentProgram && (
                  <div className="mt-3 md:mt-4 space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="text-white/70 text-xs md:text-sm font-bold uppercase tracking-wider">
                        Il est maintenant
                      </span>
                      <time className="text-lg md:text-3xl font-black text-white">
                        {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </time>
                    </div>
                    {(() => {
                      const start = new Date(currentProgram.startTime).getTime();
                      const end = new Date(currentProgram.endTime).getTime();
                      const current = now.getTime();
                      const progress = Math.min(100, Math.max(0, ((current - start) / (end - start)) * 100));
                      return (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs md:text-sm text-white/80">
                            <span>{currentProgram.title}</span>
                            <span>{Math.round(progress)}%</span>
                          </div>
                          <div className="h-2 md:h-3 w-full bg-white/20 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-white transition-all duration-1000"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
                {isRadio && radioStream && (
                  <div className="mt-3 md:mt-4">
                    <a
                      href={radioStream.streamUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 md:px-6 py-2 md:py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white font-bold rounded-xl md:rounded-2xl transition-all shadow-lg text-xs md:text-base"
                    >
                      <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                      </svg>
                      Écouter en direct
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="flex bg-black/20 p-1 md:p-1.5 rounded-2xl md:rounded-3xl backdrop-blur-md self-start md:self-center">
              <a
                href={getChannelUrl(channel.id, isRadio, 'aujourdhui')}
                onClick={(e) => {
                  e.preventDefault();
                  if (onNavigateToView) {
                    onNavigateToView('aujourdhui');
                  } else {
                    window.location.href = getChannelUrl(channel.id, isRadio, 'aujourdhui');
                  }
                }}
                className={`px-4 md:px-8 py-2 md:py-3 rounded-xl md:rounded-2xl font-bold md:font-extrabold text-sm md:text-base transition-all ${channelViewMode === 'aujourdhui' ? 'bg-white text-blue-700 shadow-xl' : 'text-white hover:bg-white/10'}`}
              >
                Aujourd’hui
              </a>
              <a
                href={getChannelUrl(channel.id, isRadio, 'maintenant')}
                onClick={(e) => {
                  e.preventDefault();
                  if (onNavigateToView) {
                    onNavigateToView('maintenant');
                  } else {
                    window.location.href = getChannelUrl(channel.id, isRadio, 'maintenant');
                  }
                }}
                className={`px-4 md:px-8 py-2 md:py-3 rounded-xl md:rounded-2xl font-bold md:font-extrabold text-sm md:text-base transition-all ${channelViewMode === 'maintenant' ? 'bg-white text-blue-700 shadow-xl' : 'text-white hover:bg-white/10'}`}
              >
                En direct
              </a>
              <a
                href={getChannelUrl(channel.id, isRadio, 'ce-soir')}
                onClick={(e) => {
                  e.preventDefault();
                  if (onNavigateToView) {
                    onNavigateToView('ce-soir');
                  } else {
                    window.location.href = getChannelUrl(channel.id, isRadio, 'ce-soir');
                  }
                }}
                className={`px-4 md:px-8 py-2 md:py-3 rounded-xl md:rounded-2xl font-bold md:font-extrabold text-sm md:text-base transition-all ${channelViewMode === 'ce-soir' ? 'bg-white text-indigo-900 shadow-xl' : 'text-white hover:bg-white/10'}`}
              >
                Ce soir
              </a>
              <a
                href={getChannelUrl(channel.id, isRadio, 'demain')}
                onClick={(e) => {
                  e.preventDefault();
                  if (onNavigateToView) {
                    onNavigateToView('demain');
                  } else {
                    window.location.href = getChannelUrl(channel.id, isRadio, 'demain');
                  }
                }}
                className={`px-4 md:px-8 py-2 md:py-3 rounded-xl md:rounded-2xl font-bold md:font-extrabold text-sm md:text-base transition-all ${channelViewMode === 'demain' ? 'bg-white text-indigo-900 shadow-xl' : 'text-white hover:bg-white/10'}`}
              >
                Demain
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-6 md:p-10 border border-slate-100 -mt-6 md:-mt-10">
              <div className="mb-8 pb-4 border-b border-slate-100">
                <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Programme TV <span className="text-blue-600">{channel.name}</span></h2>
              </div>

              {filteredPrograms.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-slate-400 text-lg mb-4">Chargement des programmes...</p>
                  <p className="text-slate-300 text-sm">Si les programmes n’apparaissent pas, ils sont peut-être encore en cours de chargement.</p>
                </div>
              )}

              <div className="space-y-6">
                {filteredPrograms.length > 0 ? filteredPrograms.map((program, index) => {
                  const active = isCurrent(program);
                  const isCurrentProgram = currentProgram
                    ? program.startTime === currentProgram.startTime && program.endTime === currentProgram.endTime
                    : false;

                  // For "maintenant" mode, highlight programs around current time
                  const programStartTime = new Date(program.startTime).getTime();
                  const programEndTime = new Date(program.endTime).getTime();
                  const nowTime = now.getTime();
                  const isNearCurrentTime = channelViewMode === 'maintenant' &&
                    (programStartTime <= nowTime && programEndTime >= nowTime) ||
                    (Math.abs(programStartTime - nowTime) < 30 * 60 * 1000); // Within 30 minutes

                  return (
                    <article
                      key={`${program.id}-${index}`}
                      ref={isCurrentProgram ? currentProgramRef : null}
                      onClick={() => onProgramClick(program)}
                      className={`flex flex-col md:flex-row gap-4 md:gap-8 p-6 rounded-2xl border-2 transition-all hover:scale-[1.01] cursor-pointer group shadow-md hover:shadow-lg ${active || isNearCurrentTime ? 'bg-blue-50/50 border-blue-300 ring-2 ring-blue-200 shadow-lg shadow-blue-100' : 'bg-white border-slate-300 hover:border-blue-400'
                        }`}
                    >
                      <div className="md:w-24 flex md:flex-col justify-between md:justify-start items-center md:items-end flex-shrink-0">
                        <time className={`text-2xl font-black tracking-tighter ${active || isNearCurrentTime ? 'text-blue-600' : 'text-slate-900'}`}>
                          {formatHour(program.startTime)}
                          {channelViewMode === 'maintenant' && isNearCurrentTime && (
                            <span className="ml-2 text-xs text-emerald-600 font-bold">●</span>
                          )}
                        </time>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest md:mt-1">jusqu’à {formatHour(program.endTime)}</span>
                      </div>

                      {String((program as any).posterUrl || (program as any).poster_url || '').trim() && (
                        <div className="relative h-28 w-full overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200 md:h-32 md:w-24 md:flex-shrink-0">
                          <img
                            src={String((program as any).posterUrl || (program as any).poster_url || '').trim()}
                            alt=""
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                            onError={(event) => {
                              event.currentTarget.parentElement?.classList.add('hidden');
                            }}
                          />
                        </div>
                      )}

                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          {active && <span className="inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-black bg-rose-500 text-white uppercase tracking-wider shadow-sm animate-pulse">EN DIRECT</span>}
                          <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded text-[10px] font-bold uppercase tracking-widest">{program.category}</span>
                        </div>
                        <h3 className={`text-2xl font-black mb-3 leading-tight tracking-tight group-hover:text-blue-600 transition-colors ${active ? 'text-blue-900' : 'text-slate-800'}`}>{program.title}</h3>
                        {program.description && (
                          <p className="text-slate-500 leading-relaxed text-base md:text-lg line-clamp-3">{program.description}</p>
                        )}
                      </div>
                    </article>
                  );
                }) : (
                  <div className="py-20 text-center">
                    <p className="text-slate-400 text-lg mb-2">Aucun programme disponible.</p>
                    <p className="text-slate-300 text-sm">Total des programmes sur la chaîne : {channel.programs.length}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-8">
            <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
              <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-blue-600/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>
              <h4 className="text-xl font-black mb-6 border-b border-white/10 pb-4">Infos {isRadio ? 'Radio' : 'Chaîne'}</h4>
              <div className="space-y-6 relative z-10">
                <div>
                  <label className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] block mb-1">
                    {isRadio ? 'Fréquence' : 'Position LCN'}
                  </label>
                  <p className="font-bold text-lg">{isRadio ? 'FM/AM' : 'Canal'} {channelNumberLabel}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Grille de <strong>{channel.name} {channelViewMode === 'demain' ? 'demain' : 'aujourd’hui'}</strong> {formattedDate}.
                  </p>
                </div>
                {isRadio && radioStream && (
                  <a
                    href={radioStream.streamUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-2xl transition-all w-full justify-center shadow-lg shadow-emerald-900/40"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                    </svg>
                    Écouter en direct
                  </a>
                )}
                {(channel.website || (radioStream && radioStream.website)) && (
                  <a
                    href={channel.website || radioStream?.website || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-3 rounded-2xl transition-all w-full justify-center shadow-lg shadow-blue-900/40"
                  >
                    Site officiel {channel.name}
                  </a>
                )}
              </div>
            </div>

            {spotlightPrograms.length > 0 && (
              <div className="bg-white rounded-[2.5rem] p-8 border-2 border-slate-300 shadow-md">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 text-center">
                  À ne pas manquer
                </h4>
                <div className="space-y-3">
                  {spotlightPrograms.map((program) => (
                    <a
                      key={`${program.id}-${program.startTime}`}
                      href={getProgramUrlWithAiring(channelSlug, program.title, program.startTime)}
                      className="block p-4 bg-slate-50 rounded-2xl hover:bg-blue-50 border-2 border-transparent hover:border-blue-300 transition-all"
                    >
                      <span className="text-slate-900 font-bold text-sm leading-tight block mb-1">{program.title}</span>
                      <span className="text-[11px] text-slate-500">
                        {formatHour(program.startTime)} • {program.category}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {channelDigest.totalPrograms > 0 && (
              <div className="bg-white rounded-[2.5rem] p-8 border-2 border-slate-300 shadow-md">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 text-center">
                  En bref ce soir
                </h4>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Programmes</p>
                    <p className="text-2xl font-black text-slate-900">{channelDigest.totalPrograms}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Début</p>
                    <p className="text-2xl font-black text-slate-900">
                      {channelDigest.firstProgram ? formatHour(channelDigest.firstProgram.startTime) : '--:--'}
                    </p>
                  </div>
                </div>
                {channelDigest.topCategories.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {channelDigest.topCategories.map((category) => (
                      <span
                        key={category}
                        className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600"
                      >
                        {category}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="bg-white rounded-[2.5rem] p-8 border-2 border-slate-300 shadow-md">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 text-center">
                Pages head à renforcer
              </h4>
              <div className="space-y-3">
                {headPriorityLinks.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-blue-400 hover:bg-blue-50"
                  >
                    <span className="block text-sm font-black text-slate-900">{item.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-500">{item.detail}</span>
                  </a>
                ))}
              </div>
            </div>

            {priorityChannelLinks.length > 0 && (
              <div className="bg-white rounded-[2.5rem] p-8 border-2 border-slate-300 shadow-md">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 text-center">
                  Grandes chaînes TNT
                </h4>
                <div className="grid grid-cols-1 gap-3">
                  {priorityChannelLinks.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-blue-400 hover:bg-blue-50"
                    >
                      <span className="block text-sm font-black text-slate-900">{item.label}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-slate-500">Renforcer le maillage interne vers les pages chaîne qui portent la demande head.</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {categoryHubLinks.length > 0 && (
              <div className="bg-white rounded-[2.5rem] p-8 border-2 border-slate-300 shadow-md">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 text-center">
                  Explorer par thème
                </h4>
                <div className="space-y-3">
                  {categoryHubLinks.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-blue-400 hover:text-blue-600"
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {linkedEntities.length > 0 && (
              <div className="bg-white rounded-[2.5rem] p-8 border-2 border-slate-300 shadow-md">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 text-center">
                  Films et séries de la chaîne
                </h4>
                <div className="space-y-3">
                  {linkedEntities.map(({ type, item }) => (
                    <a
                      key={`${type}-${item.slug}`}
                      href={item.href}
                      className="block p-4 bg-slate-50 rounded-2xl hover:bg-blue-50 border-2 border-transparent hover:border-blue-300 transition-all"
                    >
                      <span className="text-slate-900 font-bold text-sm leading-tight block mb-1">{item.title}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        {type === 'film' ? 'Fiche film' : 'Fiche série'}
                      </span>
                    </a>
                  ))}
                </div>
                <div className="mt-6 grid gap-3">
                  <a
                    href="/films"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-blue-400 hover:text-blue-600"
                  >
                    Explorer les films
                  </a>
                  <a
                    href="/series"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-blue-400 hover:text-blue-600"
                  >
                    Explorer les séries
                  </a>
                  <a
                    href="/acteurs"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-blue-400 hover:text-blue-600"
                  >
                    Explorer les acteurs
                  </a>
                </div>
              </div>
            )}
          </aside>
        </div>

        {/* SEO Link Building Section */}
        {(similarChannels.length > 0 || channelsWithSameGenre.length > 0) && (
          <section className="container mx-auto px-4 pb-20 mt-12">
            <div className="bg-white rounded-3xl shadow-md border-2 border-slate-300 p-6 md:p-10">
              {/* Similar Channels */}
              {similarChannels.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-xl md:text-2xl font-black text-slate-900 mb-4">
                    Chaînes similaires
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {similarChannels.map(c => (
                      <a
                        key={c.id}
                        href={getChannelUrl(c.id, c.isRadio || false, 'aujourdhui')}
                        onClick={(e) => {
                          e.preventDefault();
                          const url = getChannelUrl(c.id, c.isRadio || false, 'aujourdhui');
                          window.location.href = url;
                        }}
                        className="px-4 py-2 bg-slate-100 hover:bg-blue-50 border-2 border-slate-300 hover:border-blue-400 rounded-lg text-sm font-semibold text-slate-700 hover:text-blue-700 transition-all"
                      >
                        Programme {c.name}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Channels with same genre */}
              {channelsWithSameGenre.length > 0 && currentProgram && (
                <div>
                  <h3 className="text-xl md:text-2xl font-black text-slate-900 mb-4">
                    Voir aussi : chaînes qui diffusent <span className="text-blue-600">{currentProgram.category}</span> en direct
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {channelsWithSameGenre.map(c => {
                      const channelProgram = c.programs.find(p => {
                        const start = new Date(p.startTime).getTime();
                        const end = new Date(p.endTime).getTime();
                        const nowTime = now.getTime();
                        return nowTime >= start && nowTime <= end &&
                          programMatchesCategory(p.category, currentProgram.category);
                      });

                      return (
                        <a
                          key={c.id}
                          href={getChannelUrl(c.id, c.isRadio || false, 'maintenant')}
                          onClick={(e) => {
                            e.preventDefault();
                            const url = getChannelUrl(c.id, c.isRadio || false, 'maintenant');
                            window.location.href = url;
                          }}
                          className="px-4 py-2 bg-blue-50 hover:bg-blue-100 border-2 border-blue-300 hover:border-blue-500 rounded-lg text-sm font-semibold text-blue-700 hover:text-blue-900 transition-all"
                        >
                          {c.name} - {channelProgram?.title}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {liveDestination && (
          <section className="container mx-auto px-4 pb-20">
            <div className="relative overflow-hidden rounded-[2rem] md:rounded-[2.75rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 md:p-10 text-white shadow-2xl shadow-slate-300/40">
              <div className="absolute -right-8 top-0 h-40 w-40 rounded-full bg-blue-500/20 blur-3xl" />
              <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-cyan-400/10 blur-3xl" />

              <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.25em] text-cyan-100">
                      En direct officiel
                    </span>
                    <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
                      {liveDestination.provider}
                    </span>
                  </div>
                  <h3 className="mt-4 text-2xl font-black tracking-tight md:text-4xl">
                    Poursuivre sur le direct de {channel.name}
                  </h3>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75 md:text-base">
                    {liveDestination.detail}
                  </p>
                </div>

                <a
                  href={liveDestination.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative flex min-w-full flex-col gap-3 rounded-[1.75rem] border border-white/15 bg-white/10 p-5 backdrop-blur md:min-w-[340px] md:max-w-[360px]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-[0.25em] text-cyan-100">
                        Ouvrir une nouvelle page
                      </p>
                      <p className="mt-2 text-lg font-black leading-tight text-white md:text-xl">
                        {liveDestination.label}
                      </p>
                    </div>
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-950 shadow-lg transition-transform duration-300 group-hover:translate-x-1">
                      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M7 17L17 7M9 7h8v8" />
                      </svg>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_6px_rgba(52,211,153,0.12)]" />
                    Direct disponible hors de programmecesoir.fr
                  </div>
                </a>
              </div>
            </div>
          </section>
        )}
      </section>
    </div>
  );
};
