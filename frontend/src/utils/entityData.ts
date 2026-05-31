import type { AnyEntity, EntityIndexPayload, EntityType } from '../types/entities';

const entityCache = new Map<string, AnyEntity | null>();
const indexCache = new Map<EntityType, EntityIndexPayload | null>();

const ENTITY_DIRS: Record<EntityType, string> = {
  film: 'films',
  series: 'series',
  actor: 'actors',
};

const entityUrl = (type: EntityType, slug: string) =>
  `/entities-data/${ENTITY_DIRS[type]}/${encodeURIComponent(slug)}.json`;

const indexUrl = (type: EntityType) =>
  `/entities-data/indexes/${ENTITY_DIRS[type]}.json`;

export async function fetchEntity(type: EntityType, slug: string, options: { force?: boolean } = {}): Promise<AnyEntity | null> {
  const cacheKey = `${type}:${slug}`;
  if (!options.force && entityCache.has(cacheKey)) {
    return entityCache.get(cacheKey) || null;
  }

  try {
    const response = await fetch(entityUrl(type, slug), { credentials: 'same-origin' });
    if (!response.ok) {
      entityCache.set(cacheKey, null);
      return null;
    }
    const payload = (await response.json()) as AnyEntity;
    entityCache.set(cacheKey, payload);
    return payload;
  } catch {
    entityCache.set(cacheKey, null);
    return null;
  }
}

export async function fetchEntityIndex(type: EntityType): Promise<EntityIndexPayload | null> {
  if (indexCache.has(type)) {
    return indexCache.get(type) || null;
  }

  try {
    const response = await fetch(indexUrl(type), { credentials: 'same-origin' });
    if (!response.ok) {
      indexCache.set(type, null);
      return null;
    }
    const payload = (await response.json()) as EntityIndexPayload;
    indexCache.set(type, payload);
    return payload;
  } catch {
    indexCache.set(type, null);
    return null;
  }
}
