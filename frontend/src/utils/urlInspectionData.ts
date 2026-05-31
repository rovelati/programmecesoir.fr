import type { UrlInspectionReport } from '../types/urlInspection';

let latestInspectionCache: UrlInspectionReport | null | undefined;

const URL_INSPECTION_LATEST_URL = '/search-console/url-inspection-latest.json';

export async function fetchLatestUrlInspectionReport(options: { force?: boolean } = {}): Promise<UrlInspectionReport | null> {
  if (!options.force && latestInspectionCache !== undefined) {
    return latestInspectionCache;
  }

  try {
    const bust = `ts=${Date.now()}`;
    const url = options.force
      ? `${URL_INSPECTION_LATEST_URL}?${bust}`
      : `${URL_INSPECTION_LATEST_URL}?${bust}`;
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) {
      latestInspectionCache = null;
      return null;
    }
    const payload = (await response.json()) as UrlInspectionReport;
    latestInspectionCache = payload?.ok ? payload : null;
    return latestInspectionCache;
  } catch {
    latestInspectionCache = null;
    return null;
  }
}
