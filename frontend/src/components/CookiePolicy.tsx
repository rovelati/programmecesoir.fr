import React from 'react';
import { useSEO } from '../utils/seo';

interface CookiePolicyProps {
  onBack: () => void;
}

export const CookiePolicy: React.FC<CookiePolicyProps> = ({ onBack }) => {
  useSEO({
    title: 'Politique cookies | programmecesoir.fr',
    description: 'Informations sur les cookies de programmecesoir.fr. Découvrez comment nous utilisons les cookies pour améliorer votre expérience.',
    url: '/politique-cookies',
    noindex: false,
  });

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
              Retour à l’accueil
            </button>
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-4">Politique cookies</h1>
            <p className="text-slate-600 text-lg">Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>

          {/* Content */}
          <div className="bg-white rounded-2xl shadow-lg border-2 border-slate-200 p-8 md:p-12 space-y-8">
            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">1. Que sont les cookies</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                Les cookies sont de petits fichiers texte stockés sur votre appareil (ordinateur, tablette, smartphone) lorsque vous visitez un site web.
                Ils permettent au site de mémoriser vos actions et préférences pendant une période donnée, afin de faciliter votre navigation.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">2. Comment nous utilisons les cookies</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                programmecesoir.fr utilise des cookies pour améliorer votre expérience et vous proposer des contenus et services personnalisés.
                Nous utilisons des cookies pour :
              </p>
              <ul className="list-disc list-inside text-slate-700 space-y-2 ml-4">
                <li>Assurer le bon fonctionnement du site</li>
                <li>Analyser l’utilisation du site via Google Analytics</li>
                <li>Améliorer les performances et l’ergonomie</li>
                <li>Personnaliser votre expérience de navigation</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">3. Types de cookies utilisés</h2>

              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Cookies techniques (nécessaires)</h3>
                <p className="text-slate-700 leading-relaxed mb-2">
                  Ces cookies sont essentiels au fonctionnement du site et ne peuvent pas être désactivés.
                  Ils permettent des fonctionnalités de base telles que la navigation entre les pages.
                </p>
              </div>

              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Cookies analytiques</h3>
                <p className="text-slate-700 leading-relaxed mb-2">
                  Nous utilisons Google Analytics 4 pour collecter des informations anonymes sur la façon dont les utilisateurs utilisent le site.
                  Ces données nous aident à améliorer le site et à comprendre les préférences des utilisateurs.
                  Vous pouvez désactiver ces cookies via les paramètres du navigateur ou les outils d’opt-out de Google.
                </p>
                <p className="text-slate-600 text-sm mt-2">
                  Pour en savoir plus : <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Politique de confidentialité Google</a>
                </p>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Cookies de préférences</h3>
                <p className="text-slate-700 leading-relaxed mb-2">
                  Ces cookies permettent au site de mémoriser vos préférences (langue, région) afin de proposer des fonctionnalités améliorées.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">4. Gestion des cookies</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                Vous pouvez gérer ou supprimer les cookies à tout moment via les paramètres de votre navigateur.
                La désactivation des cookies peut toutefois limiter certaines fonctionnalités du site.
              </p>
              <p className="text-slate-700 leading-relaxed mb-4">
                Pour désactiver les cookies Google Analytics, vous pouvez utiliser le module complémentaire disponible sur :{' '}
                <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Google Analytics Opt-out Browser Add-on
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">5. Cookies de tiers</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                Certains cookies peuvent être déposés par des services tiers présents sur nos pages.
                Nous n’avons pas de contrôle direct sur ces cookies. Nous vous invitons à consulter leurs politiques :
              </p>
              <ul className="list-disc list-inside text-slate-700 space-y-2 ml-4">
                <li>
                  <strong>Google Analytics :</strong>{' '}
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    Politique de confidentialité Google
                  </a>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">6. Durée des cookies</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                Les cookies utilisés par programmecesoir.fr ont des durées différentes :
              </p>
              <ul className="list-disc list-inside text-slate-700 space-y-2 ml-4">
                <li><strong>Cookies de session :</strong> supprimés lorsque vous fermez le navigateur</li>
                <li><strong>Cookies persistants :</strong> conservés pendant une durée déterminée ou jusqu’à suppression manuelle</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">7. Contact</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                Pour toute question relative aux cookies sur programmecesoir.fr, vous pouvez nous écrire à :{' '}
                <a href="mailto:bruno@programmecesoir.fr" className="text-blue-600 font-semibold hover:underline">
                  bruno@programmecesoir.fr
                </a>
              </p>
            </section>

            <section className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <p className="text-sm text-slate-600 leading-relaxed">
                <strong>Note :</strong> cette politique peut être mise à jour périodiquement. Nous vous invitons à consulter cette page régulièrement.
                La date de la dernière mise à jour est indiquée en haut du document.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
