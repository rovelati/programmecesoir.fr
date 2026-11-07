/**
 * adsense.ts — Programme Ce Soir (programmecesoir.fr) AdSense Configuration
 * Centralisation Publisher ID et ad slots haute visibilité.
 */

export const ADSENSE_CLIENT_ID = 'ca-pub-2168172914069272';

export const ADSENSE_SLOTS = {
  // In-Feed entre les chaînes / grilles TV (High-Viewability dans le flux principal)
  IN_FEED_CHANNELS: '3881971380',
  // Mid-Content sur la fiche chaîne / grille horaire (entre l'en-tête et les programmes)
  CHANNEL_MID_CONTENT: '4452817027',
  // Pre-Footer / bas de page (au-dessus du maillage SEO et du footer)
  PRE_FOOTER: '1255808043',
} as const;
