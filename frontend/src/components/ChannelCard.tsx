
import React, { useMemo, useState, useEffect } from 'react';
import { Channel, Program, TimeView } from '../types';
import { getNowInParis } from '../utils/timeSlots';
import { getChannelLogo } from '../utils/channelLogos';
import { getProgramUrl } from '../utils/programSlug';
import { getChannelSlug, getChannelUrl } from '../utils/channelSlug';
import { getChannelNumberLabel, hasValidChannelNumber } from '../utils/channelNumbers';

interface ChannelCardProps {
  channel: Channel;
  viewMode?: TimeView;
  onClick?: () => void;
}

export const ChannelCard: React.FC<ChannelCardProps> = ({ channel, viewMode = 'now', onClick }) => {
  // Update current time every minute to show live programs correctly
  const [now, setNow] = useState(() => getNowInParis());
  const [logoError, setLogoError] = useState(false);
  const [programImageError, setProgramImageError] = useState(false);
  const isTonight = viewMode === 'tonight';

  useEffect(() => {
    setLogoError(false);
  }, [channel.id, channel.logo, channel.name]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(getNowInParis());
    }, 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  // Get logo with fallback
  const logoUrl = useMemo(() => {
    if (logoError) {
      return getChannelLogo(channel.id, null, channel.name);
    }
    return getChannelLogo(channel.id, channel.logo, channel.name);
  }, [channel.id, channel.logo, channel.name, logoError]);

  const sortedPrograms = useMemo(() => {
    if (!channel.programs || channel.programs.length === 0) {
      return [];
    }

    const bestByTime = new Map<string, Program>();
    const scoreProgram = (p: Program) => {
      const titleScore = (p.title || '').length;
      const descScore = (p.description || '').length;
      const categoryScore = p.category ? 10 : 0;
      return titleScore + descScore + categoryScore;
    };

    channel.programs.forEach(p => {
      const key = `${p.startTime}|${p.endTime}`;
      const existing = bestByTime.get(key);
      if (!existing || scoreProgram(p) > scoreProgram(existing)) {
        bestByTime.set(key, p);
      }
    });

    return Array.from(bestByTime.values()).sort((a, b) => {
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });
  }, [channel.programs]);

  // Find what's on now or upcoming (within -2 to +6 hours range)
  const currentProgram = useMemo(() => {
    if (sortedPrograms.length === 0) {
      return null;
    }

    const nowTime = now.getTime();

    // For "now" viewMode: show programs from -2 hours to +6 hours
    if (viewMode === 'now') {
      // First, try to find a program that's currently on air
      const onAirProgram = sortedPrograms.find(p => {
        if (!p.startTime || !p.endTime) return false;
        const start = new Date(p.startTime).getTime();
        const end = new Date(p.endTime).getTime();
        if (isNaN(start) || isNaN(end)) return false;
        return nowTime >= start && nowTime <= end;
      });

      if (onAirProgram) return onAirProgram;

      // If no program on air, find the next upcoming program
      return sortedPrograms.find(p => {
        if (!p.startTime) return false;
        const start = new Date(p.startTime).getTime();
        if (isNaN(start)) return false;
        return start >= nowTime;
      }) || null;
    }

    // For "tonight" viewMode: show programs from 18:00 today to 02:00 tomorrow
    if (viewMode === 'tonight') {
      const tonightStart = new Date(now);
      tonightStart.setHours(18, 0, 0, 0);
      const tonightEnd = new Date(tonightStart);
      tonightEnd.setDate(tonightEnd.getDate() + 1);
      tonightEnd.setHours(2, 0, 0, 0);

      const tonightStartTime = tonightStart.getTime();
      const tonightEndTime = tonightEnd.getTime();

      // First, try to find a program that's currently on air within tonight range
      const onAirProgram = sortedPrograms.find(p => {
        if (!p.startTime || !p.endTime) return false;
        const start = new Date(p.startTime).getTime();
        const end = new Date(p.endTime).getTime();
        if (isNaN(start) || isNaN(end)) return false;
        // Program is on air AND within tonight range
        return nowTime >= start && nowTime <= end && start >= tonightStartTime && start <= tonightEndTime;
      });

      if (onAirProgram) return onAirProgram;

      // If no program on air, find the next program in tonight range
      return sortedPrograms.find(p => {
        if (!p.startTime) return false;
        const start = new Date(p.startTime).getTime();
        if (isNaN(start)) return false;
        return start >= tonightStartTime && start <= tonightEndTime;
      }) || null;
    }

    // For "tomorrow" viewMode: show programs from 00:00 to 23:59 tomorrow
    if (viewMode === 'tomorrow') {
      const tomorrowStart = new Date(now);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      tomorrowStart.setHours(0, 0, 0, 0);
      const tomorrowEnd = new Date(tomorrowStart);
      tomorrowEnd.setHours(23, 59, 59, 999);

      const tomorrowStartTime = tomorrowStart.getTime();
      const tomorrowEndTime = tomorrowEnd.getTime();

      return sortedPrograms.find(p => {
        if (!p.startTime) return false;
        const start = new Date(p.startTime).getTime();
        if (isNaN(start)) return false;
        return start >= tomorrowStartTime && start <= tomorrowEndTime;
      }) || null;
    }

    // Fallback: For other viewModes, use existing logic
    const onAirProgram = sortedPrograms.find(p => {
      if (!p.startTime || !p.endTime) return false;
      const start = new Date(p.startTime).getTime();
      const end = new Date(p.endTime).getTime();
      if (isNaN(start) || isNaN(end)) return false;
      return nowTime >= start && nowTime <= end;
    });

    if (onAirProgram) return onAirProgram;

    // Show next upcoming program
    return sortedPrograms.find(p => {
      if (!p.startTime) return false;
      const start = new Date(p.startTime).getTime();
      if (isNaN(start)) return false;
      return start > nowTime;
    }) || null;
  }, [channel.programs, now, channel.name, viewMode]);

  // Find what's on tonight (Prime Time typically starts after 20:30)
  const primeTimeProgram = useMemo(() => {
    if (sortedPrograms.length === 0) return null;

    // For FR "ce soir": show the first program starting from 18:00
    const eveningProgram = sortedPrograms.find(p => {
      const start = new Date(p.startTime);
      const hour = start.getHours();
      return hour >= 18 && hour < 24;
    });

    // Fallback to last program of the day if no evening program found
    return eveningProgram || sortedPrograms[sortedPrograms.length - 1];
  }, [sortedPrograms]);

  const activeProgram = viewMode === 'now'
    ? currentProgram
    : viewMode === 'tomorrow'
      ? currentProgram
      : viewMode === 'tonight'
        ? currentProgram
        : primeTimeProgram;

  const activeProgramPoster = String((activeProgram as any)?.posterUrl || (activeProgram as any)?.poster_url || '').trim();

  useEffect(() => {
    setProgramImageError(false);
  }, [activeProgram?.id, activeProgramPoster]);

  const nextProgram = useMemo(() => {
    if (!activeProgram) return null;

    const activeStart = activeProgram.startTime ? new Date(activeProgram.startTime).getTime() : Number.NaN;
    const activeEnd = activeProgram.endTime ? new Date(activeProgram.endTime).getTime() : Number.NaN;
    const cutoff = Number.isNaN(activeEnd) ? activeStart : activeEnd;

    if (Number.isNaN(cutoff)) return null;

    const next = sortedPrograms.find(p => {
      if (!p.startTime) return false;
      const start = new Date(p.startTime).getTime();
      if (Number.isNaN(start)) return false;
      if (p.id === activeProgram.id && p.startTime === activeProgram.startTime) return false;
      return start >= cutoff;
    });

    return next || null;
  }, [sortedPrograms, activeProgram]);

  const progress = useMemo(() => {
    if (!currentProgram || viewMode !== 'now') return 0;
    const start = new Date(currentProgram.startTime).getTime();
    const end = new Date(currentProgram.endTime).getTime();
    const current = now.getTime();

    if (Number.isNaN(start) || Number.isNaN(end)) return 0;

    // Only show progress if program has actually started
    if (current < start) return 0;

    return Math.min(100, Math.max(0, ((current - start) / (end - start)) * 100));
  }, [currentProgram, now, viewMode]);

  // Check if current program is actually on air (vs upcoming)
  const isActuallyOnAir = useMemo(() => {
    if (!currentProgram) return false;
    const start = new Date(currentProgram.startTime).getTime();
    const end = new Date(currentProgram.endTime).getTime();
    const current = now.getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return false;
    return current >= start && current <= end;
  }, [currentProgram, now]);

  const programStatus = useMemo(() => {
    if (!currentProgram) return 'none';
    const start = new Date(currentProgram.startTime).getTime();
    const end = new Date(currentProgram.endTime).getTime();
    const current = now.getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return 'unknown';
    if (current < start) return 'upcoming';
    if (current > end) return 'ended';
    return 'live';
  }, [currentProgram, now]);

  const formatHour = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const hasNumber = hasValidChannelNumber(channel.number);
  const channelNumberLabel = getChannelNumberLabel(channel.number);

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 border-2 border-slate-300 hover:border-blue-400 flex flex-col group overflow-hidden cursor-pointer"
    >
      <div className={`${isTonight ? 'p-3 sm:p-3.5' : 'p-3.5 sm:p-4'} flex-1`}>
        {/* Channel Header */}
        <div className={`flex items-center gap-2.5 sm:gap-3 ${isTonight ? 'mb-2 sm:mb-2.5' : 'mb-2.5 sm:mb-3'}`}>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden border border-slate-100 flex-shrink-0 bg-white flex items-center justify-center p-1 min-w-[40px] sm:min-w-[48px]">
            <img
              src={logoUrl}
              alt={channel.name}
              className="w-full h-full object-contain max-w-full max-h-full"
              onError={() => {
                if (!logoError) {
                  console.warn(`[ChannelCard] Logo failed to load for ${channel.name}, using fallback`);
                  setLogoError(true);
                }
              }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-800 leading-tight">{channel.name}</h3>
              {channel.isRadio && (
                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold uppercase rounded">
                  Radio
                </span>
              )}
            </div>
            {(channel.isRadio || hasNumber) && (
              <span className="text-[10px] sm:text-xs font-semibold text-slate-400" translate="no">
                {channel.isRadio ? (
                  <>FM/AM {channelNumberLabel}</>
                ) : (
                  <>CH {channelNumberLabel}</>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Featured Program Slot */}
        <div className="mb-2.5 sm:mb-3">
          <div className="flex justify-between items-baseline mb-1">
            <span className={`text-[10px] font-bold tracking-wider uppercase ${viewMode === 'now' ? (isActuallyOnAir ? 'text-emerald-600' : 'text-blue-600') : 'text-orange-600'
              }`}>
              {viewMode === 'now'
                ? (programStatus === 'live' ? '🔴 En direct' : programStatus === 'upcoming' ? '⏰ À venir' : programStatus === 'ended' ? '✅ Terminé' : '⏰ À venir')
                : viewMode === 'tomorrow' ? '✨ Demain' : '✨ Ce soir'}
            </span>
            {activeProgram && (
              <span className="text-[10px] text-slate-400 font-medium">
                {formatHour(activeProgram.startTime)} - {formatHour(activeProgram.endTime)}
              </span>
            )}
          </div>

          {activeProgram ? (
            <div className="flex gap-3">
              {activeProgramPoster && !programImageError && (
                <a
                  href={getProgramUrl(getChannelSlug(channel.id), activeProgram.title)}
                  onClick={(e) => e.stopPropagation()}
                  className="relative h-16 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200"
                  aria-label={`Voir ${activeProgram.title}`}
                >
                  <img
                    src={activeProgramPoster}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={() => setProgramImageError(true)}
                  />
                </a>
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={getProgramUrl(getChannelSlug(channel.id), activeProgram.title)}
                  onClick={(e) => e.stopPropagation()}
                  className={`font-bold text-slate-900 hover:text-blue-600 transition-colors line-clamp-2 ${isTonight ? 'min-h-[2.3rem]' : 'min-h-[2.6rem]'} mb-1.5 leading-tight block`}
                >
                  {activeProgram.title}
                </a>
              </div>
            </div>
          ) : (
            <h4 className={`font-bold text-slate-900 line-clamp-2 ${isTonight ? 'min-h-[2.3rem]' : 'min-h-[2.6rem]'} mb-1.5 leading-tight`}>
              Aucun programme
            </h4>
          )}

          {activeProgram?.description && (
            <p className={`text-[11px] text-slate-500 line-clamp-2 ${isTonight ? 'mb-1.5' : 'mb-2'}`}>
              {activeProgram.description}
            </p>
          )}

          {/* Progress Bar (only for Now view) */}
          {viewMode === 'now' ? (
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-2.5">
              {programStatus === 'live' && (
                <div
                  className="h-full bg-blue-500 transition-all duration-1000"
                  style={{ width: `${progress}%` }}
                />
              )}
            </div>
          ) : (
            <div className={isTonight ? 'mb-2' : 'mb-2.5'}>
              <span className={`text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded ${isTonight ? 'leading-tight' : ''}`}>
                {activeProgram?.category}
              </span>
            </div>
          )}
        </div>

        {/* Next Program */}
        {nextProgram && (
          <div className={`${isTonight ? 'pt-1.5' : 'pt-2'} border-t border-slate-50`}>
            <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block mb-1">À suivre</span>
            <div className="flex justify-between items-start gap-2">
              <a
                href={getProgramUrl(getChannelSlug(channel.id), nextProgram.title)}
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-medium text-slate-600 hover:text-blue-600 transition-colors line-clamp-1 flex-1"
              >
                {nextProgram.title}
              </a>
              <span className="text-[10px] text-slate-400 whitespace-nowrap">{formatHour(nextProgram.startTime)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Hover Action */}
      <a
        href={getChannelUrl(channel.id, channel.isRadio, viewMode === 'now' ? 'maintenant' : viewMode === 'tomorrow' ? 'demain' : 'ce-soir')}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${isTonight ? 'py-2' : 'py-2.5'} bg-slate-50 text-blue-600 text-sm font-semibold text-center opacity-100 translate-y-0 transition-all md:opacity-0 md:translate-y-2 md:group-hover:opacity-100 md:group-hover:translate-y-0 block hover:bg-blue-50`}
      >
        Voir tous les programmes →
      </a>
    </div>
  );
};
