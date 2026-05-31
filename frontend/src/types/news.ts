import type { BirthdayArticlePayload } from './birthday';

export interface NewsStory {
  id: string;
  kind: 'birthday' | 'social';
  title: string;
  excerpt: string;
  url: string;
  externalUrl?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  eyebrow: string;
  sourceLabel: string;
  publishedAt?: string | null;
  ctaLabel?: string;
  metrics?: {
    likes?: number | null;
    reposts?: number | null;
    replies?: number | null;
    quotes?: number | null;
  };
}

export interface NewsPagePayload {
  ok: true;
  generatedAt: string;
  leadStory: NewsStory | null;
  stories: NewsStory[];
  birthdayArticle?: BirthdayArticlePayload | null;
}
