export interface SocialPerformanceMetrics {
  impressions?: number | null;
  linkClicks?: number | null;
  profileClicks?: number | null;
  engagements?: number | null;
  likes?: number | null;
  reposts?: number | null;
  replies?: number | null;
  quotes?: number | null;
  bookmarks?: number | null;
  ctr?: number | null;
  sourceCreatedAt?: string | null;
  indexedAt?: string | null;
  error?: string | null;
}

export interface SocialPerformancePost {
  platform: string;
  postType: string;
  status: string;
  createdAt?: string | null;
  postDate?: string | null;
  postText?: string | null;
  postId?: string | null;
  postUrl?: string | null;
  errorMsg?: string | null;
  metrics: SocialPerformanceMetrics;
}

export interface SocialPerformancePlatformSummary {
  posts: number;
  success: number;
  errors: number;
  skipped: number;
  impressions: number;
  linkClicks: number;
  engagements: number;
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
}

export interface SocialPerformanceReport {
  ok: true;
  generatedAt: string;
  source: string;
  notes: {
    description: string;
    clicksTrackedOnX: boolean;
    blueskyPublicMetricsOnly: boolean;
  };
  summary: {
    total: number;
    success: number;
    errors: number;
    skipped: number;
    x: SocialPerformancePlatformSummary;
    bluesky: SocialPerformancePlatformSummary;
  };
  posts: SocialPerformancePost[];
}
