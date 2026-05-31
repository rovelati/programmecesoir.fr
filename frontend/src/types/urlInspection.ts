export interface UrlInspectionRecentStatus {
  date: string;
  indexed: boolean;
  status: string;
  verdict?: string | null;
  lastCrawlTime?: string | null;
}

export interface UrlInspectionHistoryWindow {
  observedDays: number;
  indexedDays: number;
  latestSeenAt?: string | null;
  latestIndexedAt?: string | null;
  currentIndexed: boolean;
  stableIndexed: boolean;
  recentStatuses: UrlInspectionRecentStatus[];
}

export interface UrlInspectionItem {
  channelSlug: string;
  channelName: string;
  url: string;
  status: 'ok' | 'error';
  inspectionResultLink?: string | null;
  verdict?: string | null;
  coverageState?: string | null;
  indexingState?: string | null;
  lastCrawlTime?: string | null;
  pageFetchState?: string | null;
  robotsTxtState?: string | null;
  googleCanonical?: string | null;
  userCanonical?: string | null;
  referringUrls?: string[];
  crawledAs?: string | null;
  mobileUsabilityVerdict?: string | null;
  richResultsVerdict?: string | null;
  richResultTypes?: string[];
  error?: string | null;
  history7d?: UrlInspectionHistoryWindow | null;
}

export interface UrlInspectionReport {
  ok: true;
  generatedAt: string;
  siteUrl: string;
  source: string;
  notes: {
    indexedVersionOnly: boolean;
    dailyQuotaPerProperty: number;
    perMinuteQuotaPerProperty: number;
    description: string;
    historyWindowDays?: number;
    stableThresholdDays?: number;
  };
  summary: {
    total: number;
    pass: number;
    withLastCrawlTime: number;
    errors: number;
    stableIndexed?: number;
  };
  rotation?: {
    enabled: boolean;
    activeTargets: string[];
    pinnedTargets: string[];
    reserveTargets: string[];
    deferredTargets: string[];
    nextCandidates: string[];
  };
  results: UrlInspectionItem[];
}
