
import React from 'react';
import { TimeSlotFilter, TimeView } from '../types';

interface HeroProps {
  currentFilter: TimeSlotFilter;
  onFilterChange: (filter: TimeSlotFilter) => void;
  liveCount: number;
  viewMode: TimeView;
  currentTime: Date;
}

export const Hero: React.FC<HeroProps> = ({ currentFilter, onFilterChange, liveCount, viewMode, currentTime }) => {
  const targetDate = new Date(currentTime);
  if (viewMode === 'tomorrow') {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  const displayDate = targetDate.toLocaleDateString('fr-FR', {
    weekday: 'long', 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric',
    timeZone: 'Europe/Paris'
  });
  const timeNow = currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

  const filterLabels: Record<TimeSlotFilter, string> = {
    Tous: 'Tous',
    Films: 'Films',
    Info: 'Info',
    Documentaires: 'Documentaires',
    Divertissement: 'Divertissement',
    Series: 'Séries',
    Sport: 'Sport',
    Jeunesse: 'Jeunesse',
    Culture: 'Culture'
  };

  const filters = Object.keys(filterLabels) as TimeSlotFilter[];

  const activeLabel = currentFilter !== 'Tous' ? filterLabels[currentFilter] : null;
  const viewLabel = viewMode === 'now' ? 'en direct' : viewMode === 'tomorrow' ? 'demain' : 'ce soir';
  return (
    <section className="bg-white border-b border-slate-200 py-10">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                viewMode === 'now' ? 'bg-rose-100 text-rose-600' : 'bg-orange-100 text-orange-600'
              }`}>
                {viewMode === 'now' && <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse mr-2"></span>}
                {viewMode === 'now' ? 'EN DIRECT' : viewMode === 'tomorrow' ? 'DEMAIN' : 'PRIME TIME'}
              </span>
              <span className="text-slate-400 text-sm font-medium">
                {viewMode === 'now' ? (
                  liveCount > 0 ? `${liveCount} chaînes en direct` : 'Aucune chaîne en direct'
                ) : viewMode === 'tomorrow' ? 'Tous les programmes de demain' : 'Tous les programmes'}
              </span>
            </div>
            <h1 className="text-[2rem] sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-none sm:leading-tight">
              {activeLabel ? (
                <>
                  {activeLabel} à la TV <span className="text-blue-600">{viewLabel}</span>
                </>
              ) : (
                <span className="inline-block whitespace-nowrap">
                  Programme TNT <span className="text-blue-600">{viewMode === 'now' ? 'En direct' : viewMode === 'tomorrow' ? 'Demain' : 'Ce soir'}</span>
                </span>
              )}
            </h1>
            <p className="text-lg text-slate-500 font-medium capitalize">
              {displayDate} <span className="text-slate-400">•</span> {timeNow}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {filters.map(f => (
              <button
                key={f}
                onClick={() => onFilterChange(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border-2 ${
                  currentFilter === f 
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200' 
                    : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400 hover:bg-slate-50'
                }`}
              >
                {filterLabels[f]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
