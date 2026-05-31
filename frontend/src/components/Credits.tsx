import React, { useEffect } from 'react';
import { useSEO } from '../utils/seo';
import { SITE_PROFILES } from '../data/siteProfiles';
import { LEGAL_CONTACT } from '../data/legalContact';
import { buildWebSiteJsonLd } from '../utils/jsonld';

interface CreditsProps {
  onBack: () => void;
}

export const Credits: React.FC<CreditsProps> = ({ onBack }) => {
  useSEO({
    title: 'Crédits | Programme Ce Soir',
    description: 'Profils et références officiels de Programme Ce Soir, guide TV TNT français.',
    url: '/credits',
    noindex: false,
  });

  useEffect(() => {
    const oldScripts = document.querySelectorAll('script[data-seo="credits"]');
    oldScripts.forEach((script) => script.remove());

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo', 'credits');
    script.textContent = buildWebSiteJsonLd();
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-12">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 text-slate-600 hover:text-blue-600 font-semibold mb-8 transition-colors group"
            >
              <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Retour à l'accueil
            </button>
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-4">Crédits</h1>
            <p className="text-slate-600 text-lg">
              Profils et références de Programme Ce Soir visibles avant hydration. Cette page regroupe les profils d’autorité,
              les propriétés du réseau et les informations de contact du site.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border-2 border-slate-200 p-8 md:p-12 space-y-10">
            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Profils d’autorité</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                Ces profils aident à rattacher Programme Ce Soir à ses références publiques et à son identité éditoriale.
              </p>
              <ul className="space-y-4">
                {SITE_PROFILES.map((profile) => (
                  <li key={profile.url}>
                    <a
                      href={profile.url}
                      target="_blank"
                      rel={profile.rel}
                      className="text-blue-600 font-bold hover:underline"
                    >
                      {profile.label}
                    </a>
                    <p className="text-slate-600 text-sm mt-1 break-all">{profile.url}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Sites du réseau</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                Programme Ce Soir fait partie d’un réseau international de sites dédiés aux programmes TV.
              </p>
              <ul className="space-y-4">
                <li>
                  <a
                    href="https://123programmitv.it"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 font-bold hover:underline"
                  >
                    123programmitv.it
                  </a>
                  <p className="text-slate-600 text-sm mt-1">
                    Guide TV complet pour les programmes télévisuels italiens. Découvrez tous les programmes diffusés aujourd'hui et ce soir sur les chaînes italiennes.
                  </p>
                </li>
                <li>
                  <a
                    href="https://fernsehheute.de"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 font-bold hover:underline"
                  >
                    fernsehheute.de
                  </a>
                  <p className="text-slate-600 text-sm mt-1">
                    Guide TV complet pour les programmes télévisuels allemands. Découvrez tous les programmes diffusés aujourd'hui et ce soir sur les chaînes allemandes.
                  </p>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Éditeur, mentions et contact</h2>
              <p className="text-slate-700 leading-relaxed">
                Les données des grilles télévisuelles sont mises à jour quotidiennement à partir de sources publiques et d'API spécialisées.
                Nous nous engageons à fournir des informations exactes et à jour sur les programmes TV français.
              </p>
              <div className="mt-6 space-y-3 text-slate-700">
                <p>
                  Éditeur du site : <span className="font-semibold">{LEGAL_CONTACT.siteName}</span>
                </p>
                <p>
                  Responsable de publication : <span className="font-semibold">{LEGAL_CONTACT.adminName}</span>
                </p>
                <p>
                  Adresse :{' '}
                  <span className="font-semibold">
                    {LEGAL_CONTACT.addressLine1}, {LEGAL_CONTACT.addressLine2}
                  </span>
                </p>
                <p>
                  Site web :{' '}
                  <a
                    href={LEGAL_CONTACT.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 font-semibold hover:underline"
                  >
                    {LEGAL_CONTACT.website}
                  </a>
                </p>
                <p>
                  Contact :{' '}
                  <a href={`mailto:${LEGAL_CONTACT.email}`} className="text-blue-600 font-semibold hover:underline">
                    {LEGAL_CONTACT.email}
                  </a>
                </p>
                <p>
                  LinkedIn :{' '}
                  <a
                    href={LEGAL_CONTACT.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 font-semibold hover:underline"
                  >
                    {LEGAL_CONTACT.adminName}
                  </a>
                </p>
                <p>
                  Bluesky :{' '}
                  <a
                    href={LEGAL_CONTACT.blueskyUrl}
                    target="_blank"
                    rel="me noopener"
                    className="text-blue-600 font-semibold hover:underline"
                  >
                    @programmecesoir.bsky.social
                  </a>
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
