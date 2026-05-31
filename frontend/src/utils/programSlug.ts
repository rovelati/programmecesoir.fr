/**
 * Utility functions for generating SEO-friendly slugs from program titles
 * and converting slugs back to program identifiers
 */

const PROGRAM_AIRING_TOKEN_REGEX = /^\d{4}-\d{2}-\d{2}-\d{4}$/;

// Generate a URL-friendly slug from a program title
export const getProgramSlug = (title: string): string => {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
};

// Generate full program URL
export const getProgramUrl = (channelSlug: string, programTitle: string): string => {
  const programSlug = getProgramSlug(programTitle);
  return `/programme/${channelSlug}/${programSlug}`;
};

export const getProgramAiringToken = (startTime: string): string | null => {
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return null;
  const iso = date.toISOString();
  return `${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}`;
};

export const getProgramUrlWithAiring = (channelSlug: string, programTitle: string, startTime?: string): string => {
  const baseUrl = getProgramUrl(channelSlug, programTitle);
  if (!startTime) return baseUrl;
  const token = getProgramAiringToken(startTime);
  if (!token) return baseUrl;
  return `${baseUrl}/${token}`;
};

// Helper to get program slug from title (for matching)
export const getProgramSlugFromTitle = (title: string): string => {
  return getProgramSlug(title);
};

const normalizeSlug = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

// Parse program URL to extract channel slug and program slug
export const parseProgramUrl = (
  path: string
): { channelSlug: string; programSlug: string; programAiringToken?: string } | null => {
  const match = path.match(/^\/programme\/([^/]+)\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (!match) return null;
  const airingToken = match[3];
  if (airingToken && !PROGRAM_AIRING_TOKEN_REGEX.test(airingToken)) {
    return null;
  }
  return {
    channelSlug: normalizeSlug(match[1]),
    programSlug: normalizeSlug(match[2]),
    ...(airingToken ? { programAiringToken: airingToken } : {}),
  };
};
