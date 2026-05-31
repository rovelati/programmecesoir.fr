import type { Channel, PageState, Program, TimeSlotFilter, TimeView } from '../types';
import type { AnyEntity, EntityIndexPayload } from '../types/entities';
import type { BirthdayArticlePayload, BirthdayArchivePayload } from '../types/birthday';
import type { NewsPagePayload } from '../types/news';

type BootstrapChannelMeta = {
  name?: string;
  logo_url?: string | null;
  channel_number?: number | string | null;
};

export type BootstrapProgramRow = {
  id: string;
  channel_id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  genre?: string;
  poster_url?: string | null;
  replay_url?: string | null;
  channels?: BootstrapChannelMeta;
};

export type BootstrapProgramFallback = {
  channel: Channel;
  program: Program;
};

export type BootstrapPayload = {
  routePath: string;
  pageState?: PageState;
  viewMode?: TimeView;
  filter?: TimeSlotFilter;
  generatedAt?: string;
  programs?: BootstrapProgramRow[];
  programFallback?: BootstrapProgramFallback | null;
  entity?: AnyEntity | null;
  entityIndex?: EntityIndexPayload | null;
  birthdayArticle?: BirthdayArticlePayload | null;
  birthdayArchive?: BirthdayArchivePayload | null;
  newsPage?: NewsPagePayload | null;
};

let cachedBootstrapData: BootstrapPayload | null | undefined;

const normalizePathname = (pathname: string): string => {
  if (!pathname) return '/';
  if (pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
};

export const getBootstrapData = (): BootstrapPayload | null => {
  if (cachedBootstrapData !== undefined) {
    return cachedBootstrapData;
  }

  if (typeof document === 'undefined') {
    cachedBootstrapData = null;
    return cachedBootstrapData;
  }

  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('#app-bootstrap-data'));
  if (!scripts.length) {
    return null;
  }

  try {
    const currentPath = normalizePathname(window.location.pathname);
    const parsedPayloads = scripts
      .map((script) => script.textContent?.trim())
      .filter(Boolean)
      .map((textContent) => JSON.parse(textContent as string) as BootstrapPayload);

    cachedBootstrapData =
      parsedPayloads.find((payload) => normalizePathname(payload?.routePath || '') === currentPath) ||
      parsedPayloads[parsedPayloads.length - 1] ||
      null;
  } catch (error) {
    console.warn('[bootstrapData] Failed to parse bootstrap payload', error);
    cachedBootstrapData = null;
  }

  return cachedBootstrapData;
};
