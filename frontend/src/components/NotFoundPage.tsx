import React, { useEffect, useState } from 'react';
import { useSEO } from '../utils/seo';

interface NotFoundPageProps {
  type: 'program' | 'channel' | 'entity';
  onBack: () => void;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ type, onBack }) => {
  const [countdown, setCountdown] = useState(5);

  // Set noindex and 410 status
  useSEO({
    title: `${type === 'program' ? 'Programme' : type === 'channel' ? 'Chaîne' : 'Fiche'} introuvable | programmecesoir.fr`,
    description: `Le ${type === 'program' ? 'programme' : type === 'channel' ? 'chaîne' : 'contenu'} demandé n’est plus disponible ou n’existe pas.`,
    url: window.location.pathname,
    noindex: true,
  });

  useEffect(() => {
    // Set HTTP status to 410 (Gone)
    const metaStatus = document.createElement('meta');
    metaStatus.httpEquiv = 'status';
    metaStatus.content = '410 Gone';
    document.head.appendChild(metaStatus);

    // Countdown and redirect
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onBack();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      metaStatus.remove();
    };
  }, [onBack]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        <div className="bg-white rounded-3xl shadow-xl border-2 border-slate-300 p-8 md:p-12">
          {/* 410 Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-full text-sm font-bold mb-6">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Erreur 410
          </div>

          <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-4">
            {type === 'program' ? 'Programme introuvable' : type === 'channel' ? 'Chaîne introuvable' : 'Fiche introuvable'}
          </h1>
          
          <p className="text-lg text-slate-600 mb-8 leading-relaxed">
            {type === 'program' 
              ? 'Le programme que vous recherchez n’est plus disponible ou n’existe pas dans notre base.'
              : type === 'channel'
                ? 'La chaîne que vous recherchez n’est plus disponible ou n’existe pas dans notre base.'
                : 'La fiche que vous recherchez n’est plus disponible ou n’existe pas dans notre catalogue statique.'
            }
          </p>

          <div className="bg-slate-50 rounded-2xl p-6 mb-8 border-2 border-slate-200">
            <p className="text-slate-500 text-sm mb-2">Redirection automatique vers l’accueil dans :</p>
            <div className="text-4xl font-black text-blue-600 mb-2">{countdown}</div>
            <p className="text-xs text-slate-400">secondes</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onBack}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-colors shadow-lg"
            >
              Aller à l’accueil
            </button>
            <button
              onClick={() => window.history.back()}
              className="px-8 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-colors"
            >
              Retour
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
