/**
 * Pipeline d'images HD 16:9 pour les cards TV guide.
 * Respecte strictement les GUIDELINES_TEMPLATE_TV_GUIDE_CARDS.md :
 * 1. Upscale des URLs TMDb / Broadcaster
 * 2. Blacklist des filigranes tiers (superguidatv, share-1200)
 * 3. Pool Unsplash 16:9 haute résolution par catégorie avec hachage déterministe
 */

import type { ProgramRow } from './supabase';
import { resolveProgramPoster } from './programPoster';

export function upscaleImageUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return null;
  const lower = url.toLowerCase();
  if (lower.includes('superguidatv') || lower.includes('share-1200')) {
    return null;
  }
  return url
    .replace('/media/cache/epg_program_small/', '/')
    .replace('/media/cache/epg_program_medium/', '/')
    .replace('/w200/', '/w780/')
    .replace('/w300/', '/w780/')
    .replace('/w500/', '/w780/');
}

// Pools d'images thématiques 16:9 Unsplash optimisées (1280x720 / q=80)
const CATEGORY_IMAGE_POOLS: Record<string, string[]> = {
  film: [
    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1280&q=80', // Cinema theatre seats
    'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=1280&q=80', // Film reel projector
    'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=1280&q=80', // Movie screen
    'https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=1280&q=80', // Dark cinematic
  ],
  serie: [
    'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?auto=format&fit=crop&w=1280&q=80', // Netflix lounge
    'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?auto=format&fit=crop&w=1280&q=80', // TV screen living room
    'https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=1280&q=80', // TV screen in dark
  ],
  sport: [
    'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1280&q=80', // Football stadium lights
    'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1280&q=80', // Soccer stadium
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1280&q=80', // Sports arena
  ],
  doku: [
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1280&q=80', // Nature ocean
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1280&q=80', // Earth from space
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1280&q=80', // Wildlife lion
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1280&q=80', // Mountains peak
  ],
  info: [
    'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=1280&q=80', // News media studio
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1280&q=80', // Broadcast news
    'https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1280&q=80', // Newspaper headlines
  ],
  divertissement: [
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1280&q=80', // Concert stage show
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1280&q=80', // Event stage lights
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1280&q=80', // Party crowd
  ],
  jeunesse: [
    'https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=1280&q=80', // Colorful balloons
    'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?auto=format&fit=crop&w=1280&q=80', // Cartoon playful colors
  ],
  default: [
    'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?auto=format&fit=crop&w=1280&q=80', // Modern cinema/TV atmosphere
    'https://images.unsplash.com/photo-1524712245354-2c4e5e7121c0?auto=format&fit=crop&w=1280&q=80', // Ambient lights
  ],
};

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function detectCategoryGroup(genre?: string | null, title?: string | null): string {
  const text = `${genre || ''} ${title || ''}`.toLowerCase();
  if (text.includes('film') || text.includes('ciné') || text.includes('thriller') || text.includes('comédie') || text.includes('drame') || text.includes('policier') || text.includes('western')) {
    return 'film';
  }
  if (text.includes('série') || text.includes('serie') || text.includes('feuilleton') || text.includes('sitcom')) {
    return 'serie';
  }
  if (text.includes('sport') || text.includes('football') || text.includes('rugby') || text.includes('tennis') || text.includes('cyclisme') || text.includes('match') || text.includes('formule 1')) {
    return 'sport';
  }
  if (text.includes('docu') || text.includes('découverte') || text.includes('histoire') || text.includes('nature') || text.includes('société') || text.includes('planète') || text.includes('animal')) {
    return 'doku';
  }
  if (text.includes('journal') || text.includes('19/20') || text.includes('20 heures') || text.includes('13 heures') || text.includes('édition') || text.includes('info') || text.includes('actualité') || text.includes('météo') || text.includes('magazine')) {
    return 'info';
  }
  if (text.includes('divertissement') || text.includes('jeu') || text.includes('téléréalité') || text.includes('humour') || text.includes('musique') || text.includes('spectacle') || text.includes('variété') || text.includes('talk')) {
    return 'divertissement';
  }
  if (text.includes('jeunesse') || text.includes('animation') || text.includes('dessin animé') || text.includes('enfant')) {
    return 'jeunesse';
  }
  return 'default';
}

export function getCategoryFallback(catGroup: string, seed: string): string {
  const pool = CATEGORY_IMAGE_POOLS[catGroup] || CATEGORY_IMAGE_POOLS.default;
  const index = simpleHash(seed) % pool.length;
  return pool[index];
}

export interface CardImageResult {
  imageUrl: string;
  isFallback: boolean;
  categoryGroup: string;
}

export function resolveCardHeroImage(program?: Pick<ProgramRow, 'title' | 'genre' | 'poster_url' | 'tmdb_id' | 'start_time'> | null): CardImageResult {
  const catGroup = detectCategoryGroup(program?.genre, program?.title);
  const seed = `${program?.title || 'prog'}-${program?.start_time || 'time'}`;

  if (!program) {
    return {
      imageUrl: getCategoryFallback('default', seed),
      isFallback: true,
      categoryGroup: 'default',
    };
  }

  // 1. Priorité TMDb / poster existant upscalé
  const rawPoster = resolveProgramPoster(program);
  const upscaled = upscaleImageUrl(rawPoster);

  if (upscaled) {
    return {
      imageUrl: upscaled,
      isFallback: false,
      categoryGroup: catGroup,
    };
  }

  // 2. Pool Unsplash 16:9 haute résolution déterministe
  return {
    imageUrl: getCategoryFallback(catGroup, seed),
    isFallback: true,
    categoryGroup: catGroup,
  };
}
