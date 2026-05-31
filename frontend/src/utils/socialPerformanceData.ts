import type { SocialPerformanceReport } from '../types/socialPerformance';

let latestSocialPerformanceCache: SocialPerformanceReport | null | undefined;

const SOCIAL_PERFORMANCE_LATEST_URL = '/search-console/social-performance-latest.json';

export async function fetchLatestSocialPerformanceReport(options: { force?: boolean } = {}): Promise<SocialPerformanceReport | null> {
  if (!options.force && latestSocialPerformanceCache !== undefined) {
    return latestSocialPerformanceCache;
  }

  try {
    const url = `${SOCIAL_PERFORMANCE_LATEST_URL}?ts=${Date.now()}`;
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) {
      latestSocialPerformanceCache = null;
      return null;
    }
    const payload = (await response.json()) as SocialPerformanceReport;
    latestSocialPerformanceCache = payload?.ok ? payload : null;
    return latestSocialPerformanceCache;
  } catch {
    latestSocialPerformanceCache = null;
    return null;
  }
}
