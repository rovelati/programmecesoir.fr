import type { ActorEntity, EntityIndexPayload, FilmEntity, SeriesEntity } from '../types/entities';

const SITE_URL = 'https://programmecesoir.fr';
const asArray = <T,>(values: Array<T | null | undefined>) => values.filter(Boolean) as T[];

const toIsoDuration = (minutes?: number | null) => {
  if (!minutes || minutes <= 0) return undefined;
  return `PT${Math.round(minutes)}M`;
};

export const buildFilmJsonLd = (entity: FilmEntity) => ({
  '@context': 'https://schema.org',
  '@type': 'Movie',
  '@id': `${SITE_URL}/film/${entity.slug}/#movie`,
  url: `${SITE_URL}/film/${entity.slug}`,
  mainEntityOfPage: `${SITE_URL}/film/${entity.slug}`,
  name: entity.title,
  description: entity.descriptionAi || entity.description || entity.title,
  ...(entity.image?.url ? { image: entity.image.url } : {}),
  ...(entity.year ? { datePublished: String(entity.year) } : {}),
  inLanguage: 'fr-FR',
  ...(entity.genres.length ? { genre: entity.genres } : {}),
  ...(entity.durationMinutes ? { duration: toIsoDuration(entity.durationMinutes) } : {}),
  ...(entity.director ? {
    director: {
      '@type': 'Person',
      name: entity.director.name,
      ...(entity.director.qid ? { sameAs: `https://www.wikidata.org/wiki/${entity.director.qid}` } : {}),
    },
  } : {}),
  ...(entity.cast.length ? {
    actor: entity.cast.slice(0, 12).map((person) => ({
      '@type': 'Person',
      name: person.name,
      ...(person.qid ? { sameAs: `https://www.wikidata.org/wiki/${person.qid}` } : {}),
    })),
  } : {}),
  ...(asArray([
    entity.externalIds.wikidata ? `https://www.wikidata.org/wiki/${entity.externalIds.wikidata}` : null,
    entity.externalIds.wikipedia,
    entity.externalIds.imdb ? `https://www.imdb.com/title/${entity.externalIds.imdb}/` : null,
    entity.externalIds.tmdb,
  ]).length ? {
    sameAs: asArray([
      entity.externalIds.wikidata ? `https://www.wikidata.org/wiki/${entity.externalIds.wikidata}` : null,
      entity.externalIds.wikipedia,
      entity.externalIds.imdb ? `https://www.imdb.com/title/${entity.externalIds.imdb}/` : null,
      entity.externalIds.tmdb,
    ]),
  } : {}),
});

export const buildSeriesJsonLd = (entity: SeriesEntity) => ({
  '@context': 'https://schema.org',
  '@type': 'TVSeries',
  '@id': `${SITE_URL}/serie/${entity.slug}/#tvseries`,
  url: `${SITE_URL}/serie/${entity.slug}`,
  mainEntityOfPage: `${SITE_URL}/serie/${entity.slug}`,
  name: entity.title,
  description: entity.descriptionAi || entity.description || entity.title,
  ...(entity.image?.url ? { image: entity.image.url } : {}),
  ...(entity.startYear ? { startDate: String(entity.startYear) } : {}),
  inLanguage: 'fr-FR',
  ...(entity.genres.length ? { genre: entity.genres } : {}),
  ...(entity.numberOfSeasons ? { numberOfSeasons: entity.numberOfSeasons } : {}),
  ...(entity.cast.length ? {
    actor: entity.cast.slice(0, 12).map((person) => ({
      '@type': 'Person',
      name: person.name,
      ...(person.qid ? { sameAs: `https://www.wikidata.org/wiki/${person.qid}` } : {}),
    })),
  } : {}),
  ...(asArray([
    entity.externalIds.wikidata ? `https://www.wikidata.org/wiki/${entity.externalIds.wikidata}` : null,
    entity.externalIds.wikipedia,
    entity.externalIds.imdb ? `https://www.imdb.com/title/${entity.externalIds.imdb}/` : null,
    entity.externalIds.tmdb,
  ]).length ? {
    sameAs: asArray([
      entity.externalIds.wikidata ? `https://www.wikidata.org/wiki/${entity.externalIds.wikidata}` : null,
      entity.externalIds.wikipedia,
      entity.externalIds.imdb ? `https://www.imdb.com/title/${entity.externalIds.imdb}/` : null,
      entity.externalIds.tmdb,
    ]),
  } : {}),
});

export const buildActorJsonLd = (entity: ActorEntity) => ({
  '@context': 'https://schema.org',
  '@type': 'Person',
  '@id': `${SITE_URL}/acteur/${entity.slug}/#person`,
  url: `${SITE_URL}/acteur/${entity.slug}`,
  mainEntityOfPage: `${SITE_URL}/acteur/${entity.slug}`,
  name: entity.name,
  description: entity.descriptionAi || entity.description || entity.name,
  ...(entity.image?.url ? { image: entity.image.url } : {}),
  ...(entity.birthDate ? { birthDate: entity.birthDate } : {}),
  ...(entity.nationality ? { nationality: { '@type': 'Country', name: entity.nationality } } : {}),
  ...(entity.jobTitle ? { jobTitle: entity.jobTitle } : {}),
  ...(asArray([
    entity.externalIds.wikidata ? `https://www.wikidata.org/wiki/${entity.externalIds.wikidata}` : null,
    entity.externalIds.wikipedia,
    entity.externalIds.imdb ? `https://www.imdb.com/name/${entity.externalIds.imdb}/` : null,
    entity.externalIds.tmdb,
  ]).length ? {
    sameAs: asArray([
      entity.externalIds.wikidata ? `https://www.wikidata.org/wiki/${entity.externalIds.wikidata}` : null,
      entity.externalIds.wikipedia,
      entity.externalIds.imdb ? `https://www.imdb.com/name/${entity.externalIds.imdb}/` : null,
      entity.externalIds.tmdb,
    ]),
  } : {}),
});

export const buildEntityIndexJsonLd = (payload: EntityIndexPayload) => ({
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: payload.title,
  description: payload.description,
  url:
    payload.type === 'film'
      ? `${SITE_URL}/films`
      : payload.type === 'series'
        ? `${SITE_URL}/series`
        : `${SITE_URL}/acteurs`,
  hasPart: payload.items.slice(0, 24).map((item) => ({
    '@type': payload.type === 'actor' ? 'Person' : payload.type === 'film' ? 'Movie' : 'TVSeries',
    name: item.title,
    url: `${SITE_URL}${item.href}`,
  })),
});
