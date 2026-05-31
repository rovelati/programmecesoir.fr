export type EntityType = 'film' | 'series' | 'actor';

export interface EntityChannelSummary {
  channelId: string;
  channelName: string;
  channelSlug: string;
  channelNumber?: number | null;
  logoUrl?: string | null;
  airingsCount: number;
}

export interface EntityAiring {
  id: string;
  title: string;
  programSlug: string;
  programUrl: string;
  channelId: string;
  channelName: string;
  channelSlug: string;
  startTime: string;
  endTime: string;
  date: string;
}

export interface EntityPersonSummary {
  qid?: string | null;
  slug: string;
  name: string;
  role?: string | null;
}

export interface EntityImage {
  url?: string | null;
  source?: string | null;
  license?: string | null;
  attribution?: string | null;
  kind?: 'editorial' | 'generated' | null;
}

export interface EntityExternalIds {
  wikidata?: string | null;
  wikipedia?: string | null;
  imdb?: string | null;
  tmdb?: string | null;
}

export interface FilmEntity {
  type: 'film';
  slug: string;
  title: string;
  airingsCount: number;
  sourceTitles: string[];
  genres: string[];
  description?: string | null;
  descriptionAi?: string | null;
  year?: number | null;
  durationMinutes?: number | null;
  image?: EntityImage | null;
  channels: EntityChannelSummary[];
  upcomingAirings: EntityAiring[];
  externalIds: EntityExternalIds;
  cast: EntityPersonSummary[];
  director?: EntityPersonSummary | null;
  matchConfidence?: number | null;
  nextAiringAt?: string | null;
  lastProgramRefreshAt?: string | null;
  updatedAt: string;
}

export interface SeriesEntity {
  type: 'series';
  slug: string;
  title: string;
  airingsCount: number;
  sourceTitles: string[];
  genres: string[];
  description?: string | null;
  descriptionAi?: string | null;
  startYear?: number | null;
  numberOfSeasons?: number | null;
  image?: EntityImage | null;
  channels: EntityChannelSummary[];
  upcomingAirings: EntityAiring[];
  externalIds: EntityExternalIds;
  cast: EntityPersonSummary[];
  creator?: EntityPersonSummary | null;
  matchConfidence?: number | null;
  nextAiringAt?: string | null;
  lastProgramRefreshAt?: string | null;
  updatedAt: string;
}

export interface ActorEntity {
  type: 'actor';
  slug: string;
  name: string;
  worksCount: number;
  description?: string | null;
  descriptionAi?: string | null;
  image?: EntityImage | null;
  birthDate?: string | null;
  nationality?: string | null;
  jobTitle?: string | null;
  externalIds: EntityExternalIds;
  knownFor: Array<{
    type: 'film' | 'series';
    slug: string;
    title: string;
  }>;
  upcomingAirings: EntityAiring[];
  nextAiringAt?: string | null;
  lastProgramRefreshAt?: string | null;
  updatedAt: string;
}

export type AnyEntity = FilmEntity | SeriesEntity | ActorEntity;

export interface EntityIndexItem {
  slug: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  count: number;
  href: string;
}

export interface EntityIndexPayload {
  type: EntityType;
  title: string;
  description: string;
  items: EntityIndexItem[];
  updatedAt: string;
}
