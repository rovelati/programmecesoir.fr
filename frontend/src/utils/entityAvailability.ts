import { ENTITY_ROUTES } from '../data/entity-routes';
import type { EntityType } from '../types/entities';

const routeSets: Record<EntityType, Set<string>> = {
  film: new Set((ENTITY_ROUTES.film || []).map((route) => route.replace(/^\/film\//, ''))),
  series: new Set((ENTITY_ROUTES.series || []).map((route) => route.replace(/^\/serie\//, ''))),
  actor: new Set((ENTITY_ROUTES.actor || []).map((route) => route.replace(/^\/acteur\//, ''))),
};

export const hasEntityPage = (type: EntityType, slug?: string | null) => (
  Boolean(slug && routeSets[type].has(String(slug)))
);
