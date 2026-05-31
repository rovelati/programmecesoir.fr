import { SITE_SAME_AS } from '../data/siteProfiles';
import type { Chaine } from '../data/chaines';

const SITE_URL = 'https://programmecesoir.fr';
const SITE_LOGO_URL = `${SITE_URL}/apple-touch-icon.png`;

export function buildWebSiteJsonLd(): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: 'Programme Ce Soir',
        alternateName: 'Programme TV TNT Ce Soir',
        url: SITE_URL,
        description:
          'Guide TV TNT : programme ce soir, en direct et demain sur toutes les chaînes françaises',
        inLanguage: 'fr-FR',
        author: { '@id': `${SITE_URL}/#organization` },
        publisher: { '@id': `${SITE_URL}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${SITE_URL}/recherche?qs={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
        sameAs: SITE_SAME_AS,
      },
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'Programme Ce Soir',
        url: SITE_URL,
        logo: {
          '@type': 'ImageObject',
          url: SITE_LOGO_URL,
          width: 180,
          height: 180,
        },
        sameAs: SITE_SAME_AS,
      },
    ],
  });
}

export function buildFaqJsonLd(faqs: { q: string; a: string }[]): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    author: { '@id': `${SITE_URL}/#organization` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: a,
      },
    })),
  });
}

export function buildBreadcrumbJsonLd(items: { name: string; url: string }[]): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  });
}

export function buildBroadcastServiceJsonLd(chaine: Chaine): string {
  const organizationRef = { '@id': 'https://programmecesoir.fr/#organization' };
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BroadcastService',
        '@id': `https://programmecesoir.fr/${chaine.slug}/#broadcastservice`,
        name: chaine.nom,
        url: `https://programmecesoir.fr/${chaine.slug}`,
        broadcastDisplayName: chaine.nom,
        broadcastTimezone: 'Europe/Paris',
        inLanguage: 'fr-FR',
        logo: {
          '@type': 'ImageObject',
          url: chaine.logoUrl,
        },
        sameAs: chaine.wikidataSameAs,
        author: organizationRef,
        publisher: organizationRef,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Accueil',
            item: 'https://programmecesoir.fr',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: chaine.nom,
            item: `https://programmecesoir.fr/${chaine.slug}`,
          },
        ],
      },
      {
        '@type': 'WebPage',
        '@id': `https://programmecesoir.fr/${chaine.slug}/#webpage`,
        name: `Programme TV ${chaine.nom} ce soir`,
        description: chaine.description,
        url: `https://programmecesoir.fr/${chaine.slug}`,
        inLanguage: 'fr-FR',
        author: organizationRef,
        publisher: organizationRef,
        isPartOf: { '@id': 'https://programmecesoir.fr/#website' },
      },
    ],
  });
}
