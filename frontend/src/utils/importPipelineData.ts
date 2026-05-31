import type { ImportPipelineReport } from '../types/importPipeline';

let latestImportPipelineCache: ImportPipelineReport | null | undefined;
let latestImportTimestampCache: string | null | undefined;

const IMPORT_PIPELINE_LATEST_URL = '/search-console/import-pipeline-latest.json';

export async function fetchLatestImportPipelineReport(options: { force?: boolean } = {}): Promise<ImportPipelineReport | null> {
  if (!options.force && latestImportPipelineCache !== undefined) {
    return latestImportPipelineCache;
  }

  try {
    const url = `${IMPORT_PIPELINE_LATEST_URL}?ts=${Date.now()}`;
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) {
      latestImportPipelineCache = null;
      return null;
    }
    const payload = (await response.json()) as ImportPipelineReport;
    latestImportPipelineCache = payload?.ok ? payload : null;
    return latestImportPipelineCache;
  } catch {
    latestImportPipelineCache = null;
    return null;
  }
}

export async function fetchLatestImportTimestamp(options: { force?: boolean } = {}): Promise<string | null> {
  if (!options.force && latestImportTimestampCache !== undefined) {
    return latestImportTimestampCache;
  }

  try {
    const response = await fetch(IMPORT_PIPELINE_LATEST_URL, {
      credentials: 'same-origin',
      cache: options.force ? 'no-store' : 'default',
    });

    if (!response.ok) {
      latestImportTimestampCache = null;
      return null;
    }

    const payload = (await response.json()) as ImportPipelineReport;
    if (!payload?.ok) {
      latestImportTimestampCache = null;
      return null;
    }

    latestImportTimestampCache = payload.finishedAt || payload.generatedAt || payload.startedAt || null;
    return latestImportTimestampCache;
  } catch {
    latestImportTimestampCache = null;
    return null;
  }
}
