export interface SupabaseUsageTableRow {
  schema: string;
  table: string;
  rowEstimate?: number | null;
  rowsExact?: number | null;
  totalBytes: number;
  tableBytes?: number | null;
  indexBytes?: number | null;
  toastBytes?: number | null;
  oldestStart?: string | null;
  newestStart?: string | null;
  olderThanRetention?: number | null;
}

export interface SupabaseUsageBucketRow {
  bucketId: string;
  objects: number;
  bytes: number;
}

export interface SupabaseUsageReport {
  ok: true;
  generatedAt: string;
  source: string;
  projectRef?: string | null;
  database: {
    name?: string | null;
    currentBytes: number;
    limitBytes: number;
    usagePercent?: number | null;
    overLimit?: boolean;
  };
  egress: {
    available: boolean;
    currentBytes?: number | null;
    limitBytes?: number | null;
    usagePercent?: number | null;
    detail?: string | null;
  };
  storage: {
    available: boolean;
    objects: number;
    bytes: number;
    buckets: SupabaseUsageBucketRow[];
  };
  summary: {
    topTableBytes: number;
    topTableName?: string | null;
    tableCount: number;
  };
  notes: {
    description: string;
    managementApiConfigured?: boolean;
    egressRequiresManagementApi?: boolean;
    retentionDays?: number;
  };
  topTables: SupabaseUsageTableRow[];
  keyTables: SupabaseUsageTableRow[];
}
