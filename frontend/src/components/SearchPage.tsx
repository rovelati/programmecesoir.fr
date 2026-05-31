import React, { useMemo } from 'react';
import { Channel, Program } from '../types';
import { getNowInParis } from '../utils/timeSlots';
import { getChannelLogo } from '../utils/channelLogos';
import { getChannelUrl } from '../utils/channelSlug';
import { getProgramUrl, getProgramSlugFromTitle } from '../utils/programSlug';
import { useSEO } from '../utils/seo';

interface SearchResult {
  type: 'program' | 'channel';
  program?: Program;
  channel?: Channel;
  matchType: 'title' | 'channel' | 'both';
}

interface SearchPageProps {
  searchQuery: string;
  channels: Channel[];
  onProgramClick: (channel: Channel, program: Program) => void;
  onChannelClick: (channel: Channel) => void;
  onBack: () => void;
}

export const SearchPage: React.FC<SearchPageProps> = ({
  searchQuery,
  channels,
  onProgramClick,
  onChannelClick,
  onBack
}) => {
  const now = useMemo(() => getNowInParis(), []);

  // Perform search
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      return [];
    }

    const normalizedQuery = searchQuery.toLowerCase().trim();
    const results: SearchResult[] = [];

    channels.forEach(channel => {
      // Search in channel name
      const channelMatch = channel.name.toLowerCase().includes(normalizedQuery);
      
      if (channelMatch) {
        results.push({
          type: 'channel',
          channel,
          matchType: 'channel'
        });
      }

      // Search in program titles
      channel.programs.forEach(program => {
        const titleMatch = program.title.toLowerCase().includes(normalizedQuery);
        
        if (titleMatch) {
          results.push({
            type: 'program',
            program,
            channel,
            matchType: channelMatch ? 'both' : 'title'
          });
        }
      });
    });

    // Sort results: programs first, then channels
    const nowTime = now.getTime();
    results.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'program' ? -1 : 1;
      }
      
      if (a.type === 'program' && b.type === 'program') {
        const aStart = new Date(a.program!.startTime).getTime();
        const aEnd = new Date(a.program!.endTime).getTime();
        const bStart = new Date(b.program!.startTime).getTime();
        const bEnd = new Date(b.program!.endTime).getTime();
        
        const aIsLive = nowTime >= aStart && nowTime <= aEnd;
        const bIsLive = nowTime >= bStart && nowTime <= bEnd;
        
        if (aIsLive !== bIsLive) {
          return aIsLive ? -1 : 1;
        }
        
        return aStart - bStart;
      }
      
      return 0;
    });

    return results;
  }, [searchQuery, channels, now]);

  const programResults = searchResults.filter(r => r.type === 'program');
  const channelResults = searchResults.filter(r => r.type === 'channel');

  const formatHour = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  // SEO - noindex for search pages
  useSEO({
    title: `Résultats de recherche : "${searchQuery}" | Programme Ce Soir`,
    description: `Résultats de recherche pour "${searchQuery}" sur Programme Ce Soir`,
    url: `/recherche?qs=${encodeURIComponent(searchQuery)}`,
    noindex: true,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 py-6">
        <div className="container mx-auto px-4">
          <button
            onClick={onBack}
            className="mb-4 text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour à l’accueil
          </button>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-2">
            Résultats de recherche : <span className="text-blue-600">"{searchQuery}"</span>
          </h1>
          <p className="text-slate-500">
            {searchResults.length === 0 
              ? 'Aucun résultat trouvé' 
              : `${searchResults.length} résultat${searchResults.length !== 1 ? 's' : ''}`
            }
          </p>
        </div>
      </div>

      {/* Results */}
      <div className="container mx-auto px-4 py-8">
        {/* Programs Section */}
        {programResults.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-black text-slate-900 mb-6">
              Programmes ({programResults.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {programResults.map((result, idx) => {
                if (!result.program || !result.channel) return null;
                
                const startDate = new Date(result.program.startTime);
                const endDate = new Date(result.program.endTime);
                const isLive = now.getTime() >= startDate.getTime() && now.getTime() <= endDate.getTime();
                
                return (
                  <button
                    key={`${result.channel.id}-${result.program.id}-${idx}`}
                    onClick={() => onProgramClick(result.channel!, result.program!)}
                    className="text-left p-4 bg-white rounded-2xl border-2 border-slate-300 hover:border-blue-400 shadow-md hover:shadow-lg transition-all group"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden">
                        <img 
                          src={getChannelLogo(result.channel.id, result.channel.logo, result.channel.name)} 
                          alt={result.channel.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-slate-900 text-base group-hover:text-blue-600 transition-colors line-clamp-2">
                            {result.program.title}
                          </h3>
                          {isLive && (
                            <span className="flex-shrink-0 px-2 py-1 bg-rose-500 text-white text-xs font-black rounded-full">
                              EN DIRECT
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-600">{result.channel.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <time className="font-semibold">
                        {formatHour(result.program.startTime)} - {formatHour(result.program.endTime)}
                      </time>
                      {result.program.category && (
                        <>
                          <span>•</span>
                          <span className="px-2 py-1 bg-slate-100 rounded-full">{result.program.category}</span>
                        </>
                      )}
                    </div>
                    {result.program.description && (
                      <p className="mt-3 text-sm text-slate-600 line-clamp-2">
                        {result.program.description}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Channels Section */}
        {channelResults.length > 0 && (
          <section>
            <h2 className="text-2xl font-black text-slate-900 mb-6">
              Chaînes ({channelResults.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {channelResults.map((result) => {
                if (!result.channel) return null;
                
                return (
                  <button
                    key={result.channel.id}
                    onClick={() => onChannelClick(result.channel!)}
                    className="p-4 bg-white rounded-2xl border-2 border-slate-300 hover:border-blue-400 shadow-md hover:shadow-lg transition-all group text-center"
                  >
                    <div className="w-20 h-20 mx-auto mb-3 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden">
                      <img 
                        src={getChannelLogo(result.channel.id, result.channel.logo, result.channel.name)} 
                        alt={result.channel.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {result.channel.name}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* No Results */}
        {searchResults.length === 0 && (
          <div className="text-center py-20">
            <svg className="w-24 h-24 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Aucun résultat trouvé</h2>
            <p className="text-slate-500 mb-6">
              Essayez d’autres mots-clés ou vérifiez l’orthographe
            </p>
            <button
              onClick={onBack}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
            >
              Retour à l’accueil
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
