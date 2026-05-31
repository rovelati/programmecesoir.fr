import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../utils/supabase';
import { CHANNELS_TABLE, PROGRAMS_TABLE } from '../utils/dbTables';
import { getTodayInParis } from '../utils/timeSlots';
import { useSEO } from '../utils/seo';

const ADMIN_USER = 'prontofarmacie';
const ADMIN_PASS = 'baumicio';
const AUTH_KEY = 'admin_test_auth';
const IMPORT_STATUS_TABLE = import.meta.env.VITE_IMPORT_STATUS_TABLE || 'import_status';
const IMPORT_STATUS_ID = import.meta.env.VITE_IMPORT_STATUS_ID || 'epg_fr';

type StatRow = {
  label: string;
  value: string;
  hint?: string;
};

type DailyStats = {
  date: string;
  count: number;
};

export const AdminTest: React.FC = () => {
  const [isAuthed, setIsAuthed] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<StatRow[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);

  useSEO({
    title: 'Admin Test - Programme Ce Soir',
    description: 'Diagnostic de chargement des programmes',
    url: '/admin-test',
    noindex: true,
  });

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem(AUTH_KEY) : null;
    if (stored === '1') {
      setIsAuthed(true);
    }
  }, []);

  const formatDateTime = (value?: string | null) => {
    if (!value) return 'indisponible';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'indisponible';
    return parsed.toLocaleString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  };

  const formatDateOnly = (value?: string | null) => {
    if (!value) return 'indisponible';
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return 'indisponible';
    return parsed.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Paris',
    });
  };

  const refreshStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const today = getTodayInParis();
      const startWindow = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
      const endWindow = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();

      // Fetch daily stats for histogram (last 14 days)
      const dailyStatsPromises = [];
      for (let i = 0; i < 14; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        dailyStatsPromises.push(
          supabase.from(PROGRAMS_TABLE).select('id', { count: 'exact', head: true }).eq('date', dateStr)
        );
      }

      const [
        importStatus,
        lastProgramDate,
        lastChannel,
        lastProgramStart,
        programsToday,
        channelsCount,
        liveNowCount,
        windowCount,
        channelsWithPrograms,
        programsWithDescription,
        programsWithSlug,
        totalPrograms,
        ...dailyStatsResults
      ] = await Promise.all([
        supabase.from(IMPORT_STATUS_TABLE).select('status, last_run_at, started_at, finished_at, channels_processed, programs_inserted, programs_deleted, error_message').eq('id', IMPORT_STATUS_ID).limit(1),
        supabase.from(PROGRAMS_TABLE).select('date').order('date', { ascending: false }).limit(1),
        supabase.from(CHANNELS_TABLE).select('created_at, channel_id, name').order('created_at', { ascending: false }).limit(1),
        supabase.from(PROGRAMS_TABLE).select('start_time, title, channel_id').order('start_time', { ascending: false }).limit(1),
        supabase.from(PROGRAMS_TABLE).select('id', { count: 'exact', head: true }).eq('date', today),
        supabase.from(CHANNELS_TABLE).select('id', { count: 'exact', head: true }),
        supabase.from(PROGRAMS_TABLE).select('id', { count: 'exact', head: true }).lte('start_time', nowIso).gte('end_time', nowIso),
        supabase.from(PROGRAMS_TABLE).select('id', { count: 'exact', head: true }).gte('start_time', startWindow).lte('start_time', endWindow),
        // Count distinct channels that have programs (fetch all channel_ids and count unique in JS)
        supabase.from(PROGRAMS_TABLE).select('channel_id').limit(50000),
        // Count programs with description
        supabase.from(PROGRAMS_TABLE).select('id', { count: 'exact', head: true }).not('description', 'is', null),
        // Count programs with slug
        supabase.from(PROGRAMS_TABLE).select('id', { count: 'exact', head: true }).not('slug', 'is', null),
        // Total programs count
        supabase.from(PROGRAMS_TABLE).select('id', { count: 'exact', head: true }),
        ...dailyStatsPromises,
      ]);

      // Process daily stats
      const stats: DailyStats[] = [];
      for (let i = 0; i < 14; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const result = dailyStatsResults[i];
        stats.push({
          date: dateStr,
          count: result.count ?? 0,
        });
      }
      setDailyStats(stats.reverse()); // Most recent first

      // Count distinct channels with programs
      const channelsWithProgramsData = channelsWithPrograms.data || [];
      const uniqueChannels = new Set(channelsWithProgramsData.map((p: any) => p.channel_id).filter(Boolean));
      const channelsWithProgramsCount = uniqueChannels.size;

      if (importStatus.error) {
        // ignore if table is missing; we'll show fallback stats
        console.warn('[AdminTest] import_status error:', importStatus.error);
      }
      if (lastProgramDate.error) throw lastProgramDate.error;
      if (lastChannel.error) throw lastChannel.error;

      const importStatusData = importStatus.data?.[0];
      const lastProgramDateData = lastProgramDate.data?.[0];
      const lastProgramStartData = lastProgramStart.data?.[0];
      const lastChannelData = lastChannel.data?.[0];

      const nextRows: StatRow[] = [
        ...(importStatusData
          ? [
              {
                label: 'Statut import',
                value: importStatusData.status || 'inconnu',
                hint: importStatusData.last_run_at ? `Dernier run: ${formatDateTime(importStatusData.last_run_at)}` : undefined,
              },
              {
                label: 'Dernier run',
                value: formatDateTime(importStatusData.last_run_at || importStatusData.finished_at || importStatusData.started_at),
                hint: importStatusData.error_message ? `Erreur: ${importStatusData.error_message}` : undefined,
              },
              {
                label: 'Résultat import',
                value: `${importStatusData.programs_inserted ?? 0} insérés / ${importStatusData.programs_deleted ?? 0} supprimés`,
                hint: `Chaînes: ${importStatusData.channels_processed ?? 0}`,
              },
            ]
          : []),
        {
          label: 'Dernière date disponible',
          value: formatDateOnly(lastProgramDateData?.date),
        },
        {
          label: 'Dernier programme planifié',
          value: formatDateTime(lastProgramStartData?.start_time),
          hint: lastProgramStartData?.title ? `${lastProgramStartData.title} (${lastProgramStartData.channel_id})` : undefined,
        },
        {
          label: 'Dernier import (chaîne)',
          value: formatDateTime(lastChannelData?.created_at),
          hint: lastChannelData?.name ? `${lastChannelData.name} (${lastChannelData.channel_id})` : undefined,
        },
        {
          label: 'Programmes aujourd’hui',
          value: `${programsToday.count ?? 0}`,
          hint: `Date Paris: ${today}`,
        },
        {
          label: 'Chaînes',
          value: `${channelsCount.count ?? 0}`,
        },
        {
          label: 'Chaînes avec programmes',
          value: `${channelsWithProgramsCount}`,
          hint: `Sur ${channelsCount.count ?? 0} chaînes totales`,
        },
        {
          label: 'Programmes avec description',
          value: `${programsWithDescription.count ?? 0}`,
          hint: `Sur ${totalPrograms.count ?? 0} programmes total (${totalPrograms.count ? Math.round(((programsWithDescription.count ?? 0) / totalPrograms.count) * 100) : 0}%)`,
        },
        {
          label: 'Programmes avec slug',
          value: `${programsWithSlug.count ?? 0}`,
          hint: `Sur ${totalPrograms.count ?? 0} programmes total (${totalPrograms.count ? Math.round(((programsWithSlug.count ?? 0) / totalPrograms.count) * 100) : 0}%)`,
        },
        {
          label: 'Total programmes',
          value: `${totalPrograms.count ?? 0}`,
        },
        {
          label: 'En direct maintenant',
          value: `${liveNowCount.count ?? 0}`,
          hint: `Fenêtre: ${formatDateTime(nowIso)}`,
        },
        {
          label: 'Fenêtre home (-2h / +6h)',
          value: `${windowCount.count ?? 0}`,
        },
      ];

      setRows(nextRows);
      setLastRefresh(new Date());
    } catch (err: any) {
      console.error('[AdminTest] Failed to load stats:', err);
      setError(err?.message || 'Erreur lors du chargement des statistiques');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthed) {
      refreshStats();
    }
  }, [isAuthed]);

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      setIsAuthed(true);
      setError(null);
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(AUTH_KEY, '1');
      }
      return;
    }
    setError('Identifiants invalides');
  };

  const handleLogout = () => {
    setIsAuthed(false);
    setUsername('');
    setPassword('');
    setRows([]);
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(AUTH_KEY);
    }
  };

  const refreshLabel = useMemo(() => {
    if (!lastRefresh) return 'Jamais';
    return lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }, [lastRefresh]);

  return (
    <div className="min-h-[70vh] bg-slate-50">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/40 p-6 md:p-10">
          <div className="flex items-center justify-between gap-4 mb-8">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-bold">Admin</p>
              <h1 className="text-3xl md:text-4xl font-black text-slate-900">Diagnostic Import</h1>
            </div>
            {isAuthed && (
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border border-slate-300 text-slate-500 hover:text-slate-700 hover:border-slate-400 transition-colors"
              >
                Déconnexion
              </button>
            )}
          </div>

          {!isAuthed ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Identifiant</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Identifiant"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Mot de passe"
                />
              </div>
              {error && <p className="text-sm text-rose-600 font-semibold">{error}</p>}
              <button
                type="submit"
                className="w-full rounded-xl bg-slate-900 text-white font-bold py-3 hover:bg-slate-800 transition-colors"
              >
                Accéder
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Dernier refresh : {refreshLabel}
                </div>
                <button
                  onClick={refreshStats}
                  disabled={loading}
                  className="px-4 py-2 rounded-full bg-blue-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-blue-500 disabled:opacity-50"
                >
                  {loading ? 'Chargement…' : 'Rafraîchir'}
                </button>
              </div>

              {error && <div className="text-sm text-rose-600 font-semibold">{error}</div>}

              <div className="grid grid-cols-1 gap-4">
                {rows.map((row) => (
                  <div key={row.label} className="rounded-2xl border border-slate-200 p-4 flex flex-col gap-2">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500">{row.label}</div>
                    <div className="text-xl font-black text-slate-900">{row.value}</div>
                    {row.hint && <div className="text-xs text-slate-500">{row.hint}</div>}
                  </div>
                ))}
              </div>

              {/* Histogram */}
              {dailyStats.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-lg font-black text-slate-900 mb-4">Programmes par jour (14 derniers jours)</h3>
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6">
                    <div className="flex items-end gap-1.5 h-64">
                      {dailyStats.map((stat) => {
                        const maxCount = Math.max(...dailyStats.map(s => s.count), 1);
                        const height = maxCount > 0 ? (stat.count / maxCount) * 100 : 0;
                        const date = new Date(stat.date + 'T00:00:00');
                        const weekday = date.toLocaleDateString('fr-FR', { weekday: 'short' });
                        const day = date.getDate();
                        const month = date.toLocaleDateString('fr-FR', { month: 'short' });
                        
                        return (
                          <div key={stat.date} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                            <div className="relative w-full flex items-end justify-center" style={{ height: '200px' }}>
                              <div
                                className={`w-full rounded-t transition-all cursor-pointer ${
                                  stat.count > 0 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300'
                                }`}
                                style={{ height: `${height}%`, minHeight: stat.count > 0 ? '4px' : '0' }}
                                title={`${stat.date}: ${stat.count} programmes`}
                              />
                            </div>
                            <div className="text-[9px] font-bold text-slate-600 text-center leading-tight">
                              <div className="uppercase">{weekday}</div>
                              <div className="text-slate-500">{day} {month}</div>
                              <div className="mt-1 font-black text-slate-900 text-xs">{stat.count.toLocaleString('fr-FR')}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
