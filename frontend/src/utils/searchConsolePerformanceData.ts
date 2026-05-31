import type { SearchConsolePerformanceReport } from '../types/searchConsolePerformance';

let latestSearchConsolePerformanceCache: SearchConsolePerformanceReport | null | undefined;

const SEARCH_CONSOLE_PERFORMANCE_LATEST_URL = '/search-console/search-performance-latest.json';

export async function fetchLatestSearchConsolePerformanceReport(options: { force?: boolean } = {}): Promise<SearchConsolePerformanceReport | null> {
  if (!options.force && latestSearchConsolePerformanceCache !== undefined) {
    return latestSearchConsolePerformanceCache;
  }

  try {
    const response = await fetch(`${SEARCH_CONSOLE_PERFORMANCE_LATEST_URL}?ts=${Date.now()}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) {
      latestSearchConsolePerformanceCache = null;
      return null;
    }
    const payload = (await response.json()) as SearchConsolePerformanceReport;
    latestSearchConsolePerformanceCache = payload?.ok ? payload : null;
    return latestSearchConsolePerformanceCache;
  } catch {
    latestSearchConsolePerformanceCache = null;
    return null;
  }
}
