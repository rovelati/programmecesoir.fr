
import React, { useState, useMemo, useEffect } from 'react';
import { Channel, Program } from '../types';
import { getNowInParis } from '../utils/timeSlots';
import { getRecommendedGenres, cleanAndSortRecommendations } from '../utils/recommendationRules';
import { useSEO } from '../utils/seo';
import { getChannelLogo } from '../utils/channelLogos';
import { getChannelNumberLabel } from '../utils/channelNumbers';

interface RecommenderProps {
  channels: Channel[];
  onProgramClick: (channel: Channel, program: Program) => void;
}

type TimeSlot = 'maintenant' | 'aujourdhui' | 'ce-soir';

export const Recommender: React.FC<RecommenderProps> = ({ channels, onProgramClick }) => {
  const [loading, setLoading] = useState(false);
  const [timeSlot, setTimeSlot] = useState<TimeSlot>('maintenant');
  const [profile, setProfile] = useState({
    gender: '',
    age: '',
    preference: ''
  });
  const [recommendation, setRecommendation] = useState<{
    channelId: string;
    programId: string;
    reason: string;
  } | null>(null);

  // SEO
  useSEO({
    title: 'Recommandés pour vous - Programme TNT personnalisé | Programme Ce Soir',
    description: 'Découvrez quoi regarder ce soir avec des recommandations personnalisées. Indiquez votre profil pour trouver le programme idéal.',
    url: '/recommandes',
  });

  const genres = ['Cinéma', 'Sport', 'Actualités', 'Documentaires', 'Séries', 'Réalité', 'Talk-show'];

  // Generate recommendation reasons based on profile
  const generateReason = (program: Program, gender: string, age: string, preference: string): string => {
    const reasons: string[] = [];
    
    // Age-based reasons
    const ageNum = parseInt(age.split('-')[0]) || parseInt(age.replace('+', '')) || 30;
    if (ageNum < 30) {
      reasons.push("Parfait pour un public jeune");
    } else if (ageNum >= 30 && ageNum < 50) {
      reasons.push("Idéal pour un divertissement de qualité");
    } else {
      reasons.push("Recommandé pour un public adulte");
    }
    
    // Gender-based reasons
    if (gender === 'Homme') {
      if (program.category?.toLowerCase().includes('sport')) {
        reasons.push("Un rendez-vous sport à ne pas manquer");
      } else if (program.category?.toLowerCase().includes('attualità') || program.category?.toLowerCase().includes('notizie')) {
        reasons.push("Restez informé des dernières actualités");
      }
    } else if (gender === 'Femme') {
      if (program.category?.toLowerCase().includes('reality') || program.category?.toLowerCase().includes('show')) {
        reasons.push("Divertissement parfait pour vous");
      } else if (program.category?.toLowerCase().includes('serie')) {
        reasons.push("Une série qui va vous passionner");
      }
    }
    
    // Preference-based reasons
    if (preference === 'Cinéma' || preference === 'Film') {
      if (program.category?.toLowerCase().includes('film') || program.category?.toLowerCase().includes('cinema')) {
        reasons.push("Un film fait pour vous");
      }
    } else if (preference === 'Sport') {
      if (program.category?.toLowerCase().includes('sport')) {
        reasons.push("Ne manquez pas cet événement sportif");
      }
    } else if (preference === 'Actualités') {
      if (program.category?.toLowerCase().includes('attualità') || program.category?.toLowerCase().includes('notizie')) {
        reasons.push("Restez informé avec ce programme");
      }
    } else if (preference === 'Séries') {
      if (program.category?.toLowerCase().includes('serie')) {
        reasons.push("Une série qui va vous captiver");
      }
    }
    
    // Fallback reasons
    if (reasons.length === 0) {
      reasons.push("Un programme susceptible de vous plaire");
      reasons.push("Recommandé selon votre profil");
    }
    
    return reasons[0] || "Un programme parfait pour vous";
  };

  const handleRecommend = () => {
    if (!profile.gender || !profile.age || !profile.preference) {
      alert("Merci de remplir tous les champs !");
      return;
    }

    setLoading(true);
    setRecommendation(null);

    try {
      const now = getNowInParis();
      const nowTime = now.getTime();
      
      // Calculate time range based on selected time slot
      let startTime: Date;
      let endTime: Date;
      
      if (timeSlot === 'maintenant') {
        // From now to 6 hours ahead
        startTime = now;
        endTime = new Date(nowTime + (6 * 60 * 60 * 1000));
      } else if (timeSlot === 'aujourdhui') {
        // From now to end of today (23:59:59)
        startTime = now;
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        endTime = endOfDay;
      } else if (timeSlot === 'ce-soir') {
        // From 18:00 today to 02:00 tomorrow
        startTime = new Date(now);
        startTime.setHours(18, 0, 0, 0);
        if (startTime.getTime() < nowTime) {
          startTime = now; // If it's already past 18:00, start from now
        }
        endTime = new Date(startTime);
        endTime.setDate(endTime.getDate() + 1);
        endTime.setHours(2, 0, 0, 0);
      } else {
        startTime = now;
        endTime = new Date(nowTime + (6 * 60 * 60 * 1000));
      }
      
      const startTimeMs = startTime.getTime();
      const endTimeMs = endTime.getTime();
      
      // Get all programs in the selected time range
      const availablePrograms: Array<Program & { channelId: string; channelName: string }> = [];
      
      channels.forEach(channel => {
        // Sort programs to ensure correct order
        const sortedPrograms = [...channel.programs].sort((a, b) => {
          return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        });
        
        // Find programs that overlap with the selected time range
        sortedPrograms.forEach(prog => {
          if (!prog.startTime || !prog.endTime) return;
          const progStart = new Date(prog.startTime).getTime();
          const progEnd = new Date(prog.endTime).getTime();
          if (isNaN(progStart) || isNaN(progEnd)) return;
          
          // Only include programs that overlap with the selected time range
          // A program overlaps if: start < rangeEnd AND end > rangeStart
          if (progStart < endTimeMs && progEnd > startTimeMs) {
            availablePrograms.push({
              ...prog,
              channelId: channel.id,
              channelName: channel.name
            });
          }
        });
      });

      console.log(`[Recommender] Range temporale (${timeSlot}):`, {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        now: now.toISOString()
      });
      console.log(`[Recommender] Programmes disponibles (${timeSlot}): ${availablePrograms.length}`);

      if (availablePrograms.length === 0) {
        alert(`Aucun programme disponible pour la plage "${timeSlot}". Essayez une autre plage horaire !`);
        setLoading(false);
        return;
      }

      // Parse age range (e.g., "20-30" -> 25, "60+" -> 65)
      const ageRange = profile.age;
      let ageNum = 30; // default
      if (ageRange.includes('-')) {
        const [min, max] = ageRange.split('-').map(Number);
        ageNum = Math.floor((min + max) / 2);
      } else if (ageRange.includes('+')) {
        ageNum = parseInt(ageRange.replace('+', '')) + 5;
      }

      // Get gender code (M/F)
      const genderCode = profile.gender === 'Homme' ? 'M' : 'F';

      // Get genre scores based on demographics
      const genreScores = getRecommendedGenres(ageNum, genderCode);
      
      // Boost score for selected preference - map to actual database genres
      if (profile.preference) {
        const preferenceMap: Record<string, string[]> = {
          'Cinema': ['Film', 'Cinema', 'Generico'],
          'Film': ['Film', 'Cinema', 'Generico'],
          'Sport': ['Sport', 'Generico'],
          'Attualità': ['Attualità', 'Notizie', 'Generico'],
          'Documentari': ['Documentario', 'Documentari', 'Generico'],
          'Serie TV': ['Serie TV', 'Generico'],
          'Reality': ['Reality', 'Generico'],
          'Talk Show': ['Show', 'Talk Show', 'Generico']
        };
        
        const matchingGenres = preferenceMap[profile.preference] || [profile.preference, 'Generico'];
        matchingGenres.forEach(genre => {
          genreScores[genre] = (genreScores[genre] || 0) + 10; // Strong boost
        });
      }
      
      // Also add base score for "Generico" genre (common fallback)
      genreScores['Generico'] = (genreScores['Generico'] || 0) + 1;

      console.log(`[Recommender] Genre scores:`, genreScores);

      // Score and rank programs
      const scoredPrograms = availablePrograms.map(prog => {
        const genre = (prog.category || prog.genre || '').trim();
        
        // Find matching score - try exact match first, then partial matches
        let baseScore = genreScores[genre] || 0;
        
        // If no exact match, try partial matching
        if (baseScore === 0) {
          for (const [key, value] of Object.entries(genreScores)) {
            if (genre.toLowerCase().includes(key.toLowerCase()) || 
                key.toLowerCase().includes(genre.toLowerCase())) {
              baseScore = value;
              break;
            }
          }
        }
        
        // Fallback: give a small score to ensure we have recommendations
        if (baseScore === 0) {
          baseScore = 1;
        }
        
        // Additional scoring factors
        let score = baseScore;
        
        // Boost for prime time (20:00-22:00)
        const startHour = new Date(prog.startTime).getHours();
        if (startHour >= 20 && startHour < 22) {
          score += 3;
        }
        
        // Boost if preference matches genre
        if (profile.preference) {
          const prefLower = profile.preference.toLowerCase();
          const genreLower = genre.toLowerCase();
          if (genreLower.includes(prefLower) || prefLower.includes(genreLower)) {
            score += 5;
          }
          
          // Special mappings
          if (prefLower.includes('cinema') || prefLower.includes('film')) {
            if (genreLower.includes('film') || genreLower.includes('cinema')) score += 8;
          }
          if (prefLower.includes('sport')) {
            if (genreLower.includes('sport')) score += 8;
          }
          if (prefLower.includes('actualités') || prefLower.includes('info')) {
            if (genreLower.includes('info') || genreLower.includes('information') || genreLower.includes('journal')) score += 8;
          }
          if (prefLower.includes('série') || prefLower.includes('series')) {
            if (genreLower.includes('série') || genreLower.includes('serie')) score += 8;
          }
        }
        
        return {
          ...prog,
          score,
          genre
        };
      });

      // Filter and sort
      const rankedPrograms = scoredPrograms
        .filter(p => p.score > 0)
        .sort((a, b) => b.score - a.score);

      console.log(`[Recommender] Programmi classificati: ${rankedPrograms.length}`);
      console.log(`[Recommender] Top 3:`, rankedPrograms.slice(0, 3).map(p => ({ 
        title: p.title, 
        channel: p.channelName, 
        score: p.score,
        genre: p.genre 
      })));

      if (rankedPrograms.length === 0) {
        alert("Aucun programme correspondant trouvé. Essayez de modifier vos préférences !");
        setLoading(false);
        return;
      }

      // Get top recommendation
      const topProgram = rankedPrograms[0];
      
      // Generate reason
      const reason = generateReason(topProgram, profile.gender, profile.age, profile.preference);

      setRecommendation({
        channelId: topProgram.channelId,
        programId: topProgram.id,
        reason: reason
      });

      console.log(`[Recommender] ✅ Recommandation générée : ${topProgram.title} sur ${topProgram.channelName}`);
    } catch (error) {
      console.error("Recommendation Error:", error);
      alert("Errore nella generazione del consiglio. Riprova tra poco.");
    } finally {
      setLoading(false);
    }
  };

  const recommendedChannel = channels.find(c => c.id === recommendation?.channelId);
  const recommendedProgram = recommendedChannel?.programs.find(p => p.id === recommendation?.programId);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    setLogoError(false);
  }, [recommendedChannel?.id, recommendedChannel?.logo, recommendedChannel?.name]);
  
  // Get logo with fallback
  const logoUrl = useMemo(() => {
    if (!recommendedChannel) return '';
    if (logoError) {
      return getChannelLogo(recommendedChannel.id, null, recommendedChannel.name);
    }
    return getChannelLogo(recommendedChannel.id, recommendedChannel.logo, recommendedChannel.name);
  }, [recommendedChannel?.id, recommendedChannel?.logo, recommendedChannel?.name, logoError]);

  return (
    <div className="animate-in fade-in duration-700">
      {/* Page Hero */}
      <section className="bg-gradient-to-br from-blue-700 to-indigo-900 py-16 text-white text-center">
        <div className="container mx-auto px-4">
          <span className="inline-block px-4 py-1 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-[0.3em] mb-4 backdrop-blur-sm">
            Conseils personnalisés
          </span>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-4">
            Recommandés pour vous
          </h1>
          <p className="text-blue-100 text-lg md:text-xl font-medium max-w-2xl mx-auto">
            Dites-moi qui vous êtes et je trouverai le programme parfait parmi les chaînes en direct.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 -mt-10 pb-20">
        <section className="bg-white rounded-[3rem] shadow-lg shadow-blue-900/10 border-2 border-slate-300 hover:shadow-xl transition-shadow overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Left: Form */}
            <div className="p-8 md:p-12 border-b lg:border-b-0 lg:border-r border-slate-100">
              <div className="mb-8">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
                  Votre profil
                </h2>
                <p className="text-slate-500 text-sm">Personnalisez la recherche pour des résultats plus précis.</p>
              </div>

              <div className="space-y-8">
                {/* Time Slot Selector */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 text-center">Fascia Oraria</label>
                  <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-2">
                    {(['maintenant', 'aujourdhui', 'ce-soir'] as TimeSlot[]).map(slot => (
                      <button
                        key={slot}
                        onClick={() => setTimeSlot(slot)}
                        className={`flex-1 py-3 text-sm font-black rounded-xl transition-all capitalize ${timeSlot === slot ? 'bg-white text-blue-600 shadow-xl' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        {slot === 'maintenant' ? 'Maintenant' : slot === 'aujourdhui' ? "Aujourd'hui" : 'Ce soir'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 text-center">Genre</label>
                    <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                      {['Homme', 'Femme'].map(g => (
                        <button
                          key={g}
                          onClick={() => setProfile({ ...profile, gender: g })}
                          className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${profile.gender === g ? 'bg-white text-blue-600 shadow-xl' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 text-center">Âge</label>
                    <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-2xl">
                      {['20-30', '30-40', '40-50', '50-60', '60+'].map(range => (
                        <button
                          key={range}
                          onClick={() => setProfile({ ...profile, age: range })}
                          className={`py-2 text-xs font-black rounded-xl transition-all ${profile.age === range ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          {range}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Genres préférés</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {genres.map(g => (
                      <button
                        key={g}
                        onClick={() => setProfile({ ...profile, preference: g })}
                        className={`px-4 py-3 rounded-2xl text-xs font-black transition-all border-2 ${profile.preference === g ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white border-slate-100 text-slate-500 hover:border-blue-200'}`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleRecommend}
                  disabled={loading}
                  className={`w-full py-5 rounded-3xl font-black text-lg text-white shadow-2xl transition-all flex items-center justify-center gap-4 ${loading ? 'bg-slate-300' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-400'}`}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Analyse de la grille...
                    </>
                  ) : (
                    <>
                      Générer une recommandation
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right: Result */}
            <div className="bg-slate-50 p-8 md:p-12 flex flex-col justify-center items-center relative min-h-[500px]">
              {!recommendation && !loading && (
                <div className="text-center max-w-xs animate-in fade-in zoom-in-95">
                  <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
                    <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-black text-slate-800 mb-2">Conseils personnalisés</h3>
                  <p className="text-slate-500 font-medium leading-relaxed">
                    Complétez le profil à gauche pour découvrir quoi regarder maintenant.
                  </p>
                </div>
              )}

              {loading && (
                <div className="text-center animate-pulse">
                  <div className="w-20 h-20 bg-blue-200 rounded-3xl mx-auto mb-6 rotate-12"></div>
                  <div className="h-4 bg-slate-200 rounded-full w-48 mx-auto mb-4"></div>
                  <div className="h-4 bg-slate-200 rounded-full w-32 mx-auto"></div>
                </div>
              )}

              {recommendation && recommendedChannel && recommendedProgram && (
                <div className="w-full max-w-sm animate-in zoom-in-95 duration-500">
                  <div className="text-center mb-8">
                    <span className="text-blue-600 font-black text-xs uppercase tracking-[0.4em] block mb-2">Correspondance parfaite</span>
                    <h3 className="text-2xl font-black text-slate-900">À regarder maintenant :</h3>
                  </div>

                  <article
                    onClick={() => onProgramClick(recommendedChannel, recommendedProgram)}
                    className="bg-white p-8 rounded-[2.5rem] shadow-lg border-2 border-blue-600 hover:border-blue-700 cursor-pointer hover:scale-105 hover:shadow-xl transition-all group relative"
                  >
                    {/* Channel badge */}
                    <div className="absolute -top-6 -right-6 w-16 h-16 bg-white rounded-3xl shadow-xl p-3 flex items-center justify-center border border-slate-100">
                        <img 
                          src={logoUrl} 
                          className="w-full h-full object-contain max-w-full max-h-full" 
                          alt={recommendedChannel.name}
                          onError={() => {
                            if (!logoError) {
                              console.warn(`[Recommender] Logo failed to load for ${recommendedChannel.name}, using fallback`);
                              setLogoError(true);
                            }
                          }}
                        />
                    </div>

                    <div className="mb-6">
                      <p className="text-xs font-black text-blue-600 uppercase tracking-widest mb-1">{recommendedChannel.name} • Chaîne {getChannelNumberLabel(recommendedChannel.number)}</p>
                      <h4 className="text-3xl font-black text-slate-900 leading-tight group-hover:text-blue-600 transition-colors">
                        {recommendedProgram.title}
                      </h4>
                    </div>

                    <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100">
                      <p className="text-slate-700 font-bold leading-relaxed italic text-lg">
                        "{recommendation.reason}"
                      </p>
                    </div>

                    <div className="mt-8 flex items-center justify-center gap-2 text-blue-600 font-black text-sm uppercase tracking-widest">
                      Voir la fiche complète
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </div>
                  </article>

                  <p className="text-center mt-10 text-slate-400 text-[10px] font-bold uppercase tracking-[0.3em]">
                    Rendez-vous maintenant sur la chaîne {getChannelNumberLabel(recommendedChannel.number)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
