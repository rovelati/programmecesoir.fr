export interface SearchConsoleMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsoleGa4Metrics {
  screenPageViews: number;
  sessions: number;
  activeUsers: number;
  engagedSessions: number;
  engagementRate: number;
  averageSessionDuration: number;
}

export interface SearchConsoleGa4Delta {
  screenPageViews?: number | null;
  sessions?: number | null;
  activeUsers?: number | null;
  engagedSessions?: number | null;
  engagementRate?: number | null;
  averageSessionDuration?: number | null;
}

export interface SearchConsoleGa4Row {
  path: string;
  current: SearchConsoleGa4Metrics;
  previous: SearchConsoleGa4Metrics;
  delta: SearchConsoleGa4Delta;
}

export interface SearchConsoleTargetRow {
  slug: string;
  label: string;
  url: string;
  current: SearchConsoleMetrics;
  previous: SearchConsoleMetrics;
  delta: {
    clicks?: number | null;
    impressions?: number | null;
    ctr?: number | null;
    position?: number | null;
  };
  ga4: SearchConsoleGa4Row;
}

export interface SearchConsoleQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsolePerformanceReport {
  ok: true;
  generatedAt: string;
  siteUrl: string;
  source: string;
  notes: {
    description: string;
    windowDays: number;
    delayDays: number;
  };
  period: {
    current: {
      startDate: string;
      endDate: string;
    };
    previous: {
      startDate: string;
      endDate: string;
    };
  };
  summary: {
    siteCurrent: SearchConsoleMetrics;
    sitePrevious: SearchConsoleMetrics;
    headCurrent: SearchConsoleMetrics;
    headPrevious: SearchConsoleMetrics;
    ga4Current: SearchConsoleGa4Metrics;
    ga4Previous: SearchConsoleGa4Metrics;
    headDelta: {
      clicks?: number | null;
      impressions?: number | null;
      ctr?: number | null;
      position?: number | null;
    };
    ga4Delta: SearchConsoleGa4Delta;
  };
  ga4: {
    enabled: boolean;
    available: boolean;
    property: {
      status: string;
      propertyId?: string | null;
      displayName?: string | null;
      measurementId?: string | null;
      defaultUri?: string | null;
      matchedBy?: string | null;
      error?: string | null;
    } | null;
    notes: {
      windowDays: number;
      delayDays: number;
      source: string;
    };
    period: {
      current: {
        startDate: string;
        endDate: string;
      };
      previous: {
        startDate: string;
        endDate: string;
      };
    };
    error?: string | null;
    topPages: SearchConsoleTargetRow[];
  };
  topQueries: SearchConsoleQueryRow[];
  targets: SearchConsoleTargetRow[];
  reserveCandidates: SearchConsoleTargetRow[];
  insights: {
    forceIndex: Array<{
      slug: string;
      label: string;
      url: string;
      priority: number;
      reason: string;
      action: string;
    }>;
    internalLinking: Array<{
      slug: string;
      label: string;
      url: string;
      priority: number;
      reason: string;
      action: string;
    }>;
    watchlist: Array<{
      slug: string;
      label: string;
      url: string;
      priority: number;
      reason: string;
      action: string;
    }>;
    nextIndexingCandidates: Array<{
      slug: string;
      label: string;
      url: string;
      priority: number;
      reason: string;
      action: string;
    }>;
    rotationContext: {
      activeTargets: string[];
      reserveTargets: string[];
      nextCandidates: string[];
    };
  };
}
