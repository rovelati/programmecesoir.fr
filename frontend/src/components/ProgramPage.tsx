import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Channel, Program } from '../types';
import { getNowInParis } from '../utils/timeSlots';
import { useSEO } from '../utils/seo';
import { getProgramUrl, getProgramSlugFromTitle, parseProgramUrl } from '../utils/programSlug';
import { getChannelSlug, getChannelUrl } from '../utils/channelSlug';
import { getChannelLogo } from '../utils/channelLogos';
import { getRadioStreamUrl } from '../utils/radioStreams';
import { getTvStreamUrl } from '../utils/tvStreams';
import { downloadICS, openGoogleCalendar } from '../utils/icsGenerator';
import { trackSaveReminder } from '../utils/analytics';
import { supabase } from '../utils/supabase';
import { CHANNELS_TABLE, PROGRAMS_TABLE } from '../utils/dbTables';
import { getChannelNumberLabel, hasValidChannelNumber, resolveChannelNumber } from '../utils/channelNumbers';
import { fetchEntity, fetchEntityIndex } from '../utils/entityData';
import { fetchCurrentBirthdayArticle } from '../utils/birthdayData';
import { hasEntityPage } from '../utils/entityAvailability';
import { findEntityIndexMatch, inferEntityTypeFromProgram } from '../utils/entityLinks';
import type { AnyEntity, EntityIndexItem, EntityType } from '../types/entities';
import type { BirthdayArticlePayload } from '../types/birthday';
import { BirthdaySpotlight } from './BirthdaySpotlight';

// Generate channel description based on channel name (FR)
const getChannelDescription = (channel: Channel): string => {
  const name = channel.name.toLowerCase();

  if (name.includes('tf1')) {
    return 'TF1 est une chaîne généraliste majeure en France, avec information, divertissement et fiction.';
  }
  if (name.includes('france 2') || name.includes('france2')) {
    return 'France 2 propose des programmes généralistes, info, fiction et divertissement.';
  }
  if (name.includes('france 3') || name.includes('france3')) {
    return 'France 3 offre une programmation généraliste avec un fort ancrage régional.';
  }
  if (name.includes('france 5') || name.includes('france5')) {
    return 'France 5 est dédiée à la connaissance, aux documentaires et à la culture.';
  }
  if (name.includes('m6')) {
    return 'M6 propose divertissement, séries, émissions de découverte et cinéma.';
  }
  if (name.includes('arte')) {
    return 'Arte est la chaîne culturelle franco-allemande dédiée à la culture et aux documentaires.';
  }
  if (name.includes('w9')) {
    return 'W9 propose divertissement, séries et magazines.';
  }
  if (name.includes('tmc')) {
    return 'TMC offre séries, divertissements et magazines.';
  }
  if (name.includes('tfx')) {
    return 'TFX propose divertissements, séries et magazines.';
  }
  if (name.includes('nrj12')) {
    return 'NRJ12 propose divertissement, magazines et séries.';
  }
  if (name.includes('lci')) {
    return 'LCI est une chaîne d’information en continu.';
  }
  if (name.includes('bfm')) {
    return 'BFM TV est une chaîne d’information en continu.';
  }
  if (name.includes('cnews')) {
    return 'CNEWS est une chaîne d’information en continu.';
  }
  if (name.includes('c8')) {
    return 'C8 propose divertissement, talk-shows et magazines.';
  }
  if (name.includes('gulli')) {
    return 'Gulli est la chaîne jeunesse, avec dessins animés et programmes famille.';
  }
  if (name.includes('canal+')) {
    return 'Canal+ propose cinéma, sport et programmes premium.';
  }

  if (channel.type === 'Sport') {
    return `${channel.name} est une chaîne sport avec directs et magazines.`;
  }
  if (channel.type === 'News') {
    return `${channel.name} est une chaîne d’information en continu.`;
  }
  if (channel.type === 'Film') {
    return `${channel.name} propose une programmation cinéma variée.`;
  }

  return `${channel.name} propose une programmation variée pour tous les publics.`;
};

const REPLAY_LABELS: Record<string, string> = {
  'france-2': 'Revoir sur France.tv',
  'france-3': 'Revoir sur France.tv',
  'france-4': 'Revoir sur France.tv',
  'france-5': 'Revoir sur France.tv',
  'franceinfo': 'Revoir sur France.tv',
  'tf1': 'Revoir sur TF1+',
  'tmc': 'Revoir sur TF1+',
  'tfx': 'Revoir sur TF1+',
  'lci': 'Revoir sur TF1+',
  'm6': 'Revoir sur M6+',
  'w9': 'Revoir sur M6+',
  '6ter': 'Revoir sur M6+',
  'gulli': 'Revoir sur M6+',
  'arte': 'Revoir sur ARTE',
};

const STOPWORDS = new Set([
  'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'ou', 'sur', 'dans', 'avec', 'pour',
  'ce', 'cet', 'cette', 'ces', 'soir', 'demain', 'aujourdhui', 'aujourd', 'hui', 'episode',
  'saison', 'partie', 'film', 'serie', 'emission', 'direct', 'programme', 'tv'
]);

const normalizeForMatch = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getTopKeywords = (value: string, maxKeywords = 6): string[] => {
  const words = normalizeForMatch(value)
    .split(' ')
    .filter(word => word.length >= 4 && !STOPWORDS.has(word));
  return Array.from(new Set(words)).slice(0, maxKeywords);
};

const getCategoryInsights = (rawCategory: string): {
  watchReason: string;
  relatedCategories: string[];
} => {
  const category = normalizeForMatch(rawCategory);

  if (category.includes('film') || category.includes('cinema') || category.includes('movie')) {
    return {
      watchReason: 'Les films en prime time fonctionnent bien quand vous voulez une histoire complète sur un seul créneau.',
      relatedCategories: ['Séries', 'Divertissement', 'Documentaires'],
    };
  }
  if (category.includes('serie') || category.includes('fiction') || category.includes('sitcom') || category.includes('soap')) {
    return {
      watchReason: 'Les séries sont adaptées si vous suivez des personnages récurrents et une intrigue continue.',
      relatedCategories: ['Films', 'Divertissement', 'Culture'],
    };
  }
  if (category.includes('sport')) {
    return {
      watchReason: 'Le sport est particulièrement pertinent en direct, car le résultat et le rythme changent en temps réel.',
      relatedCategories: ['Info', 'Documentaires', 'Divertissement'],
    };
  }
  if (category.includes('info') || category.includes('journal') || category.includes('actualite') || category.includes('news')) {
    return {
      watchReason: 'Les programmes d’information permettent de garder rapidement le contexte sur les sujets du jour.',
      relatedCategories: ['Documentaires', 'Culture', 'Sport'],
    };
  }
  if (category.includes('documentaire') || category.includes('decouverte')) {
    return {
      watchReason: 'Les documentaires apportent de la profondeur et du contexte sur des sujets de fond.',
      relatedCategories: ['Culture', 'Info', 'Films'],
    };
  }

  return {
    watchReason: 'Ce format est adapté pour organiser votre soirée TV sur un horaire clair.',
    relatedCategories: ['Films', 'Séries', 'Divertissement'],
  };
};

interface RelatedProgramSuggestion {
  channel: Channel;
  program: Program;
  score: number;
}

type EnrichmentProgramRow = {
  synopsis?: string;
  attribution_text?: string;
  confidence?: number;
  license_name?: string;
  attribution_required?: boolean;
  usage_scope?: string;
};

interface ProgramFAQItem {
  question: string;
  answer: string;
}

interface ProgramPageProps {
  channel: Channel;
  program: Program;
  allChannels?: Channel[];
  onBackToChannel: () => void;
  onBackHome: () => void;
  onDescriptionVisibilityChange?: (isVisible: boolean) => void;
}

export const ProgramPage: React.FC<ProgramPageProps> = ({ channel, program, allChannels = [], onBackToChannel, onBackHome, onDescriptionVisibilityChange }) => {
  const now = useMemo(() => getNowInParis(), []);
  const startDate = useMemo(() => new Date(program.startTime), [program.startTime]);
  const endDate = useMemo(() => new Date(program.endTime), [program.endTime]);
  const [logoError, setLogoError] = useState(false);
  const [posterError, setPosterError] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);
  const [isDescriptionVisible, setIsDescriptionVisible] = useState(true);
  const hasChannelNumber = hasValidChannelNumber(channel.number);
  const channelNumberLabel = getChannelNumberLabel(channel.number);
  const enrichmentTable = import.meta.env.VITE_SUPABASE_ENRICHMENT_TABLE;
  const [enrichedSynopsis, setEnrichedSynopsis] = useState('');
  const [enrichmentAttribution, setEnrichmentAttribution] = useState('');
  const [relatedProgramSuggestionsRemote, setRelatedProgramSuggestionsRemote] = useState<RelatedProgramSuggestion[]>([]);
  const [linkedEntityType, setLinkedEntityType] = useState<EntityType | null>(null);
  const [linkedEntityItem, setLinkedEntityItem] = useState<EntityIndexItem | null>(null);
  const [linkedEntity, setLinkedEntity] = useState<AnyEntity | null>(null);
  const [birthdayArticle, setBirthdayArticle] = useState<BirthdayArticlePayload | null>(null);
  // Guard: only fetch remote suggestions once per program to avoid infinite loops
  const remoteSuggestionsFetchedRef = useRef(false);

  // Get logo with fallback
  const logoUrl = useMemo(() => {
    if (logoError) {
      return getChannelLogo(channel.id, null, channel.name);
    }
    return getChannelLogo(channel.id, channel.logo, channel.name);
  }, [channel.id, channel.logo, channel.name, logoError]);

  const isLive = useMemo(() => {
    const nowTime = now.getTime();
    return nowTime >= startDate.getTime() && nowTime <= endDate.getTime();
  }, [now, startDate, endDate]);

  const formattedDate = startDate.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const durationMinutes = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 60000));

  useEffect(() => {
    if (!enrichmentTable) return;

    let cancelled = false;

    const loadProgramEnrichment = async () => {
      try {
        const { data, error } = await supabase
          .from(enrichmentTable)
          .select('synopsis, attribution_text, confidence, license_name, attribution_required, usage_scope')
          .eq('entity_kind', 'program')
          .eq('entity_id', String(program.id))
          .eq('verification_status', 'verified')
          .order('confidence', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled || error || !data) return;

        const row = data as EnrichmentProgramRow;
        const licenseName = String(row.license_name || '').trim();
        const requiresAttribution = Boolean(row.attribution_required);
        const attributionText = String(row.attribution_text || '').trim();
        const usageScope = String(row.usage_scope || '').trim().toLowerCase();
        const scopeAllowed = !usageScope || usageScope === 'editorial' || usageScope === 'both';
        const synopsis = String(row.synopsis || '').trim();

        if (!scopeAllowed || !licenseName || licenseName === 'unknown' || !synopsis) return;
        if (requiresAttribution && !attributionText) return;

        setEnrichedSynopsis(synopsis);
        setEnrichmentAttribution(attributionText);
      } catch {
        // Optional enrichment: ignore when table or rows are unavailable.
      }
    };

    loadProgramEnrichment();
    return () => {
      cancelled = true;
    };
  }, [program.id, enrichmentTable]);

  useEffect(() => {
    let cancelled = false;

    const loadLinkedEntity = async () => {
      const entityType = inferEntityTypeFromProgram(program);
      setLinkedEntityType(entityType);
      setLinkedEntityItem(null);
      setLinkedEntity(null);
      if (!entityType) return;

      const indexPayload = await fetchEntityIndex(entityType);
      if (cancelled) return;

      const matchedItem = findEntityIndexMatch(indexPayload, entityType, program.title);
      setLinkedEntityItem(matchedItem);
      if (!matchedItem) return;

      const entityPayload = await fetchEntity(entityType, matchedItem.slug, { force: true });
      if (cancelled) return;
      setLinkedEntity(entityPayload);
    };

    loadLinkedEntity();

    return () => {
      cancelled = true;
    };
  }, [program]);

  const programDescription = useMemo(() => {
    const original = String(program.description || '').replace(/\s+/g, ' ').trim();
    if (original.length > 0) return original;
    const enriched = String(enrichedSynopsis || '').replace(/\s+/g, ' ').trim();
    if (enriched.length > 0) return enriched;

    return `${program.title} est diffusé le ${formattedDate} sur ${channel.name} de ${formatTime(startDate)} à ${formatTime(endDate)}. ` +
      `Cette diffusion dure environ ${durationMinutes} minutes et s'inscrit dans la catégorie ${program.category || 'TV'}.`;
  }, [program.description, enrichedSynopsis, program.title, formattedDate, channel.name, startDate, endDate, durationMinutes, program.category]);

  const categoryInsights = useMemo(() => {
    return getCategoryInsights(program.category || '');
  }, [program.category]);

  const titleKeywords = useMemo(() => {
    return getTopKeywords(`${program.title} ${programDescription}`);
  }, [program.title, programDescription]);

  const watchReasons = useMemo(() => {
    const reasons = [
      isLive
        ? `Le programme est en cours de diffusion sur ${channel.name}.`
        : `Créneau clair: ${formatTime(startDate)} - ${formatTime(endDate)} (${durationMinutes} minutes).`,
      categoryInsights.watchReason,
      hasChannelNumber
        ? `Accès rapide via la chaîne ${channelNumberLabel}.`
        : `${channel.name} est accessible directement via la navigation par chaîne.`,
    ];

    const startHour = startDate.getHours();
    if (startHour >= 20 && startHour <= 22) {
      reasons.push('Horaire de prime time, adapté à une soirée TV sur un programme principal.');
    }

    if ((programDescription || '').length >= 140) {
      reasons.push('La fiche contient déjà une description suffisamment riche pour évaluer le contenu.');
    }

    return Array.from(new Set(reasons)).slice(0, 4);
  }, [
    isLive,
    channel.name,
    channelNumberLabel,
    hasChannelNumber,
    startDate,
    endDate,
    durationMinutes,
    categoryInsights.watchReason,
    programDescription,
  ]);

  const relatedProgramSuggestions = useMemo(() => {
    if (!allChannels.length) return [];

    const currentStart = startDate.getTime();
    const currentEnd = endDate.getTime();
    const currentCategory = normalizeForMatch(program.category || '');

    const scored: RelatedProgramSuggestion[] = [];
    allChannels.forEach(candidateChannel => {
      if (!candidateChannel?.programs?.length || candidateChannel.id === channel.id) return;

      candidateChannel.programs.forEach(candidateProgram => {
        if (!candidateProgram || candidateProgram.id === program.id) return;

        const candidateStart = new Date(candidateProgram.startTime).getTime();
        const candidateEnd = new Date(candidateProgram.endTime).getTime();
        if (Number.isNaN(candidateStart) || Number.isNaN(candidateEnd)) return;

        const candidateCategory = normalizeForMatch(candidateProgram.category || '');
        const candidateText = normalizeForMatch(`${candidateProgram.title} ${candidateProgram.description || ''}`);
        const overlap = candidateStart < currentEnd && candidateEnd > currentStart;
        const timeDistance = Math.min(
          Math.abs(candidateStart - currentStart),
          Math.abs(candidateEnd - currentEnd)
        );

        let score = 0;
        if (overlap) score += 4;
        if (timeDistance <= 90 * 60 * 1000) score += 2;
        if (currentCategory && candidateCategory && (
          candidateCategory.includes(currentCategory) || currentCategory.includes(candidateCategory)
        )) {
          score += 4;
        }
        titleKeywords.forEach(keyword => {
          if (candidateText.includes(keyword)) score += 1;
        });

        if (score >= 5) {
          scored.push({ channel: candidateChannel, program: candidateProgram, score });
        }
      });
    });

    scored.sort((a, b) => b.score - a.score);
    const uniqueByChannel = new Set<string>();
    const uniqueResults: RelatedProgramSuggestion[] = [];
    for (const item of scored) {
      if (uniqueByChannel.has(item.channel.id)) continue;
      uniqueByChannel.add(item.channel.id);
      uniqueResults.push(item);
      if (uniqueResults.length >= 4) break;
    }

    return uniqueResults;
  }, [allChannels, channel.id, program.id, program.category, startDate, endDate, titleKeywords]);

  // Reset fetch guard when the program changes
  useEffect(() => {
    remoteSuggestionsFetchedRef.current = false;
    setRelatedProgramSuggestionsRemote([]);
  }, [program.id]);

  useEffect(() => {
    // Bail out if local suggestions are available (no remote needed)
    if (relatedProgramSuggestions.length > 0) return;

    // Bail out if we already fetched for this program (prevents infinite loop)
    if (remoteSuggestionsFetchedRef.current) return;
    remoteSuggestionsFetchedRef.current = true;

    let cancelled = false;

    const loadRemoteSuggestions = async () => {
      try {
        const currentStart = startDate.getTime();
        const currentEnd = endDate.getTime();
        const currentCategory = normalizeForMatch(program.category || '');
        const currentTitleKeywords = titleKeywords;
        const fromIso = new Date(currentStart - 90 * 60 * 1000).toISOString();
        const toIso = new Date(currentEnd + 120 * 60 * 1000).toISOString();

        const { data, error } = await supabase
          .from(PROGRAMS_TABLE)
          .select(`id, title, description, start_time, end_time, genre, channel_id, channels:${CHANNELS_TABLE}(name, logo_url, channel_number)`)
          .neq('channel_id', String(channel.id))
          .gte('start_time', fromIso)
          .lte('start_time', toIso)
          .order('start_time', { ascending: true })
          .limit(600);

        if (cancelled || error || !data || !Array.isArray(data)) {
          if (!cancelled) setRelatedProgramSuggestionsRemote([]);
          return;
        }

        const scored: RelatedProgramSuggestion[] = [];
        (data as any[]).forEach(row => {
          const candidateStart = new Date(row.start_time).getTime();
          const candidateEnd = new Date(row.end_time).getTime();
          if (Number.isNaN(candidateStart) || Number.isNaN(candidateEnd)) return;

          const candidateCategory = normalizeForMatch(row.genre || '');
          const candidateText = normalizeForMatch(`${row.title || ''} ${row.description || ''}`);
          const overlap = candidateStart < currentEnd && candidateEnd > currentStart;
          const timeDistance = Math.min(
            Math.abs(candidateStart - currentStart),
            Math.abs(candidateEnd - currentEnd)
          );

          let score = 0;
          if (overlap) score += 4;
          if (timeDistance <= 90 * 60 * 1000) score += 2;
          if (currentCategory && candidateCategory && (
            candidateCategory.includes(currentCategory) || currentCategory.includes(candidateCategory)
          )) {
            score += 4;
          }
          currentTitleKeywords.forEach(keyword => {
            if (candidateText.includes(keyword)) score += 1;
          });
          if (score < 5) return;

          const channelName = String(row.channels?.name || row.channel_id || '').trim();
          const channelLogo = String(row.channels?.logo_url || '').trim();
          const channelNumber = resolveChannelNumber(
            row.channels?.channel_number,
            row.channel_id,
            channelName
          );

          scored.push({
            score,
            channel: {
              id: String(row.channel_id || ''),
              name: channelName || String(row.channel_id || ''),
              number: channelNumber,
              logo: channelLogo || '',
              type: 'Generalista',
              programs: [],
            },
            program: {
              id: String(row.id || ''),
              title: String(row.title || ''),
              startTime: String(row.start_time || ''),
              endTime: String(row.end_time || ''),
              category: String(row.genre || 'Général'),
              description: String(row.description || ''),
            },
          });
        });

        scored.sort((a, b) => b.score - a.score);
        const uniqueByChannel = new Set<string>();
        const uniqueResults: RelatedProgramSuggestion[] = [];
        for (const item of scored) {
          if (!item.channel.id || uniqueByChannel.has(item.channel.id)) continue;
          uniqueByChannel.add(item.channel.id);
          uniqueResults.push(item);
          if (uniqueResults.length >= 4) break;
        }

        if (!cancelled) {
          setRelatedProgramSuggestionsRemote(uniqueResults);
        }
      } catch {
        if (!cancelled) {
          setRelatedProgramSuggestionsRemote([]);
        }
      }
    };

    loadRemoteSuggestions();

    return () => {
      cancelled = true;
    };
    // Only depends on stable values: program.id is the unique key, plus the invariant data needed for the query.
    // Intentionally NOT including relatedProgramSuggestions.length to avoid the circular loop:
    // the guard at the top (remoteSuggestionsFetchedRef) ensures we fire only once per program.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program.id, channel.id]);

  const effectiveRelatedProgramSuggestions = useMemo(() => {
    if (relatedProgramSuggestions.length > 0) return relatedProgramSuggestions;
    return relatedProgramSuggestionsRemote;
  }, [relatedProgramSuggestions, relatedProgramSuggestionsRemote]);

  const linkedEntityCast = useMemo(() => {
    if (!linkedEntity || !('cast' in linkedEntity) || !Array.isArray(linkedEntity.cast)) return [];
    return linkedEntity.cast.slice(0, 8);
  }, [linkedEntity]);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentBirthdayArticle().then((payload) => {
      if (cancelled) return;
      setBirthdayArticle(payload);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const birthdayRelatedToProgram = useMemo(() => {
    if (!birthdayArticle) return false;

    const actorSlugMatch = linkedEntityCast.some((person) => person.slug === birthdayArticle.selectedSlug);
    if (actorSlugMatch) return true;

    const channelSlug = getChannelSlug(channel.id);
    return (birthdayArticle.upcomingAirings || []).some((airing) => {
      if (airing.channelSlug !== channelSlug) return false;
      return normalizeForMatch(airing.title || '') === normalizeForMatch(program.title || '');
    });
  }, [birthdayArticle, linkedEntityCast, channel.id, program.title]);

  const editorialParagraphs = useMemo(() => {
    const primary = `${program.title} est programmé le ${formattedDate} sur ${channel.name} à ${formatTime(startDate)} pour environ ${durationMinutes} minutes. ` +
      `${categoryInsights.watchReason}`;

    const alternatives = effectiveRelatedProgramSuggestions.length > 0
      ? 'Si vous cherchez une alternative sur le même créneau, cette page propose aussi des options proches sur d’autres chaînes.'
      : 'Si vous hésitez encore, vous pouvez parcourir les recommandations par genre et horaire.';

    const secondary = `La diffusion se termine vers ${formatTime(endDate)}. ` +
      `Après ce créneau, ${channel.name} enchaîne généralement avec des formats proches comme ${categoryInsights.relatedCategories.join(', ')}. ` +
      alternatives;

    return [primary, secondary];
  }, [
    program.title,
    formattedDate,
    channel.name,
    startDate,
    durationMinutes,
    categoryInsights.watchReason,
    endDate,
    categoryInsights.relatedCategories,
    effectiveRelatedProgramSuggestions.length,
  ]);

  const faqItems = useMemo<ProgramFAQItem[]>(() => {
    return [
      {
        question: `À quelle heure passe ${program.title} ?`,
        answer: `${program.title} est diffusé le ${formattedDate} de ${formatTime(startDate)} à ${formatTime(endDate)} sur ${channel.name}.`,
      },
      {
        question: `Sur quelle chaîne regarder ${program.title} ?`,
        answer: hasChannelNumber
          ? `Le programme est diffusé sur ${channel.name} (chaîne ${channelNumberLabel}).`
          : `Le programme est diffusé sur ${channel.name}; le numéro de chaîne n’est pas renseigné dans les données actuelles.`,
      },
      {
        question: 'Que regarder en alternative sur le même créneau ?',
        answer: effectiveRelatedProgramSuggestions.length > 0
          ? `Cette page liste ${effectiveRelatedProgramSuggestions.length} alternative(s) proches sur d’autres chaînes.`
          : 'Utilisez la section recommandations pour trouver des programmes proches par genre et horaire.',
      },
    ];
  }, [
    program.title,
    formattedDate,
    startDate,
    endDate,
    channel.name,
    hasChannelNumber,
    channelNumberLabel,
    effectiveRelatedProgramSuggestions.length,
  ]);

  // SEO
  const channelSlug = getChannelSlug(channel.id);
  const isRadio = channel.isRadio || false;
  const posterUrl = useMemo(() => {
    return String((program as any).posterUrl || (program as any).poster_url || '').trim();
  }, [program]);
  const canonicalProgramUrl = isRadio
    ? `/radio/${channelSlug}/${getProgramSlugFromTitle(program.title)}`
    : getProgramUrl(channelSlug, program.title);
  const urlInfo = useMemo(() => {
    if (typeof window === 'undefined' || isRadio) return null;
    return parseProgramUrl(window.location.pathname);
  }, [isRadio]);
  const hasAiringVariant = !isRadio && Boolean(urlInfo?.programAiringToken);
  const canonicalProgramAbsoluteUrl = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    return `${window.location.origin}${canonicalProgramUrl}`;
  }, [canonicalProgramUrl]);
  const seoTitle = `${program.title} - ${channel.name} ${formattedDate} | Programme Ce Soir`;
  const seoDescription = programDescription ||
    `${program.title} sur ${channel.name} le ${formattedDate} à ${formatTime(startDate)}. ${program.category ? `Genre : ${program.category}.` : ''} Retrouvez tous les détails du programme.`;

  // Get image for Open Graph
  const ogImage = useMemo(() => {
    return posterUrl || logoUrl;
  }, [logoUrl, posterUrl]);

  // Get channel URL for breadcrumbs
  const channelUrlForBreadcrumb = useMemo(() => {
    return getChannelUrl(channel.id, false, 'aujourdhui');
  }, [channel.id]);

  const getSuggestionUrl = (item: RelatedProgramSuggestion): string => {
    const suggestionChannelSlug = getChannelSlug(item.channel.id);
    if (item.channel.isRadio) {
      return `/radio/${suggestionChannelSlug}/${getProgramSlugFromTitle(item.program.title)}`;
    }
    return getProgramUrl(suggestionChannelSlug, item.program.title);
  };

  // Handle reminder download
  const handleSaveReminder = () => {
    const siteUrl = window.location.origin;
    const reminderUrl = isRadio
      ? `${siteUrl}/radio/${channelSlug}/${getProgramSlugFromTitle(program.title)}`
      : `${siteUrl}${getProgramUrl(channelSlug, program.title)}`;

    const icsOptions = {
      title: `Regarder ${program.title} sur ${channel.name}`,
      description: programDescription || `${program.title} sur ${channel.name}`,
      startTime: startDate,
      endTime: endDate,
      location: channel.name,
      url: reminderUrl,
      reminderMinutes: 15,
    };

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      openGoogleCalendar(icsOptions);
    } else {
      downloadICS(icsOptions, `${program.title.replace(/[^a-z0-9]/gi, '_')}_${channel.name.replace(/[^a-z0-9]/gi, '_')}.ics`);
    }

    trackSaveReminder(program.title, channel.name);
  };

  useSEO({
    title: seoTitle,
    description: seoDescription,
    url: canonicalProgramUrl,
    canonicalUrl: canonicalProgramAbsoluteUrl,
    image: ogImage,
    type: 'article',
    publishedTime: program.startTime,
    channelName: channel.name,
    programTitle: program.title,
    programStartTime: program.startTime,
    programEndTime: program.endTime,
    category: program.category,
    channelUrl: channelUrlForBreadcrumb,
    noindex: hasAiringVariant,
  });

  useEffect(() => {
    const oldScript = document.querySelector('script[data-seo-program-faq="1"]');
    if (oldScript) oldScript.remove();

    const pageUrl = `${window.location.origin}${canonicalProgramUrl}`;
    const faqStructuredData = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      '@id': `${pageUrl}#faq`,
      mainEntityOfPage: pageUrl,
      author: { '@id': `${window.location.origin}/#organization` },
      publisher: { '@id': `${window.location.origin}/#organization` },
      mainEntity: faqItems.map(item => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo-program-faq', '1');
    script.textContent = JSON.stringify(faqStructuredData);
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [faqItems, canonicalProgramUrl]);

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

  const replayUrl = useMemo(() => {
    return String((program as any).replayUrl || (program as any).replay_url || '').trim();
  }, [program]);

  const replayLabel = useMemo(() => {
    return REPLAY_LABELS[String(channel.id || '').trim()] || 'Revoir en replay';
  }, [channel.id]);

  // Track description visibility for favorite button
  useEffect(() => {
    setLogoError(false);
  }, [channel.id, channel.logo, channel.name]);

  useEffect(() => {
    setPosterError(false);
  }, [program.id, posterUrl]);

  // Track description visibility for favorite button
  useEffect(() => {
    if (!onDescriptionVisibilityChange || !descriptionRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const visible = entry.isIntersecting;
          setIsDescriptionVisible(visible);
          if (onDescriptionVisibilityChange) {
            onDescriptionVisibilityChange(visible);
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(descriptionRef.current);

    return () => {
      if (descriptionRef.current) {
        observer.unobserve(descriptionRef.current);
      }
    };
  }, [onDescriptionVisibilityChange]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Breadcrumbs */}
      <nav className="bg-white border-b border-slate-100 py-3">
        <div className="container mx-auto px-4">
          <ul className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
            <li><button onClick={onBackHome} className="hover:text-blue-600">Accueil</button></li>
            <li>/</li>
            <li><button onClick={onBackToChannel} className="hover:text-blue-600 uppercase">{channel.name}</button></li>
            <li>/</li>
            <li className="text-blue-600 truncate max-w-[150px] sm:max-w-none">{program.title}</li>
          </ul>
        </div>
      </nav>

      {birthdayArticle && birthdayRelatedToProgram ? (
        <div className="container mx-auto px-4 pt-6">
          <BirthdaySpotlight article={birthdayArticle} context="program" />
        </div>
      ) : null}

      {/* Hero Section - High Impact */}
      <section className="relative bg-slate-900 text-white overflow-hidden py-16 md:py-24">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-gradient-to-b from-blue-600/20 to-transparent pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="flex flex-col md:flex-row gap-10 items-center">
            <div className={`flex-shrink-0 w-48 h-64 md:w-72 md:h-80 rounded-[2.5rem] border border-white/10 backdrop-blur-md shadow-2xl relative group overflow-hidden ${posterUrl && !posterError ? 'bg-slate-800 p-0' : 'bg-white/5 p-8 flex items-center justify-center'}`}>
              {posterUrl && !posterError ? (
                <img
                  src={posterUrl}
                  alt={`Image du programme ${program.title}`}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  loading="eager"
                  onError={() => setPosterError(true)}
                />
              ) : (
                <img
                  src={logoUrl}
                  alt={channel.name}
                  className="w-full h-full object-contain drop-shadow-2xl group-hover:scale-110 transition-transform duration-500"
                  onError={() => setLogoError(true)}
                />
              )}
              {posterUrl && !posterError && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-200">Image programme</p>
                  <p className="mt-1 text-sm font-extrabold text-white line-clamp-2">{program.title}</p>
                </div>
              )}
              {isLive && (
                <span className="absolute -top-3 -right-3 bg-rose-500 text-white text-[10px] font-black px-4 py-1.5 rounded-full shadow-lg animate-pulse ring-4 ring-slate-900">
                  EN DIRECT
                </span>
              )}
            </div>

            <div className="flex-1 text-center md:text-left">
              <div className="flex flex-wrap justify-center md:justify-start items-center gap-3 mb-6">
                <span className="px-4 py-1 bg-blue-600 text-white rounded-full text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-900/40">
                  {program.category}
                </span>
                <span className="text-blue-400 font-bold text-sm uppercase tracking-widest">
                  Sur {channel.name}
                </span>
              </div>

              <h1 className="text-4xl md:text-7xl font-black tracking-tighter mb-4 leading-tight">
                {program.title}
              </h1>

              <div className="flex flex-col md:flex-row items-center gap-6 text-slate-300 font-medium text-lg">
                <div className="flex items-center gap-2">
                  <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="capitalize">{formattedDate}</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Heure {formatTime(startDate)} - {formatTime(endDate)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content Area */}
      <section className="container mx-auto px-4 py-12 -mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Main Info */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 p-8 md:p-12 border border-slate-100">
              <h2 className="text-3xl font-black text-slate-900 mb-8 flex items-center gap-4">
                <span className="w-2 h-10 bg-blue-600 rounded-full"></span>
                Résumé et détails
              </h2>
              <div ref={descriptionRef} className="prose prose-slate prose-lg max-w-none">
                <p className="text-slate-600 leading-relaxed text-xl mb-8 font-medium">
                  {programDescription}
                </p>
                {!program.description && enrichedSynopsis && enrichmentAttribution && (
                  <p className="text-xs text-slate-400 -mt-4 mb-6">
                    Source complémentaire: {enrichmentAttribution}
                  </p>
                )}
                <p className="text-slate-500 leading-relaxed">
                  Suivez <strong>{program.title}</strong> le {formattedDate} sur <strong>{channel.name}</strong>{hasChannelNumber ? ` (chaîne ${channelNumberLabel})` : ''}.
                  Ce programme de catégorie <em>{program.category}</em> fait partie des contenus visibles dans la grille de la journée.
                  Le rendez-vous démarre à {formatTime(startDate)}.
                </p>

                <div className="mt-8 space-y-4 not-prose">
                  {editorialParagraphs.map((paragraph, index) => (
                    <p key={`editorial-${index}`} className="text-slate-600 leading-relaxed text-base">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>

              <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500 mb-4">
                    Pourquoi regarder
                  </h3>
                  <ul className="space-y-3">
                    {watchReasons.map((reason, index) => (
                      <li key={`reason-${index}`} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-blue-600 flex-shrink-0"></span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-6">
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500 mb-4">
                    Thématiques proches
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {categoryInsights.relatedCategories.map(category => (
                      <span
                        key={category}
                        className="px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold"
                      >
                        {category}
                      </span>
                    ))}
                    {titleKeywords.slice(0, 3).map(keyword => (
                      <span
                        key={keyword}
                        className="px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500 mb-4">
                  Questions fréquentes
                </h3>
                <div className="space-y-4">
                  {faqItems.map((item, index) => (
                    <div key={`faq-${index}`} className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                      <p className="font-bold text-slate-900 text-sm mb-1">{item.question}</p>
                      <p className="text-slate-600 text-sm leading-relaxed">{item.answer}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Bar */}
              <div className="mt-12 pt-10 border-t border-slate-100 flex flex-wrap gap-4 items-center">
                <button
                  onClick={onBackToChannel}
                  className="px-8 py-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-extrabold rounded-2xl transition-all flex items-center gap-3"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Programmes {channel.name} aujourd’hui
                </button>
                {isDescriptionVisible && (
                  <button
                    onClick={handleSaveReminder}
                    className="hidden md:flex px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl shadow-lg shadow-blue-200 transition-all items-center gap-3"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Rappel
                  </button>
                )}
                {!isDescriptionVisible && (
                  <button
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="hidden md:flex px-8 py-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-extrabold rounded-2xl transition-all items-center gap-3"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                    Retour en haut
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="space-y-8">
            <div className="bg-slate-50 rounded-[2.5rem] p-8 border-2 border-slate-300 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-16 h-16 bg-white rounded-2xl p-3 border border-slate-200 flex items-center justify-center shadow-sm">
                  <img
                    src={logoUrl}
                    alt={channel.name}
                    className="w-full h-full object-contain"
                    onError={() => {
                      if (!logoError) {
                        console.warn(`[ProgramPage] Logo failed to load for ${channel.name}, using fallback`);
                        setLogoError(true);
                      }
                    }}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-black text-slate-900 text-lg uppercase tracking-tight leading-none">{channel.name}</h4>
                    {isRadio && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold uppercase rounded">
                        Radio
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mt-1">
                    {isRadio ? 'Fréquence' : 'Chaîne'} {channelNumberLabel}
                  </p>
                </div>
              </div>
              <p className="text-slate-500 text-sm leading-relaxed mb-8">
                {getChannelDescription(channel)}
              </p>
              {!isRadio && tvStream && (
                <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-[10px] font-black text-blue-700 uppercase tracking-[0.2em] mb-3">
                    En direct officiel
                  </p>
                  <a
                    href={tvStream.streamUrl}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    Regarder en direct
                  </a>
                  {tvStream.provider && (
                    <p className="text-[11px] text-blue-700/80 mt-2">
                      Source: {tvStream.provider}
                    </p>
                  )}
                </div>
              )}
              {!isRadio && replayUrl && (
                <div className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                  <p className="text-[10px] font-black text-indigo-700 uppercase tracking-[0.2em] mb-3">
                    Replay officiel
                  </p>
                  <a
                    href={replayUrl}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    {replayLabel}
                  </a>
                </div>
              )}
              {isRadio && radioStream && (
                <a
                  href={radioStream.streamUrl}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  className="w-full mb-4 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                  </svg>
                  Écouter en direct
                </a>
              )}
              <button
                onClick={onBackToChannel}
                className="w-full py-4 bg-white hover:bg-blue-600 hover:text-white border border-slate-200 hover:border-blue-600 text-blue-600 font-black rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2"
              >
                Toute la grille
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>

            {effectiveRelatedProgramSuggestions.length > 0 && (
              <div className="bg-white rounded-[2.5rem] p-8 border-2 border-slate-300 shadow-md">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 text-center">Alternatives proches</h4>
                <div className="space-y-3">
                  {effectiveRelatedProgramSuggestions.map((item) => (
                    <a
                      key={`${item.channel.id}-${item.program.id}`}
                      href={getSuggestionUrl(item)}
                      className="block p-4 bg-slate-50 rounded-2xl hover:bg-blue-50 border-2 border-transparent hover:border-blue-300 transition-all"
                    >
                      <span className="text-slate-900 font-bold text-sm leading-tight block mb-1">{item.program.title}</span>
                      <span className="text-[11px] text-slate-500">{item.channel.name} • {new Date(item.program.startTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {(linkedEntityItem || linkedEntityCast.length > 0) && (
              <div className="bg-white rounded-[2.5rem] p-8 border-2 border-slate-300 shadow-md">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 text-center">Entité liée</h4>
                <div className="space-y-4">
                  {linkedEntityItem && (
                    <a
                      href={linkedEntityItem.href}
                      className="block p-4 bg-slate-50 rounded-2xl hover:bg-blue-50 border-2 border-transparent hover:border-blue-300 transition-all"
                    >
                      <span className="text-slate-900 font-bold text-sm leading-tight block mb-1">
                        {linkedEntityType === 'film' ? 'Voir la fiche film' : 'Voir la fiche série'}
                      </span>
                      <span className="text-[12px] text-slate-500">{linkedEntityItem.title}</span>
                    </a>
                  )}

                  {linkedEntityCast.length > 0 && (
                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.22em] mb-3">
                        Acteurs principaux
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {linkedEntityCast.map((person) => (
                          hasEntityPage('actor', person.slug) ? (
                            <a
                              key={`${person.slug}-${person.name}`}
                              href={`/acteur/${person.slug}`}
                              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:border-blue-400 hover:text-blue-600"
                            >
                              {person.name}
                            </a>
                          ) : (
                            <span
                              key={`${person.slug}-${person.name}`}
                              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-500"
                            >
                              {person.name}
                            </span>
                          )
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white rounded-[2.5rem] p-8 border-2 border-slate-300 shadow-md hover:shadow-lg transition-shadow">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 text-center">À découvrir aussi</h4>
              <div className="space-y-4">
                {(() => {
                  const programCategory = program.category?.toLowerCase() || '';
                  let categoryLink: string | null = null;
                  let categoryTitle = '';

                  if (programCategory.includes('film') || programCategory.includes('cinema') || programCategory.includes('movie')) {
                    categoryLink = '/film-ce-soir';
                    categoryTitle = 'Films ce soir à la TV';
                  } else if (programCategory.includes('série') || programCategory.includes('serie') || programCategory.includes('fiction') || programCategory.includes('sitcom') || programCategory.includes('soap')) {
                    categoryLink = '/series-ce-soir';
                    categoryTitle = 'Séries ce soir à la TV';
                  } else if (programCategory.includes('sport')) {
                    categoryLink = '/sport-ce-soir';
                    categoryTitle = 'Sport ce soir à la TV';
                  } else if (programCategory.includes('documentaire') || programCategory.includes('documentary') || programCategory.includes('découverte')) {
                    categoryLink = '/documentaires-ce-soir';
                    categoryTitle = 'Documentaires ce soir à la TV';
                  } else if (programCategory.includes('divertissement') || programCategory.includes('show') || programCategory.includes('magazine') || programCategory.includes('variétés')) {
                    categoryLink = '/divertissement-ce-soir';
                    categoryTitle = 'Divertissements ce soir à la TV';
                  } else if (programCategory.includes('info') || programCategory.includes('journal') || programCategory.includes('actualité') || programCategory.includes('news')) {
                    categoryLink = '/infos-ce-soir';
                    categoryTitle = 'Info ce soir à la TV';
                  }

                  return (
                    <>
                      {categoryLink && (
                        <a
                          href={categoryLink}
                          className="block p-4 bg-slate-50 rounded-2xl hover:bg-blue-50 border-2 border-transparent hover:border-blue-300 transition-all cursor-pointer"
                        >
                          <span className="text-slate-900 font-bold text-sm leading-tight block mb-1">{categoryTitle}</span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Guide complet</span>
                        </a>
                      )}
                      <a
                        href="/films"
                        className="block p-4 bg-slate-50 rounded-2xl hover:bg-blue-50 border-2 border-transparent hover:border-blue-300 transition-all cursor-pointer"
                      >
                        <span className="text-slate-900 font-bold text-sm leading-tight block mb-1">Catalogue films</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Fiches œuvres</span>
                      </a>
                      <a
                        href="/series"
                        className="block p-4 bg-slate-50 rounded-2xl hover:bg-blue-50 border-2 border-transparent hover:border-blue-300 transition-all cursor-pointer"
                      >
                        <span className="text-slate-900 font-bold text-sm leading-tight block mb-1">Catalogue séries</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Fiches œuvres</span>
                      </a>
                      <a
                        href="/acteurs"
                        className="block p-4 bg-slate-50 rounded-2xl hover:bg-blue-50 border-2 border-transparent hover:border-blue-300 transition-all cursor-pointer"
                      >
                        <span className="text-slate-900 font-bold text-sm leading-tight block mb-1">Catalogue acteurs</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Distribution</span>
                      </a>
                      <a
                        href="/"
                        className="block p-4 bg-slate-50 rounded-2xl hover:bg-blue-50 border-2 border-transparent hover:border-blue-300 transition-all cursor-pointer"
                      >
                        <span className="text-slate-900 font-bold text-sm leading-tight block mb-1">Programme TV du {formattedDate}</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Toutes les chaînes</span>
                      </a>
                    </>
                  );
                })()}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
};
