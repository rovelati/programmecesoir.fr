import type { BirthdayArticlePayload } from '../types/birthday';
import type { NewsPagePayload, NewsStory } from '../types/news';
import type { SocialPerformancePost, SocialPerformanceReport } from '../types/socialPerformance';
import { fetchCurrentBirthdayArticle } from './birthdayData';
import { fetchLatestSocialPerformanceReport } from './socialPerformanceData';

const NEWS_PAGE_URL = '/actualites';
const FALLBACK_IMAGE_URL = '/static/img/programmecesoir-social.jpg';

const cleanWhitespace = (value: string) => String(value || '').replace(/\s+/g, ' ').trim();

const removeUrls = (value: string) => cleanWhitespace(String(value || '').replace(/https?:\/\/\S+/g, ' '));

const stripHashtags = (value: string) => cleanWhitespace(String(value || '').replace(/(^|\s)#[^\s]+/g, ' '));

const truncate = (value: string, maxLength: number) => {
  const normalized = cleanWhitespace(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
};

const extractInternalUrl = (value: string): string | null => {
  const matches = String(value || '').match(/https?:\/\/[^\s]+/g) || [];
  const internal = matches.find((url) => url.includes('programmecesoir.fr'));
  if (!internal) return null;
  try {
    const parsed = new URL(internal);
    if (parsed.pathname.includes('…') || parsed.pathname.includes('%E2%80%A6')) return null;
    return `${parsed.pathname}${parsed.search || ''}`;
  } catch {
    return null;
  }
};

const getSocialEyebrow = (postType: string) => {
  if (postType === 'post5') return 'Film conseillé';
  if (postType === 'post6') return 'Sport conseillé';
  return 'Bluesky';
};

const buildSocialTitle = (row: SocialPerformancePost) => {
  const cleaned = stripHashtags(removeUrls(row.postText || ''));
  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned;
  return truncate(firstSentence || 'Publication Bluesky', 96);
};

const buildSocialExcerpt = (row: SocialPerformancePost) => {
  const cleaned = stripHashtags(removeUrls(row.postText || ''));
  return truncate(cleaned || 'Publication Bluesky de Programme Ce Soir.', 220);
};

export const buildBirthdayNewsStory = (article: BirthdayArticlePayload | null): NewsStory | null => {
  if (!article?.ok) return null;
  return {
    id: `birthday-${article.articleSlug}`,
    kind: 'birthday',
    title: article.title || `Anniversaire de ${article.selectedActor}`,
    excerpt: truncate(article.excerpt || article.metaDescription || '', 260),
    url: '/anniversaire-du-jour',
    imageUrl: article.imageUrl || article.actorImageUrl || FALLBACK_IMAGE_URL,
    imageAlt: article.imageAlt || article.selectedActor,
    eyebrow: article.mode === 'exact' ? 'Anniversaire du jour' : 'Prochain anniversaire',
    sourceLabel: 'Rédaction Programme Ce Soir',
    publishedAt: article.publishedDate || null,
    ctaLabel: "Lire l'article",
  };
};

export const buildSocialNewsStories = (report: SocialPerformanceReport | null): NewsStory[] => {
  const rows = (report?.posts || [])
    .filter((row) => row.platform === 'bluesky' && row.status === 'success' && cleanWhitespace(row.postText || ''))
    .slice(0, 8);
  const stories = rows.map((row, index) => {
    const internalUrl = extractInternalUrl(row.postText || '') || extractInternalUrl(row.postUrl || '') || NEWS_PAGE_URL;
    return {
      id: `social-${row.postType}-${row.postDate || row.createdAt || index}`,
      kind: 'social',
      title: buildSocialTitle(row),
      excerpt: buildSocialExcerpt(row),
      url: internalUrl,
      externalUrl: row.postUrl || null,
      imageUrl: FALLBACK_IMAGE_URL,
      imageAlt: 'Publication Bluesky Programme Ce Soir',
      eyebrow: getSocialEyebrow(row.postType),
      sourceLabel: 'Bluesky',
      publishedAt: row.createdAt || row.postDate || null,
      ctaLabel: internalUrl === NEWS_PAGE_URL ? 'Voir la publication' : 'Voir la page liée',
      metrics: {
        likes: row.metrics.likes,
        reposts: row.metrics.reposts,
        replies: row.metrics.replies,
        quotes: row.metrics.quotes,
      },
    };
  });
  const seen = new Set<string>();
  return stories.filter((story) => {
    const key = `${story.url}|${story.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const buildNewsPagePayload = (
  birthdayArticle: BirthdayArticlePayload | null,
  socialReport: SocialPerformanceReport | null,
  generatedAt = new Date().toISOString(),
): NewsPagePayload => {
  const leadStory = buildBirthdayNewsStory(birthdayArticle);
  const stories = buildSocialNewsStories(socialReport);
  return {
    ok: true,
    generatedAt,
    leadStory,
    stories,
    birthdayArticle,
  };
};

export async function fetchNewsPageData(): Promise<NewsPagePayload> {
  const [birthdayArticle, socialReport] = await Promise.all([
    fetchCurrentBirthdayArticle(),
    fetchLatestSocialPerformanceReport(),
  ]);
  return buildNewsPagePayload(birthdayArticle, socialReport, new Date().toISOString());
}
