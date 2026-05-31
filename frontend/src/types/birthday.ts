import type { EntityAiring, EntityExternalIds } from './entities';

export interface BirthdayKnownForItem {
  type: 'film' | 'series';
  slug: string;
  title: string;
}

export interface BirthdayUpcomingMatch {
  name: string;
  daysUntilBirthday: number;
}

export interface BirthdayExactMatchItem {
  name: string;
  slug: string;
  age: number | null;
}

export interface BirthdayOgPayload {
  type: string;
  siteName: string;
  locale: string;
  title: string;
  description: string;
  url: string;
  image: string;
}

export interface BirthdayArchiveEntry {
  articleSlug: string;
  selectedActor: string;
  selectedSlug: string;
  publishedDate: string;
  title: string;
  excerpt: string;
  age: number | null;
  actorBirthDate: string | null;
  actorImageUrl: string | null;
  exactMatchCount: number;
}

export interface BirthdayArchivePayload {
  ok: boolean;
  generatedAt: string;
  current: BirthdayArticlePayload | null;
  pastArticles: BirthdayArchiveEntry[];
}

export interface BirthdayArticlePayload {
  ok: boolean;
  mode: 'exact' | 'upcoming';
  dryRun?: boolean;
  publishedDate: string;
  selectedActor: string;
  selectedSlug: string;
  exactMatches: string[];
  exactMatchItems?: BirthdayExactMatchItem[];
  upcomingMatches: BirthdayUpcomingMatch[];
  age: number | null;
  articleSlug: string;
  title: string;
  bodyHtml: string;
  excerpt: string;
  metaDescription: string;
  wordCount: number;
  imageUrl: string | null;
  imageAlt: string | null;
  actorImageUrl: string | null;
  actorBirthDate: string | null;
  actorNationality: string | null;
  actorJobTitle: string | null;
  upcomingAirings: EntityAiring[];
  knownFor: BirthdayKnownForItem[];
  externalIds: EntityExternalIds;
  og: BirthdayOgPayload;
  structuredData: Record<string, unknown>;
}
