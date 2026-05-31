import React, { useEffect, useMemo, useState } from 'react';
import { useSEO } from '../utils/seo';
import { fetchLatestUrlInspectionReport } from '../utils/urlInspectionData';
import { fetchLatestImportPipelineReport } from '../utils/importPipelineData';
import { fetchLatestSocialPerformanceReport } from '../utils/socialPerformanceData';
import { fetchLatestSupabaseUsageReport } from '../utils/supabaseUsageData';
import { fetchLatestSearchConsolePerformanceReport } from '../utils/searchConsolePerformanceData';
import type { UrlInspectionItem, UrlInspectionReport } from '../types/urlInspection';
import type { ImportPipelineBackgroundJob, ImportPipelineReport, ImportPipelineStep } from '../types/importPipeline';
import type { SocialPerformancePost, SocialPerformanceReport } from '../types/socialPerformance';
import type { SupabaseUsageReport, SupabaseUsageTableRow } from '../types/supabaseUsage';
import type { SearchConsolePerformanceReport, SearchConsoleTargetRow } from '../types/searchConsolePerformance';

const ADMIN_USER = 'bruno';
const ADMIN_PASS = 'baumicio';
const AUTH_KEY = 'admin_url_inspection_auth';

type InspectionFilter = 'all' | 'unknown' | 'known' | 'errors';

function getRecognitionState(row: UrlInspectionItem): {
  label: string;
  tone: string;
  detail: string;
} {
  if (row.status === 'error') {
    return {
      label: 'Erreur API',
      tone: 'bg-rose-100 text-rose-700',
      detail: row.error || 'Inspection impossible',
    };
  }

  const coverage = String(row.coverageState || '').toLowerCase();
  const indexing = String(row.indexingState || '').toLowerCase();

  if (row.lastCrawlTime) {
    return {
      label: 'Connue par Google',
      tone: 'bg-emerald-100 text-emerald-700',
      detail: row.coverageState || row.indexingState || 'Dernier crawl disponible',
    };
  }

  if (coverage.includes('ne reconnaît pas')) {
    return {
      label: 'Non reconnue',
      tone: 'bg-amber-100 text-amber-700',
      detail: row.coverageState || 'Aucune version indexée connue',
    };
  }

  if (indexing.includes('unspecified')) {
    return {
      label: 'En attente',
      tone: 'bg-sky-100 text-sky-700',
      detail: row.coverageState || 'Signal envoyé, attente de crawl',
    };
  }

  return {
    label: row.verdict || 'À surveiller',
    tone: 'bg-slate-100 text-slate-700',
    detail: row.coverageState || row.indexingState || 'Statut intermédiaire',
  };
}

export const AdminUrlInspection: React.FC = () => {
  const [isAuthed, setIsAuthed] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<UrlInspectionReport | null>(null);
  const [importReport, setImportReport] = useState<ImportPipelineReport | null>(null);
  const [socialReport, setSocialReport] = useState<SocialPerformanceReport | null>(null);
  const [supabaseUsageReport, setSupabaseUsageReport] = useState<SupabaseUsageReport | null>(null);
  const [searchConsoleReport, setSearchConsoleReport] = useState<SearchConsolePerformanceReport | null>(null);

  useSEO({
    title: 'Admin URL Inspection - Programme Ce Soir',
    description: 'Dashboard interne Search Console URL Inspection',
    url: '/admin-url-inspection',
    noindex: true,
  });

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem(AUTH_KEY) : null;
    if (stored === '1') {
      setIsAuthed(true);
    }
  }, []);

  const loadReport = async (force = false) => {
    setLoading(true);
    const [supabasePayload, inspectionPayload, importPayload, searchConsolePayload, socialPayload] = await Promise.all([
      fetchLatestSupabaseUsageReport({ force }),
      fetchLatestUrlInspectionReport({ force }),
      fetchLatestImportPipelineReport({ force }),
      fetchLatestSearchConsolePerformanceReport({ force }),
      fetchLatestSocialPerformanceReport({ force }),
    ]);
    setSupabaseUsageReport(supabasePayload);
    setReport(inspectionPayload);
    setImportReport(importPayload);
    setSearchConsoleReport(searchConsolePayload);
    setSocialReport(socialPayload);
    setLoading(false);
  };

  useEffect(() => {
    if (isAuthed) {
      loadReport();
    }
  }, [isAuthed]);

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      window.sessionStorage.setItem(AUTH_KEY, '1');
      setIsAuthed(true);
      setError(null);
      return;
    }
    setError('Identifiants incorrects.');
  };

  const freshWindowLabel = useMemo(() => {
    if (!report?.generatedAt) return 'indisponible';
    return new Date(report.generatedAt).toLocaleString('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Europe/Paris',
    });
  }, [report?.generatedAt]);

  const formatDateTime = (value?: string | null) => {
    if (!value) return 'indisponible';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'indisponible';
    return parsed.toLocaleString('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Europe/Paris',
    });
  };

  const formatNumber = (value?: number | null) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    return value.toLocaleString('fr-FR');
  };

  const formatPercent = (value?: number | null) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
  };

  const formatSeconds = (value?: number | null) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    const rounded = Math.round(value);
    if (rounded < 60) return `${rounded}s`;
    const minutes = Math.floor(rounded / 60);
    const seconds = rounded % 60;
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  };

  const formatBytes = (value?: number | null) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    if (value === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let current = value;
    let unitIndex = 0;
    while (current >= 1024 && unitIndex < units.length - 1) {
      current /= 1024;
      unitIndex += 1;
    }
    return `${current.toLocaleString('fr-FR', { maximumFractionDigits: current >= 100 ? 0 : 1 })} ${units[unitIndex]}`;
  };

  const reportRows = useMemo(() => {
    if (!report) return [];
    return report.results.map((row) => ({
      ...row,
      recognition: getRecognitionState(row),
    }));
  }, [report]);

  const [activeFilter, setActiveFilter] = useState<InspectionFilter>('all');

  const filteredRows = useMemo(() => {
    if (activeFilter === 'all') return reportRows;
    if (activeFilter === 'errors') return reportRows.filter((row) => row.status === 'error');
    if (activeFilter === 'unknown') {
      return reportRows.filter((row) => row.recognition.label === 'Non reconnue');
    }
    if (activeFilter === 'known') {
      return reportRows.filter((row) => row.recognition.label === 'Connue par Google');
    }
    return reportRows;
  }, [activeFilter, reportRows]);

  const statusSummary = useMemo(() => {
    const known = reportRows.filter((row) => row.recognition.label === 'Connue par Google').length;
    const unknown = reportRows.filter((row) => row.recognition.label === 'Non reconnue').length;
    const errors = reportRows.filter((row) => row.status === 'error').length;
    return {
      known,
      unknown,
      errors,
    };
  }, [reportRows]);

  const formatPipelineStatus = (status?: string | null) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'success') return { label: 'Succès', tone: 'bg-emerald-100 text-emerald-700' };
    if (normalized === 'success_with_warnings') return { label: 'Succès avec alertes', tone: 'bg-amber-100 text-amber-700' };
    if (normalized === 'running') return { label: 'En cours', tone: 'bg-sky-100 text-sky-700' };
    if (normalized === 'error') return { label: 'Erreur', tone: 'bg-rose-100 text-rose-700' };
    return { label: status || 'Inconnu', tone: 'bg-slate-100 text-slate-700' };
  };

  const getStepTone = (step: ImportPipelineStep) => {
    if (step.status === 'completed') return 'bg-emerald-100 text-emerald-700';
    if (step.status === 'warning') return 'bg-amber-100 text-amber-700';
    if (step.status === 'failed') return 'bg-rose-100 text-rose-700';
    if (step.status === 'running') return 'bg-sky-100 text-sky-700';
    return 'bg-slate-100 text-slate-700';
  };

  const getJobTone = (job: ImportPipelineBackgroundJob) => {
    if (job.status === 'completed') return 'bg-emerald-100 text-emerald-700';
    if (job.status === 'warning') return 'bg-amber-100 text-amber-700';
    if (job.status === 'failed') return 'bg-rose-100 text-rose-700';
    if (job.status === 'running') return 'bg-sky-100 text-sky-700';
    return 'bg-slate-100 text-slate-700';
  };

  const formatPostTypeLabel = (value: string) => {
    const mapping: Record<string, string> = {
      post1: 'Anniversaire',
      post2: 'Film après-midi',
      post3: 'Top 5 TV',
      post4: 'En ce moment',
      post5: 'Choisi pour vous · film',
      post6: 'Choisi pour vous · sport',
    };
    return mapping[value] || value;
  };

  const formatPlatformLabel = (value: string) => {
    if (value === 'x') return 'X';
    if (value === 'bluesky') return 'Bluesky';
    return value;
  };

  const getPlatformTone = (value: string) => {
    if (value === 'bluesky') return 'bg-sky-100 text-sky-700';
    return 'bg-slate-100 text-slate-700';
  };

  const getSocialStatusTone = (value: string) => {
    if (value === 'success') return 'bg-emerald-100 text-emerald-700';
    if (value === 'error') return 'bg-rose-100 text-rose-700';
    if (value === 'skipped') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-700';
  };

  const socialRows = useMemo(
    () => (socialReport?.posts || []).filter((row) => row.platform === 'bluesky').slice(0, 10),
    [socialReport],
  );

  const inspectionByUrl = useMemo(() => {
    const map = new Map<string, typeof reportRows[number]>();
    for (const row of reportRows) {
      map.set(row.url, row);
    }
    return map;
  }, [reportRows]);

  const searchTargetRows = useMemo(
    () => (searchConsoleReport?.targets || []).map((row) => ({
      ...row,
      inspection: inspectionByUrl.get(row.url) || null,
    })),
    [inspectionByUrl, searchConsoleReport],
  );

  const supabaseDbTone = useMemo(() => {
    const usage = supabaseUsageReport?.database?.usagePercent;
    if (typeof usage !== 'number') return 'bg-slate-100 text-slate-700';
    if (usage >= 100) return 'bg-rose-100 text-rose-700';
    if (usage >= 85) return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
  }, [supabaseUsageReport]);

  const socialSummaryCards = useMemo(() => {
    if (!socialReport) return [];
    return [
      ['Dernière mise à jour', formatDateTime(socialReport.generatedAt)],
      ['Posts suivis', String(socialReport.summary.total)],
      ['Succès Bluesky', String(socialReport.summary.bluesky.success)],
      ['Likes Bluesky', formatNumber(socialReport.summary.bluesky.likes)],
      ['Reposts Bluesky', formatNumber(socialReport.summary.bluesky.reposts)],
      ['Replies Bluesky', formatNumber(socialReport.summary.bluesky.replies)],
    ];
  }, [socialReport]);

  const getPrimaryMetricLabel = (row: SocialPerformancePost) => {
    return 'Likes';
  };

  const getPrimaryMetricValue = (row: SocialPerformancePost) => {
    return formatNumber(row.metrics.likes);
  };

  const topSearchWinners = useMemo(() => {
    return [...searchTargetRows]
      .sort((a, b) => (b.delta.clicks || -9999) - (a.delta.clicks || -9999))
      .slice(0, 5);
  }, [searchTargetRows]);

  const topSearchLosers = useMemo(() => {
    return [...searchTargetRows]
      .sort((a, b) => (a.delta.clicks || 9999) - (b.delta.clicks || 9999))
      .slice(0, 5);
  }, [searchTargetRows]);

  const seoActionGroups = useMemo(() => {
    if (!searchConsoleReport?.insights) return [];
    return [
      {
        key: 'forceIndex',
        title: 'Indexation forcée',
        tone: 'bg-amber-50 border-amber-200',
        rows: searchConsoleReport.insights.forceIndex,
      },
      {
        key: 'nextIndexingCandidates',
        title: 'Prochaines pages à pousser',
        tone: 'bg-sky-50 border-sky-200',
        rows: searchConsoleReport.insights.nextIndexingCandidates,
      },
      {
        key: 'internalLinking',
        title: 'Maillage interne à renforcer',
        tone: 'bg-emerald-50 border-emerald-200',
        rows: searchConsoleReport.insights.internalLinking,
      },
      {
        key: 'watchlist',
        title: 'Pages à maintenir',
        tone: 'bg-slate-50 border-slate-200',
        rows: searchConsoleReport.insights.watchlist,
      },
    ];
  }, [searchConsoleReport]);

  const formatDelta = (value?: number | null, suffix = '%') => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${suffix}`;
  };

  const getDeltaTone = (value?: number | null, inverse = false) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return 'text-slate-500';
    const positive = inverse ? value < 0 : value > 0;
    if (positive) return 'text-emerald-600';
    if (value === 0) return 'text-slate-500';
    return 'text-rose-600';
  };

  const getTableLabel = (row: SupabaseUsageTableRow) => `${row.schema}.${row.table}`;
  const inspectionWindowDays = report?.notes.historyWindowDays || searchConsoleReport?.notes.windowDays || 7;
  const inspectionStableThreshold = report?.notes.stableThresholdDays || 3;
  const stableIndexedCount = report?.summary.stableIndexed || 0;

  const formatHistoryWindow = (row: UrlInspectionItem) => {
    const history = row.history7d;
    if (!history) return '—';
    return `${history.indexedDays}/${history.observedDays} jours`;
  };

  const getHistoryTone = (row: UrlInspectionItem) => {
    const history = row.history7d;
    if (!history) return 'bg-slate-100 text-slate-700';
    if (history.stableIndexed) return 'bg-emerald-100 text-emerald-700';
    if (history.indexedDays > 0) return 'bg-sky-100 text-sky-700';
    return 'bg-amber-100 text-amber-700';
  };

  const searchConsolePropertyUrl = searchConsoleReport?.siteUrl || report?.siteUrl || 'https://programmecesoir.fr/';

  const buildSearchConsoleInspectionUrl = (targetUrl: string) => {
    const inspectionLink = inspectionByUrl.get(targetUrl)?.inspectionResultLink;
    if (inspectionLink) {
      return inspectionLink;
    }
    const params = new URLSearchParams({
      resource_id: searchConsolePropertyUrl,
      url: targetUrl,
    });
    return `https://search.google.com/search-console/inspect?${params.toString()}`;
  };

  if (!isAuthed) {
    return (
      <main className="min-h-screen bg-slate-950 text-white px-6 py-16">
        <div className="mx-auto max-w-md rounded-3xl border border-slate-800 bg-slate-900/85 p-8 shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-sky-300">Admin</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">URL Inspection</h1>
          <p className="mt-3 text-sm text-slate-300">
            Accès interne Search Console. Cette interface affiche ce que Google connaît déjà de l’URL indexée.
          </p>
          <form className="mt-8 space-y-4" onSubmit={handleLogin}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-200">Utilisateur</span>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-sky-400"
                autoComplete="username"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-200">Mot de passe</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-sky-400"
                autoComplete="current-password"
              />
            </label>
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            <button
              type="submit"
              className="w-full rounded-2xl bg-sky-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-sky-400"
            >
              Se connecter
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.35em] text-sky-600">Search Console</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">URL Inspection API</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Diagnostic automatique des listing pages head. Cette vue reflète la version indexée par Google, pas un fetch live de la page actuelle.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => loadReport(true)}
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
            >
              Rafraîchir
            </button>
            <button
              type="button"
              onClick={() => {
                window.sessionStorage.removeItem(AUTH_KEY);
                setIsAuthed(false);
              }}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Déconnexion
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
            Chargement du rapport…
          </div>
        ) : null}

        {!loading && !report ? (
          <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-8 text-sm text-amber-900 shadow-sm">
            Aucun rapport disponible pour le moment. Vérifie que l’importer a bien exécuté la phase URL Inspection.
          </div>
        ) : null}

        {importReport ? (
          <>
            <div className="mt-8 rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.35em] text-slate-400">Pipeline importer</p>
                  <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900">Cycle EPG complet</h2>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                    Ce bloc reflète l’état persistant du dernier run importer: import, sitemaps, snapshots, notifications moteurs et inspection Google.
                  </p>
                </div>
                <span className={`inline-flex rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] ${formatPipelineStatus(importReport.status).tone}`}>
                  {formatPipelineStatus(importReport.status).label}
                </span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {[
                  ['Run ID', importReport.runId || 'indisponible'],
                  ['Début', formatDateTime(importReport.startedAt)],
                  ['Fin', formatDateTime(importReport.finishedAt)],
                  ['Dernier step OK', importReport.lastSuccessfulStep || 'indisponible'],
                  ['Step courant', importReport.currentStep || 'aucun'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">{label}</p>
                    <p className="mt-3 text-sm font-semibold text-slate-900 break-words">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                {[
                  ['Chaînes', String(importReport.metrics.channelsProcessed ?? '0')],
                  ['Programmes', String(importReport.metrics.programsInserted ?? '0')],
                  ['Supprimés', String(importReport.metrics.programsDeleted ?? '0')],
                  ['Steps OK', String(importReport.summary.completed)],
                  ['Warnings', String(importReport.summary.warnings)],
                  ['Failed', String(importReport.summary.failed)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-3xl border border-slate-200 bg-white p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">{label}</p>
                    <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              {importReport.errorMessage ? (
                <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
                  <strong>Erreur finale:</strong> {importReport.errorMessage}
                </div>
              ) : null}

              {importReport.warnings.length ? (
                <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
                  <p className="font-bold">Warnings persistants</p>
                  <ul className="mt-3 list-disc space-y-2 pl-5">
                    {importReport.warnings.slice(0, 8).map((warning) => (
                      <li key={`${warning.step}-${warning.at}`}>
                        <strong>{warning.step}</strong> — {warning.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-8 overflow-x-auto rounded-3xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                    <tr>
                      <th className="px-6 py-4">Step</th>
                      <th className="px-6 py-4">Statut</th>
                      <th className="px-6 py-4">Début</th>
                      <th className="px-6 py-4">Fin</th>
                      <th className="px-6 py-4">Détail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {importReport.steps.map((step) => (
                      <tr key={step.key} className="align-top">
                        <td className="px-6 py-5">
                          <p className="font-bold text-slate-900">{step.label}</p>
                          <p className="mt-1 text-xs text-slate-500">{step.key}</p>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] ${getStepTone(step)}`}>
                            {step.status}
                          </span>
                          {step.error ? <p className="mt-2 text-xs text-rose-600">{step.error}</p> : null}
                        </td>
                        <td className="px-6 py-5 text-slate-600">{formatDateTime(step.startedAt)}</td>
                        <td className="px-6 py-5 text-slate-600">{formatDateTime(step.finishedAt)}</td>
                        <td className="px-6 py-5 text-slate-600">{step.detail || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {importReport.backgroundJobs && Object.keys(importReport.backgroundJobs).length ? (
                <div className="mt-8 overflow-x-auto rounded-3xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                      <tr>
                        <th className="px-6 py-4">Job de fond</th>
                        <th className="px-6 py-4">Statut</th>
                        <th className="px-6 py-4">Début</th>
                        <th className="px-6 py-4">Fin</th>
                        <th className="px-6 py-4">Détail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {Object.entries(importReport.backgroundJobs).map(([jobKey, job]) => (
                        <tr key={jobKey} className="align-top">
                          <td className="px-6 py-5">
                            <p className="font-bold text-slate-900">{jobKey}</p>
                            {job.logPath ? <p className="mt-1 text-xs text-slate-500 break-all">{job.logPath}</p> : null}
                            {job.inputPath ? <p className="mt-1 text-xs text-slate-500 break-all">{job.inputPath}</p> : null}
                          </td>
                          <td className="px-6 py-5">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] ${getJobTone(job)}`}>
                              {job.status}
                            </span>
                            {job.error ? <p className="mt-2 text-xs text-rose-600">{job.error}</p> : null}
                            {job.pid ? <p className="mt-2 text-xs text-slate-500">PID {job.pid}</p> : null}
                            {typeof job.count === 'number' ? <p className="mt-1 text-xs text-slate-500">{job.count} pages</p> : null}
                          </td>
                          <td className="px-6 py-5 text-slate-600">{formatDateTime(job.startedAt)}</td>
                          <td className="px-6 py-5 text-slate-600">{formatDateTime(job.finishedAt)}</td>
                          <td className="px-6 py-5 text-slate-600">{job.detail || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {searchConsoleReport ? (
          <div className="mt-8 rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.35em] text-slate-400">Search Console</p>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900">Trafic SEO des pages head</h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                  Vue combinée du trafic search réel et de l’état d’indexation récent des pages head. L’analyse opérationnelle est limitée aux {inspectionWindowDays} derniers jours pour éviter de garder trop longtemps des URL déjà stabilisées dans le set Google.
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
                <p className="font-bold text-slate-900">Fenêtre analysée</p>
                <p className="mt-1">{searchConsoleReport.period.current.startDate} → {searchConsoleReport.period.current.endDate}</p>
                <p className="mt-1 text-xs text-slate-500">maj {formatDateTime(searchConsoleReport.generatedAt)}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              {[
                ['Clics head', formatNumber(searchConsoleReport.summary.headCurrent.clicks)],
                ['Impressions head', formatNumber(searchConsoleReport.summary.headCurrent.impressions)],
                ['CTR head', formatPercent(searchConsoleReport.summary.headCurrent.ctr * 100)],
                ['Position head', searchConsoleReport.summary.headCurrent.position.toLocaleString('fr-FR', { maximumFractionDigits: 2 })],
                ['Pages connues Google', String(statusSummary.known)],
                ['Pages stables 7j', String(stableIndexedCount)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">{label}</p>
                  <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                ['Δ clics head', formatDelta(searchConsoleReport.summary.headDelta.clicks)],
                ['Δ impressions head', formatDelta(searchConsoleReport.summary.headDelta.impressions)],
                ['Δ CTR head', formatDelta(searchConsoleReport.summary.headDelta.ctr)],
                ['Δ position head', formatDelta(searchConsoleReport.summary.headDelta.position, '')],
              ].map(([label, value]) => (
                <div key={label} className="rounded-3xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">{label}</p>
                  <p className={`mt-3 text-2xl font-black tracking-tight ${label.includes('position') ? getDeltaTone(searchConsoleReport.summary.headDelta.position, true) : getDeltaTone((label.includes('impressions') ? searchConsoleReport.summary.headDelta.impressions : label.includes('CTR') ? searchConsoleReport.summary.headDelta.ctr : searchConsoleReport.summary.headDelta.clicks))}`}>
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              {[
                ['Sessions GA4', formatNumber(searchConsoleReport.summary.ga4Current.sessions)],
                ['Pages vues GA4', formatNumber(searchConsoleReport.summary.ga4Current.screenPageViews)],
                ['Users GA4', formatNumber(searchConsoleReport.summary.ga4Current.activeUsers)],
                ['Engagement GA4', formatPercent(searchConsoleReport.summary.ga4Current.engagementRate * 100)],
                ['Durée moyenne', formatSeconds(searchConsoleReport.summary.ga4Current.averageSessionDuration)],
                ['Δ sessions', formatDelta(searchConsoleReport.summary.ga4Delta.sessions)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">{label}</p>
                  <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              <p>{searchConsoleReport.notes.description}</p>
              <p className="mt-2">
                Site global: {formatNumber(searchConsoleReport.summary.siteCurrent.clicks)} clics / {formatNumber(searchConsoleReport.summary.siteCurrent.impressions)} impressions.
              </p>
              <p className="mt-2">
                Une URL est considérée stable quand elle est reconnue par Google pendant au moins {inspectionStableThreshold} observations récentes dans la fenêtre mobile de {inspectionWindowDays} jours.
              </p>
              {searchConsoleReport.ga4 ? (
                <p className="mt-2">
                  GA4: {searchConsoleReport.ga4.available ? 'connecté' : 'non disponible'} · propriété {searchConsoleReport.ga4.property?.displayName || 'indisponible'} · stream {searchConsoleReport.ga4.property?.measurementId || '—'}.
                </p>
              ) : null}
              {searchConsoleReport.ga4?.error ? (
                <p className="mt-2 text-rose-600">
                  GA4 Data API: {searchConsoleReport.ga4.error}
                </p>
              ) : null}
            </div>

            {report?.rotation ? (
              <div className="mt-6 grid gap-4 xl:grid-cols-4">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Set actif Google</p>
                  <p className="mt-3 font-semibold text-slate-900">{report.rotation.activeTargets.join(', ') || '—'}</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Targets pinning</p>
                  <p className="mt-3 font-semibold text-slate-900">{report.rotation.pinnedTargets.join(', ') || '—'}</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">URLs sorties du set</p>
                  <p className="mt-3 font-semibold text-slate-900">{report.rotation.deferredTargets.join(', ') || 'aucune'}</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Prochaines candidates</p>
                  <p className="mt-3 font-semibold text-slate-900">{report.rotation.nextCandidates.join(', ') || 'aucune'}</p>
                </div>
              </div>
            ) : null}

            <div className="mt-8 grid gap-4 xl:grid-cols-2">
              {seoActionGroups.map((group) => (
                <div key={group.key} className={`rounded-3xl border p-6 ${group.tone}`}>
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500">Actions SEO</p>
                  <h3 className="mt-3 text-xl font-black tracking-tight text-slate-900">{group.title}</h3>
                  {group.rows.length ? (
                    <div className="mt-4 space-y-4">
                      {group.rows.map((row) => (
                        <div key={`${group.key}-${row.url}`} className="rounded-3xl border border-white/80 bg-white/80 p-4">
                          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <p className="font-bold text-slate-900">{row.label}</p>
                              <a href={row.url} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-sky-600 hover:text-sky-500">{row.url}</a>
                            </div>
                            <span className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
                              priorité {Math.round(row.priority)}
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-700">{row.reason}</p>
                          <div className="mt-4 flex flex-wrap gap-3">
                            <a
                              href={buildSearchConsoleInspectionUrl(row.url)}
                              target="_blank"
                              rel="noreferrer"
                              className={`inline-flex items-center rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] transition ${
                                group.key === 'forceIndex'
                                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                                  : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                              }`}
                            >
                              {group.key === 'forceIndex' ? 'Ouvrir dans GSC' : 'Inspecter dans GSC'}
                            </a>
                            <a
                              href={row.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-700 transition hover:border-slate-400"
                            >
                              Ouvrir la page
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-slate-600">Aucune action prioritaire dans ce groupe sur la fenêtre courante.</p>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-2">
              <div className="overflow-x-auto rounded-3xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                    <tr>
                      <th className="px-6 py-4">Pages en hausse</th>
                      <th className="px-6 py-4">Clics</th>
                      <th className="px-6 py-4">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {topSearchWinners.map((row) => (
                      <tr key={`win-${row.url}`} className="align-top">
                        <td className="px-6 py-5">
                          <p className="font-bold text-slate-900">{row.label}</p>
                          <a href={row.url} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-sky-600 hover:text-sky-500">{row.url}</a>
                        </td>
                        <td className="px-6 py-5 text-slate-600">{formatNumber(row.current.clicks)}</td>
                        <td className={`px-6 py-5 font-semibold ${getDeltaTone(row.delta.clicks)}`}>{formatDelta(row.delta.clicks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="overflow-x-auto rounded-3xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                    <tr>
                      <th className="px-6 py-4">Pages en recul</th>
                      <th className="px-6 py-4">Clics</th>
                      <th className="px-6 py-4">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {topSearchLosers.map((row) => (
                      <tr key={`lose-${row.url}`} className="align-top">
                        <td className="px-6 py-5">
                          <p className="font-bold text-slate-900">{row.label}</p>
                          <a href={row.url} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-sky-600 hover:text-sky-500">{row.url}</a>
                        </td>
                        <td className="px-6 py-5 text-slate-600">{formatNumber(row.current.clicks)}</td>
                        <td className={`px-6 py-5 font-semibold ${getDeltaTone(row.delta.clicks)}`}>{formatDelta(row.delta.clicks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {searchConsoleReport.ga4?.topPages?.length ? (
              <div className="mt-8 overflow-x-auto rounded-3xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                    <tr>
                      <th className="px-6 py-4">Top pages GA4</th>
                      <th className="px-6 py-4">Sessions</th>
                      <th className="px-6 py-4">Users</th>
                      <th className="px-6 py-4">Engagement</th>
                      <th className="px-6 py-4">Durée</th>
                      <th className="px-6 py-4">Vues</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {searchConsoleReport.ga4.topPages.map((row) => (
                      <tr key={`ga4-${row.url}`} className="align-top">
                        <td className="px-6 py-5">
                          <p className="font-bold text-slate-900">{row.label}</p>
                          <a href={row.url} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-sky-600 hover:text-sky-500">{row.url}</a>
                        </td>
                        <td className="px-6 py-5 text-slate-600">{formatNumber(row.ga4.current.sessions)}</td>
                        <td className="px-6 py-5 text-slate-600">{formatNumber(row.ga4.current.activeUsers)}</td>
                        <td className="px-6 py-5 text-slate-600">{formatPercent(row.ga4.current.engagementRate * 100)}</td>
                        <td className="px-6 py-5 text-slate-600">{formatSeconds(row.ga4.current.averageSessionDuration)}</td>
                        <td className="px-6 py-5 text-slate-600">{formatNumber(row.ga4.current.screenPageViews)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="mt-8 overflow-x-auto rounded-3xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                  <tr>
                    <th className="px-6 py-4">URL head</th>
                    <th className="px-6 py-4">Google 7j</th>
                    <th className="px-6 py-4">Clics</th>
                    <th className="px-6 py-4">Impressions</th>
                    <th className="px-6 py-4">CTR</th>
                    <th className="px-6 py-4">Position</th>
                    <th className="px-6 py-4">Sessions GA4</th>
                    <th className="px-6 py-4">Engagement</th>
                    <th className="px-6 py-4">Δ clics</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {searchTargetRows.map((row: SearchConsoleTargetRow & { inspection?: (typeof reportRows[number]) | null }) => (
                    <tr key={row.url} className="align-top">
                      <td className="px-6 py-5">
                        <p className="font-bold text-slate-900">{row.label}</p>
                        <a href={row.url} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-sky-600 hover:text-sky-500">{row.url}</a>
                      </td>
                      <td className="px-6 py-5">
                        {row.inspection ? (
                          <>
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${row.inspection.recognition.tone}`}>
                              {row.inspection.recognition.label}
                            </span>
                            <div className="mt-2">
                              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getHistoryTone(row.inspection)}`}>
                                {formatHistoryWindow(row.inspection)}
                              </span>
                            </div>
                            {(row.inspection.history7d?.stableIndexed) ? (
                              <p className="mt-2 text-xs text-emerald-600">Stable, sortie automatique possible</p>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-xs text-slate-500">hors set inspection</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-slate-600">{formatNumber(row.current.clicks)}</td>
                      <td className="px-6 py-5 text-slate-600">{formatNumber(row.current.impressions)}</td>
                      <td className="px-6 py-5 text-slate-600">{formatPercent(row.current.ctr * 100)}</td>
                      <td className="px-6 py-5 text-slate-600">{row.current.position.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</td>
                      <td className="px-6 py-5 text-slate-600">{formatNumber(row.ga4.current.sessions)}</td>
                      <td className="px-6 py-5 text-slate-600">
                        {formatPercent(row.ga4.current.engagementRate * 100)}
                        <div className="mt-1 text-xs text-slate-500">{formatSeconds(row.ga4.current.averageSessionDuration)}</div>
                      </td>
                      <td className={`px-6 py-5 font-semibold ${getDeltaTone(row.delta.clicks)}`}>{formatDelta(row.delta.clicks)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {searchConsoleReport.reserveCandidates?.length ? (
              <div className="mt-8 overflow-x-auto rounded-3xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                    <tr>
                      <th className="px-6 py-4">Réserve head</th>
                      <th className="px-6 py-4">Sessions GA4</th>
                      <th className="px-6 py-4">Impressions</th>
                      <th className="px-6 py-4">Clics</th>
                      <th className="px-6 py-4">Potentiel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {searchConsoleReport.reserveCandidates.map((row) => (
                      <tr key={`reserve-${row.url}`} className="align-top">
                        <td className="px-6 py-5">
                          <p className="font-bold text-slate-900">{row.label}</p>
                          <a href={row.url} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-sky-600 hover:text-sky-500">{row.url}</a>
                        </td>
                        <td className="px-6 py-5 text-slate-600">{formatNumber(row.ga4.current.sessions)}</td>
                        <td className="px-6 py-5 text-slate-600">{formatNumber(row.current.impressions)}</td>
                        <td className="px-6 py-5 text-slate-600">{formatNumber(row.current.clicks)}</td>
                        <td className="px-6 py-5 text-slate-600">{formatPercent(row.ga4.current.engagementRate * 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="mt-8 overflow-x-auto rounded-3xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Requêtes search head</th>
                    <th className="px-6 py-4">Clics</th>
                    <th className="px-6 py-4">Impressions</th>
                    <th className="px-6 py-4">CTR</th>
                    <th className="px-6 py-4">Position</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {searchConsoleReport.topQueries.map((row) => (
                    <tr key={row.query} className="align-top">
                      <td className="px-6 py-5 font-semibold text-slate-900">{row.query}</td>
                      <td className="px-6 py-5 text-slate-600">{formatNumber(row.clicks)}</td>
                      <td className="px-6 py-5 text-slate-600">{formatNumber(row.impressions)}</td>
                      <td className="px-6 py-5 text-slate-600">{formatPercent(row.ctr * 100)}</td>
                      <td className="px-6 py-5 text-slate-600">{row.position.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {supabaseUsageReport ? (
          <div className="mt-8 rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.35em] text-slate-400">Supabase</p>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900">Usage DB et stockage</h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                  Vue de contrôle de la taille réelle du projet: base actuelle, tables qui grossissent, stockage objets et état de la quota DB. L’egress reste séparé tant qu’un flux management dédié n’est pas branché.
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
                <p className="font-bold text-slate-900">Projet</p>
                <p className="mt-1">{supabaseUsageReport.projectRef || 'indisponible'}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(supabaseUsageReport.generatedAt)}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              {[
                ['Base actuelle', formatBytes(supabaseUsageReport.database.currentBytes)],
                ['Quota DB', formatBytes(supabaseUsageReport.database.limitBytes)],
                ['Usage DB', formatPercent(supabaseUsageReport.database.usagePercent)],
                ['Storage objets', formatBytes(supabaseUsageReport.storage.bytes)],
                ['Objets storage', formatNumber(supabaseUsageReport.storage.objects)],
                ['Top table', supabaseUsageReport.summary.topTableName || '—'],
              ].map(([label, value], index) => (
                <div key={label} className={`rounded-3xl border border-slate-200 p-5 ${index === 2 ? supabaseDbTone : 'bg-slate-50'}`}>
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">{label}</p>
                  <p className="mt-3 text-sm font-semibold text-slate-900 break-words">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              <p>{supabaseUsageReport.notes.description}</p>
              <p className="mt-2">
                Egress: {supabaseUsageReport.egress.available ? formatBytes(supabaseUsageReport.egress.currentBytes) : (supabaseUsageReport.egress.detail || 'indisponible')}
              </p>
              <p className="mt-2">
                Management API configurée: {supabaseUsageReport.notes.managementApiConfigured ? 'oui' : 'non'} · rétention programmes: {supabaseUsageReport.notes.retentionDays ?? '—'} jours
              </p>
            </div>

            <div className="mt-8 overflow-x-auto rounded-3xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Table clé</th>
                    <th className="px-6 py-4">Taille</th>
                    <th className="px-6 py-4">Lignes</th>
                    <th className="px-6 py-4">Fenêtre</th>
                    <th className="px-6 py-4">Rétention</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {supabaseUsageReport.keyTables.map((row) => (
                    <tr key={getTableLabel(row)} className="align-top">
                      <td className="px-6 py-5">
                        <p className="font-bold text-slate-900">{getTableLabel(row)}</p>
                      </td>
                      <td className="px-6 py-5 text-slate-600">
                        <p><span className="font-semibold text-slate-900">Total:</span> {formatBytes(row.totalBytes)}</p>
                        <p className="mt-1"><span className="font-semibold text-slate-900">Table:</span> {formatBytes(row.tableBytes)}</p>
                        <p className="mt-1"><span className="font-semibold text-slate-900">Index:</span> {formatBytes(row.indexBytes)}</p>
                      </td>
                      <td className="px-6 py-5 text-slate-600">
                        <p><span className="font-semibold text-slate-900">Exact:</span> {formatNumber(row.rowsExact)}</p>
                        {typeof row.rowEstimate === 'number' ? <p className="mt-1"><span className="font-semibold text-slate-900">Est.:</span> {formatNumber(row.rowEstimate)}</p> : null}
                      </td>
                      <td className="px-6 py-5 text-slate-600">
                        <p><span className="font-semibold text-slate-900">Min:</span> {formatDateTime(row.oldestStart)}</p>
                        <p className="mt-1"><span className="font-semibold text-slate-900">Max:</span> {formatDateTime(row.newestStart)}</p>
                      </td>
                      <td className="px-6 py-5 text-slate-600">
                        {typeof row.olderThanRetention === 'number' ? (
                          <p>
                            <span className="font-semibold text-slate-900">Plus vieux que la rétention:</span> {formatNumber(row.olderThanRetention)}
                          </p>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 overflow-x-auto rounded-3xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Top tables</th>
                    <th className="px-6 py-4">Total</th>
                    <th className="px-6 py-4">Table</th>
                    <th className="px-6 py-4">Index</th>
                    <th className="px-6 py-4">Estimation lignes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {supabaseUsageReport.topTables.map((row) => (
                    <tr key={getTableLabel(row)} className="align-top">
                      <td className="px-6 py-5 font-bold text-slate-900">{getTableLabel(row)}</td>
                      <td className="px-6 py-5 text-slate-600">{formatBytes(row.totalBytes)}</td>
                      <td className="px-6 py-5 text-slate-600">{formatBytes(row.tableBytes)}</td>
                      <td className="px-6 py-5 text-slate-600">{formatBytes(row.indexBytes)}</td>
                      <td className="px-6 py-5 text-slate-600">{formatNumber(row.rowEstimate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {supabaseUsageReport.storage.available && supabaseUsageReport.storage.buckets.length ? (
              <div className="mt-8 overflow-x-auto rounded-3xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                    <tr>
                      <th className="px-6 py-4">Bucket storage</th>
                      <th className="px-6 py-4">Objets</th>
                      <th className="px-6 py-4">Taille</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {supabaseUsageReport.storage.buckets.map((bucket) => (
                      <tr key={bucket.bucketId} className="align-top">
                        <td className="px-6 py-5 font-bold text-slate-900">{bucket.bucketId}</td>
                        <td className="px-6 py-5 text-slate-600">{formatNumber(bucket.objects)}</td>
                        <td className="px-6 py-5 text-slate-600">{formatBytes(bucket.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}

        {report ? (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                ['Dernier signal envoyé', freshWindowLabel],
                ['URLs inspectées', String(report.summary.total)],
                ['Connues par Google', String(statusSummary.known)],
                [`Stables ${inspectionWindowDays}j`, String(stableIndexedCount)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">{label}</p>
                  <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Contexte API</p>
              <p className="mt-3 text-sm leading-7 text-slate-600">{report.notes.description}</p>
              <p className="mt-2 text-sm text-slate-500">
                Quotas officiels: {report.notes.dailyQuotaPerProperty}/jour et {report.notes.perMinuteQuotaPerProperty}/minute par propriété.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                “Dernier signal envoyé” correspond à la fin du cycle importer: EPG → prerender → ping moteurs → inspection.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                La lecture d’indexation affichée ici est limitée à une fenêtre de {inspectionWindowDays} jours pour décider si une URL head reste dans le set Google ou peut laisser sa place à une autre.
              </p>
            </div>

            <div className="mt-8 overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <h2 className="text-xl font-black tracking-tight text-slate-900">Listing pages inspectées</h2>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ['all', `Toutes (${reportRows.length})`],
                      ['unknown', `Non reconnues (${statusSummary.unknown})`],
                      ['known', `Connues (${statusSummary.known})`],
                      ['errors', `Erreurs (${statusSummary.errors})`],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setActiveFilter(key as InspectionFilter)}
                        className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] transition ${
                          activeFilter === key
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-900 hover:text-slate-900'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                    <tr>
                      <th className="px-6 py-4">URL</th>
                      <th className="px-6 py-4">Google</th>
                      <th className="px-6 py-4">Signal envoyé</th>
                      <th className="px-6 py-4">Dernier crawl</th>
                      <th className="px-6 py-4">Fetch</th>
                      <th className="px-6 py-4">Rich results</th>
                      <th className="px-6 py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((row) => (
                      <tr key={row.url} className="align-top">
                        <td className="px-6 py-5">
                          <p className="font-bold text-slate-900">{row.channelName}</p>
                          <a href={row.url} className="mt-1 block text-sm text-sky-600 hover:text-sky-500" target="_blank" rel="noreferrer">
                            {row.url}
                          </a>
                          {row.coverageState ? (
                            <p className="mt-2 text-xs text-slate-500">{row.coverageState}</p>
                          ) : null}
                          {row.history7d ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold ${getHistoryTone(row)}`}>
                                {formatHistoryWindow(row)}
                              </span>
                              {row.history7d.stableIndexed ? (
                                <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold text-emerald-700">
                                  Stable
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-6 py-5">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${row.recognition.tone}`}>
                            {row.recognition.label}
                          </span>
                          <p className="mt-2 text-xs text-slate-500">{row.recognition.detail}</p>
                          {row.robotsTxtState ? <p className="mt-1 text-xs text-slate-500">robots: {row.robotsTxtState}</p> : null}
                        </td>
                        <td className="px-6 py-5 text-slate-600">{freshWindowLabel}</td>
                        <td className="px-6 py-5 text-slate-600">{formatDateTime(row.lastCrawlTime)}</td>
                        <td className="px-6 py-5 text-slate-600">{row.pageFetchState || row.error || 'indisponible'}</td>
                        <td className="px-6 py-5">
                          <p className="font-semibold text-slate-800">{row.richResultsVerdict || 'N/A'}</p>
                          {row.richResultTypes?.length ? (
                            <p className="mt-2 text-xs text-slate-500">{row.richResultTypes.join(', ')}</p>
                          ) : null}
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex flex-wrap gap-2">
                            <a
                              href={row.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
                            >
                              Voir page
                            </a>
                            {row.inspectionResultLink ? (
                              <a
                                href={row.inspectionResultLink}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
                              >
                                Ouvrir dans GSC
                              </a>
                            ) : null}
                          </div>
                          {row.googleCanonical || row.userCanonical ? (
                            <div className="mt-3 space-y-1 text-xs text-slate-500">
                              {row.googleCanonical ? <p>Google canonical: {row.googleCanonical}</p> : null}
                              {row.userCanonical ? <p>User canonical: {row.userCanonical}</p> : null}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}

        {socialReport ? (
          <div className="mt-8 rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.35em] text-slate-400">Social</p>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900">Posts Bluesky</h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                  Historique court des publications quotidiennes encore actives. Le rapport est limité aux 10 derniers posts Bluesky.
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
                <p className="font-bold text-slate-900">Source</p>
                <p className="mt-1">{socialReport.source}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {socialSummaryCards.map(([label, value]) => (
                <div key={label} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">{label}</p>
                  <p className="mt-3 text-sm font-semibold text-slate-900 break-words">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              <p>{socialReport.notes.description}</p>
              <p className="mt-2">Les métriques affichées ici viennent uniquement de Bluesky. X est sorti du flux quotidien.</p>
            </div>

            <div className="mt-8 overflow-x-auto rounded-3xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Post</th>
                    <th className="px-6 py-4">Plateforme</th>
                    <th className="px-6 py-4">Statut</th>
                    <th className="px-6 py-4">Publication</th>
                    <th className="px-6 py-4">Performance</th>
                    <th className="px-6 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {socialRows.map((row) => (
                    <tr key={`${row.platform}-${row.postId || row.createdAt || row.postType}`} className="align-top">
                      <td className="px-6 py-5">
                        <p className="font-bold text-slate-900">{formatPostTypeLabel(row.postType)}</p>
                        <p className="mt-2 line-clamp-3 max-w-xl text-sm leading-6 text-slate-600">{row.postText || 'Texte indisponible'}</p>
                        {row.errorMsg ? <p className="mt-2 text-xs text-rose-600">{row.errorMsg}</p> : null}
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] ${getPlatformTone(row.platform)}`}>
                          {formatPlatformLabel(row.platform)}
                        </span>
                        {row.postId ? <p className="mt-2 text-xs text-slate-500 break-all">{row.postId}</p> : null}
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] ${getSocialStatusTone(row.status)}`}>
                          {row.status}
                        </span>
                        {row.metrics.error ? <p className="mt-2 text-xs text-amber-600">{row.metrics.error}</p> : null}
                      </td>
                      <td className="px-6 py-5 text-slate-600">
                        <p>{formatDateTime(row.createdAt || row.metrics.sourceCreatedAt)}</p>
                        <p className="mt-2 text-xs text-slate-500">Date logique: {row.postDate || '—'}</p>
                      </td>
                      <td className="px-6 py-5 text-slate-600">
                        <div className="space-y-1">
                          <p><span className="font-semibold text-slate-900">{getPrimaryMetricLabel(row)}:</span> {getPrimaryMetricValue(row)}</p>
                          <p><span className="font-semibold text-slate-900">Reposts:</span> {formatNumber(row.metrics.reposts)}</p>
                          <p><span className="font-semibold text-slate-900">Replies:</span> {formatNumber(row.metrics.replies)}</p>
                          <p><span className="font-semibold text-slate-900">Quotes:</span> {formatNumber(row.metrics.quotes)}</p>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        {row.postUrl ? (
                          <a
                            href={row.postUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
                          >
                            Voir post
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
};
