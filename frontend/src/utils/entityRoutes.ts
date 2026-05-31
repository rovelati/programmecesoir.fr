import type { EntityType } from '../types/entities';

export const ENTITY_INDEX_PATHS: Record<EntityType, string> = {
  film: '/films',
  series: '/series',
  actor: '/acteurs',
};

export const ENTITY_DETAIL_BASE_PATHS: Record<EntityType, string> = {
  film: '/film',
  series: '/serie',
  actor: '/acteur',
};

export const normalizeEntitySlug = (value: string): string =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

export const getEntityPath = (type: EntityType, slug: string): string =>
  `${ENTITY_DETAIL_BASE_PATHS[type]}/${normalizeEntitySlug(slug)}`;

export const getEntityIndexPath = (type: EntityType): string => ENTITY_INDEX_PATHS[type];

export const parseEntityPath = (
  pathname: string,
): { type: EntityType; slug?: string; isIndex: boolean } | null => {
  const detailMatch = pathname.match(/^\/(film|serie|acteur)\/([^/]+)\/?$/);
  if (detailMatch) {
    const type = detailMatch[1] === 'film' ? 'film' : detailMatch[1] === 'serie' ? 'series' : 'actor';
    return { type, slug: detailMatch[2], isIndex: false };
  }

  const indexMatch = pathname.match(/^\/(films|series|acteurs)\/?$/);
  if (indexMatch) {
    const type = indexMatch[1] === 'films' ? 'film' : indexMatch[1] === 'series' ? 'series' : 'actor';
    return { type, isIndex: true };
  }

  return null;
};
