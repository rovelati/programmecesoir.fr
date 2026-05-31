
import React from 'react';
import { Logo } from './Logo';
import { LEGAL_CONTACT } from '../data/legalContact';

interface FooterProps {
  onNavigateHome: () => void;
  lastUpdate?: string | null;
  showLastUpdate?: boolean;
}

const HEAD_SEO_LINKS = [
  { href: '/en-direct', label: 'Programme en direct' },
  { href: '/film-ce-soir', label: 'Films ce soir' },
  { href: '/sport-ce-soir', label: 'Sport ce soir' },
  { href: '/demain', label: 'Programme TV demain' },
  { href: '/', label: 'Programme TV ce soir' },
  { href: '/series-ce-soir', label: 'Séries ce soir' },
  { href: '/documentaires-ce-soir', label: 'Documentaires ce soir' },
  { href: '/infos-ce-soir', label: 'Info ce soir' },
];

const HEAD_CHANNEL_LINKS = [
  { href: '/tf1', label: 'Programme TF1 ce soir' },
  { href: '/france-2', label: 'Programme France 2 ce soir' },
  { href: '/france-3', label: 'Programme France 3 ce soir' },
  { href: '/m6', label: 'Programme M6 ce soir' },
  { href: '/arte', label: 'Programme ARTE ce soir' },
  { href: '/tmc', label: 'Programme TMC ce soir' },
];

const MadeInFranceBadge: React.FC = () => {
  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-950/40 px-3 py-1">
      <span className="flex h-3.5 w-6 overflow-hidden rounded-[3px] border border-slate-700/70">
        <span className="w-1/3 bg-blue-600"></span>
        <span className="w-1/3 bg-white"></span>
        <span className="w-1/3 bg-red-500"></span>
      </span>
      <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-200">
        Made in France
      </span>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M12 20.6C11.6 20.6 11.2 20.45 10.9 20.15L4.65 13.9C2.8 12.05 2.8 9.05 4.65 7.2C6.45 5.4 9.35 5.35 11.2 7.05L12 7.8L12.8 7.05C14.65 5.35 17.55 5.4 19.35 7.2C21.2 9.05 21.2 12.05 19.35 13.9L13.1 20.15C12.8 20.45 12.4 20.6 12 20.6Z"
          className="fill-red-400"
        />
      </svg>
    </div>
  );
};

export const Footer: React.FC<FooterProps> = ({ onNavigateHome, lastUpdate, showLastUpdate = false }) => {
  const navigateDocument = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault();
    window.location.assign(href);
  };

  const formattedLastUpdate = (() => {
    if (!lastUpdate) return null;
    const isDateTime = lastUpdate.includes('T');
    const parsed = new Date(isDateTime ? lastUpdate : `${lastUpdate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    return isDateTime
      ? parsed.toLocaleString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Europe/Paris'
        })
      : parsed.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Europe/Paris'
        });
  })();

  return (
    <footer className="bg-slate-900 text-slate-400 py-16 border-t border-slate-800">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* Brand & Info */}
          <div className="space-y-6">
            <div onClick={onNavigateHome} className="cursor-pointer inline-block">
              <Logo />
            </div>
            <p className="text-sm leading-relaxed max-w-xs">
              Votre guide TNT pour suivre les programmes en direct, ce soir et demain.
            </p>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Statut du service : en ligne</span>
            </div>
            {showLastUpdate && (
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Mise à jour : {formattedLastUpdate || 'indisponible'}
              </div>
            )}
          </div>

          {/* Legal & Links */}
          <div className="space-y-6">
            <h4 className="text-white font-black text-xs uppercase tracking-[0.3em]">Légal</h4>
            <ul className="space-y-3 text-sm font-medium">
              <li>
                <a href="/conditions-generales" onClick={(e) => navigateDocument(e, '/conditions-generales')} className="hover:text-blue-400 transition-colors">Conditions générales</a>
              </li>
              <li>
                <a href="/politique-cookies" onClick={(e) => navigateDocument(e, '/politique-cookies')} className="hover:text-blue-400 transition-colors">Politique cookies</a>
              </li>
              <li>
                <a href="/credits" onClick={(e) => navigateDocument(e, '/credits')} className="hover:text-blue-400 transition-colors">Crédits</a>
              </li>
              <li>
                <a href={`mailto:${LEGAL_CONTACT.email}`} className="text-blue-400 font-bold hover:underline">
                  {LEGAL_CONTACT.email}
                </a>
              </li>
              <li className="text-slate-500">
                {LEGAL_CONTACT.addressLine1}, {LEGAL_CONTACT.addressLine2}
              </li>
              <li>
                <a
                  href={LEGAL_CONTACT.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-400 transition-colors"
                >
                  LinkedIn
                </a>
              </li>
              <li>
                <a
                  href={LEGAL_CONTACT.blueskyUrl}
                  target="_blank"
                  rel="me noopener"
                  className="hover:text-blue-400 transition-colors"
                >
                  Bluesky / @programmecesoir.bsky.social
                </a>
              </li>
              <li>
                <a 
                  href="https://www.trustpilot.com/review/programmecesoir.fr" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-blue-400 transition-colors"
                >
                  Recensez-nous sur Trustpilot
                </a>
              </li>
              <li>
                <button 
                  onClick={() => {
                    if (typeof window !== 'undefined' && (window as any).__unicapi) {
                      (window as any).__unicapi('openunic');
                    }
                  }}
                  className="hover:text-blue-400 transition-colors text-left"
                >
                  Paramètres de consentement
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-6">
            <h4 className="text-white font-black text-xs uppercase tracking-[0.3em]">Explorer</h4>
            <div className="space-y-5">
              <div>
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Pages head prioritaires</p>
                <ul className="space-y-3 text-sm font-medium">
                  <li>
                    <a href="/actualites" onClick={(e) => navigateDocument(e, '/actualites')} className="hover:text-blue-400 transition-colors">Actualités TV</a>
                  </li>
                  {HEAD_SEO_LINKS.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        onClick={(e) => navigateDocument(e, link.href)}
                        className="hover:text-blue-400 transition-colors"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Chaînes prioritaires</p>
                <ul className="space-y-3 text-sm font-medium">
                  {HEAD_CHANNEL_LINKS.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        onClick={(e) => navigateDocument(e, link.href)}
                        className="hover:text-blue-400 transition-colors"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                  <li>
                    <a href="/acteurs" onClick={(e) => navigateDocument(e, '/acteurs')} className="hover:text-blue-400 transition-colors">Acteurs à la TV</a>
                  </li>
                  <li>
                    <a href="/anniversaire-du-jour" onClick={(e) => navigateDocument(e, '/anniversaire-du-jour')} className="hover:text-blue-400 transition-colors">Anniversaire du jour</a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="space-y-6">
            <h4 className="text-white font-black text-xs uppercase tracking-[0.3em]">Avertissement</h4>
              <p className="text-[11px] leading-relaxed text-slate-500 font-medium">
                Les informations présentes sur ce site sont fournies à titre informatif.
              Programme Ce Soir s’efforce de maintenir les grilles à jour, sans toutefois être responsable
              des changements de dernière minute ou des erreurs liées aux décisions des chaînes.
              Tous les logos et marques appartiennent à leurs propriétaires respectifs.
            </p>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-[10px] uppercase tracking-widest font-bold">
            &copy; {new Date().getFullYear()} programmecesoir.fr
          </div>
          <div className="flex items-center gap-6">
            <MadeInFranceBadge />
          </div>
        </div>
      </div>
    </footer>
  );
};
