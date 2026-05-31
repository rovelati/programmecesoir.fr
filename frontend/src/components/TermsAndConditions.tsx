import React from 'react';
import { useSEO } from '../utils/seo';
import { LEGAL_CONTACT } from '../data/legalContact';

interface TermsAndConditionsProps {
  onBack: () => void;
}

export const TermsAndConditions: React.FC<TermsAndConditionsProps> = ({ onBack }) => {
  useSEO({
    title: 'Conditions générales | programmecesoir.fr',
    description: 'Conditions d’utilisation de programmecesoir.fr. Veuillez lire les règles qui encadrent l’usage de notre guide TNT.',
    url: '/conditions-generales',
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
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-4">Conditions générales</h1>
            <p className="text-slate-600 text-lg">Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>

          {/* Content */}
          <div className="bg-white rounded-2xl shadow-lg border-2 border-slate-200 p-8 md:p-12 space-y-8">
            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">1. Éditeur du site</h2>
              <div className="space-y-3 text-slate-700 leading-relaxed">
                <p>
                  <span className="font-semibold">{LEGAL_CONTACT.siteName}</span>, édité par {LEGAL_CONTACT.adminName}.
                </p>
                <p>
                  Adresse : {LEGAL_CONTACT.addressLine1}, {LEGAL_CONTACT.addressLine2}, {LEGAL_CONTACT.country}.
                </p>
                <p>
                  Site web :{' '}
                  <a href={LEGAL_CONTACT.website} className="text-blue-600 font-semibold hover:underline">
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
                  <a href={LEGAL_CONTACT.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-semibold hover:underline">
                    {LEGAL_CONTACT.adminName}
                  </a>
                </p>
                <p>
                  Bluesky :{' '}
                  <a href={LEGAL_CONTACT.blueskyUrl} target="_blank" rel="me noopener" className="text-blue-600 font-semibold hover:underline">
                    @programmecesoir.bsky.social
                  </a>
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">2. Acceptation des conditions</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                En accédant et en utilisant programmecesoir.fr (ci-après « le Site »), vous acceptez d’être lié par les présentes conditions d’utilisation.
                Si vous n’acceptez pas ces conditions, veuillez ne pas utiliser le Site.
              </p>
              <p className="text-slate-700 leading-relaxed">
                Nous nous réservons le droit de modifier ces conditions à tout moment. Les modifications prennent effet dès leur publication.
                L’utilisation continue du Site après modification vaut acceptation.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">3. Description du service</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                programmecesoir.fr est un service d’information fournissant des guides TV et grilles TNT françaises. Le Site propose :
              </p>
              <ul className="list-disc list-inside text-slate-700 space-y-2 ml-4">
                <li>Informations sur les programmes en cours</li>
                <li>Grilles journalières des chaînes</li>
                <li>Recherche de programmes et de chaînes</li>
                <li>Fiches détaillées de programmes</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">4. Utilisation du Site</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                Vous vous engagez à utiliser le Site uniquement à des fins légales et conformément aux présentes conditions. En particulier :
              </p>
              <ul className="list-disc list-inside text-slate-700 space-y-2 ml-4">
                <li>Ne pas utiliser le Site d’une manière susceptible de l’endommager ou d’en perturber l’accès</li>
                <li>Ne pas tenter d’accéder de manière non autorisée aux systèmes du Site</li>
                <li>Ne pas utiliser de robots/spiders sans autorisation écrite</li>
                <li>Ne pas copier ou exploiter commercialement les contenus sans autorisation</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">5. Propriété intellectuelle</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                Tous les contenus du Site (textes, graphismes, logos, images, données, logiciels) sont la propriété de programmecesoir.fr ou de ses fournisseurs,
                et sont protégés par les législations nationales et internationales.
              </p>
              <p className="text-slate-700 leading-relaxed mb-4">
                Les logos et marques des chaînes restent la propriété de leurs titulaires respectifs.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">6. Exactitude des informations</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                Nous nous efforçons de fournir des informations exactes et à jour. Toutefois, les grilles TV sont susceptibles de modifications.
              </p>
              <p className="text-slate-700 leading-relaxed mb-4">
                Nous ne garantissons pas l’exactitude, l’exhaustivité ou l’actualité de toutes les informations et ne saurions être responsables des changements de dernière minute.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">7. Limitation de responsabilité</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                Le Site est fourni « en l’état » sans garantie d’aucune sorte. Nous ne garantissons pas notamment que :
              </p>
              <ul className="list-disc list-inside text-slate-700 space-y-2 ml-4">
                <li>Le Site sera toujours disponible ou exempt d’erreurs</li>
                <li>Les défauts seront corrigés</li>
                <li>Le Site ou les serveurs sont exempts de virus</li>
              </ul>
              <p className="text-slate-700 leading-relaxed mt-4">
                En aucun cas programmecesoir.fr ne pourra être tenu responsable de dommages directs ou indirects liés à l’utilisation du Site.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">8. Liens vers des sites tiers</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                Le Site peut contenir des liens vers des sites tiers. Nous n’exerçons aucun contrôle sur ces sites et déclinons toute responsabilité.
              </p>
              <p className="text-slate-700 leading-relaxed">
                La présence d’un lien ne vaut pas approbation du site lié.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">9. Vie privée</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                L’utilisation du Site est également régie par notre politique de confidentialité et notre politique cookies.
              </p>
              <p className="text-slate-700 leading-relaxed">
                En utilisant le Site, vous acceptez nos pratiques de confidentialité telles que décrites dans ces politiques.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">10. Modifications du service</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                Nous nous réservons le droit de modifier, suspendre ou interrompre tout aspect du Site à tout moment, avec ou sans préavis.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">11. Droit applicable</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                Les présentes conditions sont régies par le droit français. Tout litige relève de la compétence des tribunaux français.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">12. Contact</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                Pour toute question relative à ces conditions, vous pouvez nous contacter à :{' '}
                <a href={`mailto:${LEGAL_CONTACT.email}`} className="text-blue-600 font-semibold hover:underline">
                  {LEGAL_CONTACT.email}
                </a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
