import type { SupabaseUsageReport } from '../types/supabaseUsage';

let latestSupabaseUsageCache: SupabaseUsageReport | null | undefined;

const SUPABASE_USAGE_LATEST_URL = '/search-console/supabase-usage-latest.json';

export async function fetchLatestSupabaseUsageReport(options: { force?: boolean } = {}): Promise<SupabaseUsageReport | null> {
  if (!options.force && latestSupabaseUsageCache !== undefined) {
    return latestSupabaseUsageCache;
  }

  try {
    const url = `${SUPABASE_USAGE_LATEST_URL}?ts=${Date.now()}`;
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) {
      latestSupabaseUsageCache = null;
      return null;
    }
    const payload = (await response.json()) as SupabaseUsageReport;
    latestSupabaseUsageCache = payload?.ok ? payload : null;
    return latestSupabaseUsageCache;
  } catch {
    latestSupabaseUsageCache = null;
    return null;
  }
}
