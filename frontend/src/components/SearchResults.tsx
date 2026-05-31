import React from 'react';
import { Channel, Program } from '../types';
import { getNowInParis } from '../utils/timeSlots';
import { getChannelLogo } from '../utils/channelLogos';

// Format hour helper
const formatHour = (isoString: string) => {
  return new Date(isoString).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

interface SearchResult {
  type: 'program' | 'channel';
  program?: Program;
  channel?: Channel;
  matchType: 'title' | 'channel' | 'both';
}

interface SearchResultsProps {
  results: SearchResult[];
  onProgramClick: (channel: Channel, program: Program) => void;
  onChannelClick: (channel: Channel) => void;
  onClose: () => void;
  searchQuery?: string;
  totalResults?: number;
  onViewAll?: () => void;
}

export const SearchResults: React.FC<SearchResultsProps> = ({ 
  results, 
  onProgramClick, 
  onChannelClick,
  onClose,
  searchQuery,
  totalResults,
  onViewAll
}) => {
  const now = getNowInParis();

  if (results.length === 0) {
    return (
      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border-2 border-slate-200 p-6 z-50">
        <p className="text-slate-500 text-center">Aucun résultat trouvé</p>
      </div>
    );
  }

  // Separate programs and channels
  const programResults = results.filter(r => r.type === 'program');
  const channelResults = results.filter(r => r.type === 'channel');

  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border-2 border-slate-200 max-h-[600px] overflow-y-auto z-50">
      {/* Programs Section */}
      {programResults.length > 0 && (
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
            Programmes ({programResults.length})
          </h3>
          <div className="space-y-2">
            {programResults.map((result, idx) => {
              if (!result.program || !result.channel) return null;
              
              const startDate = new Date(result.program.startTime);
              const endDate = new Date(result.program.endTime);
              const isLive = now.getTime() >= startDate.getTime() && now.getTime() <= endDate.getTime();
              
              return (
                <button
                  key={`${result.channel.id}-${result.program.id}-${idx}`}
                  onClick={() => {
                    onProgramClick(result.channel!, result.program!);
                    onClose();
                  }}
                  className="w-full text-left p-3 rounded-xl hover:bg-blue-50 border-2 border-transparent hover:border-blue-200 transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden">
                      <img 
                        src={getChannelLogo(result.channel.id, result.channel.logo, result.channel.name)} 
                        alt={result.channel.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors truncate">
                          {result.program.title}
                        </h4>
                        {isLive && (
                          <span className="flex-shrink-0 px-2 py-0.5 bg-rose-500 text-white text-[10px] font-black rounded-full">
                            EN DIRECT
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold">{result.channel.name}</span>
                        <span>•</span>
                        <time>{formatHour(result.program.startTime)} - {formatHour(result.program.endTime)}</time>
                        {result.program.category && (
                          <>
                            <span>•</span>
                            <span className="px-2 py-0.5 bg-slate-100 rounded-full">{result.program.category}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Channels Section */}
      {channelResults.length > 0 && (
        <div className="p-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
            Chaînes ({channelResults.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {channelResults.map((result) => {
              if (!result.channel) return null;
              
              return (
                <button
                  key={result.channel.id}
                  onClick={() => {
                    onChannelClick(result.channel!);
                    onClose();
                  }}
                  className="p-3 rounded-xl hover:bg-blue-50 border-2 border-transparent hover:border-blue-200 transition-all group text-center"
                >
                  <div className="w-16 h-16 mx-auto mb-2 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden">
                    <img 
                      src={getChannelLogo(result.channel.id, result.channel.logo, result.channel.name)} 
                      alt={result.channel.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <p className="text-xs font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                    {result.channel.name}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* View All Button */}
      {onViewAll && totalResults && totalResults > results.length && (
        <div className="p-4 border-t border-slate-100">
          <button
            onClick={onViewAll}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors text-sm"
          >
            Voir tous les résultats ({totalResults})
          </button>
        </div>
      )}
    </div>
  );
};
