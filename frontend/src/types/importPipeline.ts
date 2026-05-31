export type ImportPipelineStepStatus = 'pending' | 'running' | 'completed' | 'warning' | 'failed' | 'skipped';

export interface ImportPipelineWarning {
  step: string;
  message: string;
  at: string;
}

export interface ImportPipelineStep {
  key: string;
  label: string;
  status: ImportPipelineStepStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  detail?: string | null;
  error?: string | null;
}

export interface ImportPipelineBackgroundJob {
  status: ImportPipelineStepStatus | string;
  startedAt?: string | null;
  finishedAt?: string | null;
  detail?: string | null;
  error?: string | null;
  pid?: number | null;
  count?: number | null;
  logPath?: string | null;
  inputPath?: string | null;
}

export interface ImportPipelineReport {
  ok: true;
  generatedAt: string;
  runId: string;
  status: string;
  currentStep?: string | null;
  lastSuccessfulStep?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  sourceUrl?: string | null;
  errorMessage?: string | null;
  warnings: ImportPipelineWarning[];
  summary: {
    total: number;
    completed: number;
    warnings: number;
    failed: number;
    running: number;
    pending: number;
  };
  metrics: {
    channelsProcessed?: number | null;
    programsInserted?: number | null;
    programsDeleted?: number | null;
  };
  steps: ImportPipelineStep[];
  backgroundJobs?: Record<string, ImportPipelineBackgroundJob>;
}
