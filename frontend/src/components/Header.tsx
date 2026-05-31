
import React, { useState, useEffect, useRef } from 'react';
import { Logo } from './Logo';
import { TimeView, Channel, Program } from '../types';
import { SearchResults } from './SearchResults';
import { trackSearch } from '../utils/analytics';

interface SearchResult {
  type: 'program' | 'channel';
  program?: Program;
  channel?: Channel;
  matchType: 'title' | 'channel' | 'both';
}

interface HeaderProps {
  activeView: TimeView | 'recommender' | 'news';
  onViewChange: (view: TimeView) => void;
  onNavigateRecommender: () => void;
  onNavigateNews: () => void;
  onNavigateHome: () => void;
  isProgramPage?: boolean;
  showFavoriteButton?: boolean;
  channels?: Channel[];
  onProgramClick?: (channel: Channel, program: Program) => void;
  onChannelClick?: (channel: Channel) => void;
  currentProgram?: Program;
  currentChannel?: Channel;
  onSaveReminder?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  activeView, 
  onViewChange, 
  onNavigateRecommender, 
  onNavigateNews,
  onNavigateHome, 
  isProgramPage = false, 
  showFavoriteButton = false,
  channels = [],
  onProgramClick,
  onChannelClick,
  currentProgram,
  currentChannel,
  onSaveReminder
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [showExploreMenu, setShowExploreMenu] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const exploreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
      if (exploreRef.current && !exploreRef.current.contains(event.target as Node)) {
        setShowExploreMenu(false);
      }
    };

    if (showResults || showExploreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showResults, showExploreMenu]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Search logic - returns all results and preview
  const performSearch = (query: string): { preview: SearchResult[]; total: number } => {
    if (!query.trim() || query.length < 2) {
      return { preview: [], total: 0 };
    }

    const normalizedQuery = query.toLowerCase().trim();
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
    // Within programs, prioritize exact matches and live programs
    const now = new Date();
    results.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'program' ? -1 : 1;
      }
      
      if (a.type === 'program' && b.type === 'program') {
        const aStart = new Date(a.program!.startTime).getTime();
        const aEnd = new Date(a.program!.endTime).getTime();
        const bStart = new Date(b.program!.startTime).getTime();
        const bEnd = new Date(b.program!.endTime).getTime();
        const nowTime = now.getTime();
        
        const aIsLive = nowTime >= aStart && nowTime <= aEnd;
        const bIsLive = nowTime >= bStart && nowTime <= bEnd;
        
        if (aIsLive !== bIsLive) {
          return aIsLive ? -1 : 1;
        }
        
        // Sort by start time (upcoming first)
        return aStart - bStart;
      }
      
      return 0;
    });

    return {
      preview: results.slice(0, 6),
      total: results.length
    };
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim().length >= 2) {
      e.preventDefault();
      const searchUrl = `/recherche?qs=${encodeURIComponent(searchQuery.trim())}`;
      window.history.pushState({}, '', searchUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
      setShowResults(false);
    }
  };

  const handleViewAll = () => {
    const searchUrl = `/recherche?qs=${encodeURIComponent(searchQuery.trim())}`;
    window.history.pushState({}, '', searchUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setShowResults(false);
  };

  // Track search with debounce
  useEffect(() => {
    if (searchQuery.length >= 3) {
      const timeoutId = setTimeout(() => {
        trackSearch(searchQuery);
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [searchQuery]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    const { preview, total } = performSearch(query);
    setSearchResults(preview);
    setTotalResults(total);
    setShowResults(preview.length > 0);
  };

  const handleSearchFocus = () => {
    if (searchResults.length > 0) {
      setShowResults(true);
    }
  };

  const handleProgramClick = (channel: Channel, program: Program) => {
    if (onProgramClick) {
      onProgramClick(channel, program);
    }
    setSearchQuery('');
    setShowResults(false);
  };

  const handleChannelClick = (channel: Channel) => {
    if (onChannelClick) {
      onChannelClick(channel);
    }
    setSearchQuery('');
    setShowResults(false);
  };

  const handleInternalNavigate = (
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
    action: () => void,
  ) => {
    event.preventDefault();
    action();
    if (typeof window !== 'undefined' && window.location.pathname !== href) {
      window.history.pushState({}, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const primaryNavLinks = [
    { href: '/en-direct', label: 'En direct', active: activeView === 'now', action: () => onViewChange('now') },
    { href: '/', label: 'Ce soir', active: activeView === 'tonight', action: () => onViewChange('tonight') },
    { href: '/demain', label: 'Demain', active: activeView === 'tomorrow', action: () => onViewChange('tomorrow') },
    { href: '/recommandes', label: 'Pour vous', active: activeView === 'recommender', action: onNavigateRecommender },
  ];

  const exploreHeadLinks = [
    { href: '/film-ce-soir', title: 'Films ce soir', detail: 'Le hub cinéma du prime time.' },
    { href: '/sport-ce-soir', title: 'Sport ce soir', detail: 'Les événements TV à forte demande.' },
    { href: '/series-ce-soir', title: 'Séries ce soir', detail: 'Les principales diffusions séries.' },
    { href: '/actualites', title: 'Actualités TV', detail: 'Anniversaire du jour et publication éditoriale.' },
  ];

  const exploreChannelLinks = [
    { href: '/tf1', title: 'TF1' },
    { href: '/france-2', title: 'France 2' },
    { href: '/france-3', title: 'France 3' },
    { href: '/m6', title: 'M6' },
    { href: '/arte', title: 'ARTE' },
    { href: '/canal-plus', title: 'Canal+' },
  ];

  return (
    <>
      <header className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        isScrolled ? 'bg-white/95 backdrop-blur-md shadow-md py-3' : 'bg-white py-5'
      }`}>
        <div className="container mx-auto px-4 flex items-center justify-between">
          <div 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onNavigateHome();
            }} 
            className="flex items-center gap-3 cursor-pointer"
          >
            <Logo />
          </div>
          
          <nav className="hidden md:flex items-center gap-6">
            {primaryNavLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(event) => handleInternalNavigate(event, link.href, link.action)}
                className={`pb-1 font-semibold transition-all border-b-2 ${
                  link.active
                    ? 'text-blue-600 border-blue-600'
                    : 'text-slate-500 border-transparent hover:text-slate-800'
                }`}
              >
                {link.label}
              </a>
            ))}
            <div ref={exploreRef} className="relative hidden lg:block">
              <button
                onClick={() => setShowExploreMenu((current) => !current)}
                className={`inline-flex items-center gap-2 pb-1 font-semibold transition-all border-b-2 ${
                  activeView === 'news'
                    ? 'text-blue-600 border-blue-600'
                    : 'text-slate-500 border-transparent hover:text-slate-800'
                }`}
              >
                Explorer
                <svg className={`h-4 w-4 transition-transform ${showExploreMenu ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 011.08 1.04l-4.25 4.51a.75.75 0 01-1.08 0l-4.25-4.51a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>
              {showExploreMenu ? (
                <div className="absolute right-0 top-full z-50 mt-3 w-72 overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 shadow-2xl">
                  <div className="space-y-3">
                    <div className="rounded-2xl bg-slate-50 p-2">
                      <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Pages head</p>
                      {exploreHeadLinks.map((link) => (
                        <a
                          key={link.href}
                          href={link.href}
                          onClick={() => setShowExploreMenu(false)}
                          className="flex rounded-2xl px-4 py-3 transition-colors hover:bg-white"
                        >
                          <span>
                            <span className="block text-sm font-black text-slate-900">{link.title}</span>
                            <span className="block text-xs leading-5 text-slate-500">{link.detail}</span>
                          </span>
                        </a>
                      ))}
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-2">
                      <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Chaînes prioritaires</p>
                      <div className="grid grid-cols-2 gap-1">
                        {exploreChannelLinks.map((link) => (
                          <a
                            key={link.href}
                            href={link.href}
                            onClick={() => setShowExploreMenu(false)}
                            className="rounded-2xl px-4 py-3 text-sm font-black text-slate-900 transition-colors hover:bg-white"
                          >
                            {link.title}
                          </a>
                        ))}
                      </div>
                    </div>
                    <a href="/films" className="flex rounded-2xl px-4 py-3 transition-colors hover:bg-slate-50">
                      <span>
                        <span className="block text-sm font-black text-slate-900">Films</span>
                        <span className="block text-xs leading-5 text-slate-500">Le catalogue film et les diffusions associées.</span>
                      </span>
                    </a>
                    <a href="/series" className="flex rounded-2xl px-4 py-3 transition-colors hover:bg-slate-50">
                      <span>
                        <span className="block text-sm font-black text-slate-900">Séries</span>
                        <span className="block text-xs leading-5 text-slate-500">Fiches séries et prochaines diffusions.</span>
                      </span>
                    </a>
                    <a href="/acteurs" className="flex rounded-2xl px-4 py-3 transition-colors hover:bg-slate-50">
                      <span>
                        <span className="block text-sm font-black text-slate-900">Acteurs</span>
                        <span className="block text-xs leading-5 text-slate-500">Acteurs à la TV et pages entités.</span>
                      </span>
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          </nav>

          <div className="flex items-center gap-4">
            <div ref={searchRef} className="relative hidden lg:block w-64">
              <input 
                type="text" 
                placeholder="Rechercher un programme ou une chaîne..." 
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={handleSearchFocus}
                onKeyDown={handleSearchKeyDown}
                className="w-full pl-10 pr-4 py-2 rounded-full bg-slate-100 border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-100 transition-all text-sm outline-none"
              />
              <svg className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {showResults && (
                <SearchResults
                  results={searchResults}
                  onProgramClick={handleProgramClick}
                  onChannelClick={handleChannelClick}
                  onClose={() => {
                    setShowResults(false);
                    setSearchQuery('');
                  }}
                  searchQuery={searchQuery}
                  totalResults={totalResults}
                  onViewAll={totalResults > searchResults.length ? handleViewAll : undefined}
                />
              )}
            </div>
            <div className="md:hidden flex items-center rounded-full bg-slate-100 p-1 shadow-inner">
              <button
                onClick={() => onViewChange('now')}
                aria-pressed={activeView === 'now'}
                className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded-full transition-all ${
                  activeView === 'now'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Direct
              </button>
              <button
                onClick={() => onViewChange('tonight')}
                aria-pressed={activeView === 'tonight'}
                className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded-full transition-all ${
                  activeView === 'tonight'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ce soir
              </button>
              <button
                onClick={() => onViewChange('tomorrow')}
                aria-pressed={activeView === 'tomorrow'}
                className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded-full transition-all ${
                  activeView === 'tomorrow'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Demain
              </button>
            </div>
          </div>
        </div>
      </header>
      
      {/* Reminder button or Scroll to top button overlay - bottom right - MOBILE ONLY */}
      {isProgramPage && (
        <div className="fixed bottom-6 right-6 z-40 md:hidden">
          {showFavoriteButton ? (
            /* Reminder button - shown when description is visible */
            <div className="relative group">
              <button 
                onClick={onSaveReminder}
                className="p-4 bg-blue-600 text-white hover:bg-blue-700 transition-colors rounded-full shadow-xl shadow-blue-600/50 border-2 border-blue-500 hover:border-blue-400 transition-all active:scale-95"
                aria-label="Ajouter un rappel"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              {/* Tooltip */}
              <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                Promemoria
                <div className="absolute left-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-l-4 border-transparent border-l-slate-900"></div>
              </div>
            </div>
          ) : (
            /* Scroll to top button - shown when description is not visible */
            <div className="relative group">
              <button 
                onClick={scrollToTop}
                className="p-3 bg-white text-slate-600 hover:text-blue-600 transition-colors rounded-full hover:bg-blue-50 shadow-lg hover:shadow-xl border-2 border-slate-200 hover:border-blue-300 transition-all"
                aria-label="Torna su"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </button>
              {/* Tooltip */}
              <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                Torna su
                <div className="absolute left-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-l-4 border-transparent border-l-slate-900"></div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
