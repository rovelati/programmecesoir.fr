import type { EntityIndexItem, EntityIndexPayload, EntityType } from '../types/entities';
import type { Program } from '../types';

export const normalizeEntityText = (value: string): string =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const slugifyEntityText = (value: string): string =>
  normalizeEntityText(value).replace(/\s+/g, '-');

export const extractSeriesEntityTitle = (title: string): string =>
  String(title || '')
    .replace(/\s*---\s*s\d+(?:e\d+)?.*$/i, '')
    .replace(/\s+\bs\d+(?:e\d+)?\b.*$/i, '')
    .replace(/\s+\d+-\d+(?:-\d+)*\s*$/i, '')
    .replace(/\([^)]*(?:st\.?|saison|season|ep\.?|episode|épisode)[^)]*\)/gi, '')
    .replace(/\s*[-:]\s*(?:saison|season|st\.?|episode|ep\.?|épisode)\s*\d+.*$/i, '')
    .replace(/\s+\b(?:saison|season|st\.?)\s*\d+\b.*$/i, '')
    .trim();

export const inferEntityTypeFromProgram = (program: Program): EntityType | null => {
  const category = normalizeEntityText(program.category || '');
  const title = String(program.title || '');

  if (
    category.includes('film')
    || category.includes('cinema')
    || category.includes('movie')
    || category.includes('telefilm')
  ) {
    return 'film';
  }

  if (
    category.includes('serie')
    || category.includes('fiction')
    || category.includes('sitcom')
    || category.includes('soap')
    || /(?:st\.?|saison|season|ep\.?|episode|épisode)\s*\d+/i.test(title)
  ) {
    return 'series';
  }

  return null;
};

export const getEntityCandidateSlug = (type: EntityType, title: string): string =>
  slugifyEntityText(type === 'series' ? extractSeriesEntityTitle(title) : title);

export const findEntityIndexMatch = (
  payload: EntityIndexPayload | null,
  type: EntityType,
  title: string,
): EntityIndexItem | null => {
  if (!payload?.items?.length) return null;

  const slug = getEntityCandidateSlug(type, title);
  const exact = payload.items.find((item) => item.slug === slug);
  if (exact) return exact;

  const normalizedTitle = normalizeEntityText(type === 'series' ? extractSeriesEntityTitle(title) : title);
  return payload.items.find((item) => normalizeEntityText(item.title) === normalizedTitle) || null;
};
