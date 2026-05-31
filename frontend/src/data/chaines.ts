export type Chaine = {
  slug: string;
  nom: string;
  description: string;
  wikidataSameAs: string;
  logoUrl: string;
};

const SITE_URL = 'https://programmecesoir.fr';

export const CHAINES: Chaine[] = [
  {
    slug: 'tf1',
    nom: 'TF1',
    description: 'Programme TV TF1 ce soir : films, séries et émissions en direct.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q235729',
    logoUrl: `${SITE_URL}/loghi/tf1.png`,
  },
  {
    slug: 'france-2',
    nom: 'France 2',
    description: 'Programme TV France 2 ce soir : films, documentaires et journaux télévisés.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q596005',
    logoUrl: `${SITE_URL}/loghi/france-2.png`,
  },
  {
    slug: 'france-3',
    nom: 'France 3',
    description: 'Programme TV France 3 ce soir : régions, documentaires et fictions.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q596010',
    logoUrl: `${SITE_URL}/loghi/france-3.png`,
  },
  {
    slug: 'canal-plus',
    nom: 'Canal+',
    description: 'Programme TV Canal+ ce soir : cinéma, sport et séries premium.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q193852',
    logoUrl: `${SITE_URL}/loghi/canal.png`,
  },
  {
    slug: 'france-5',
    nom: 'France 5',
    description: 'Programme TV France 5 ce soir : culture, documentaires et magazines.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q596014',
    logoUrl: `${SITE_URL}/loghi/france-5.png`,
  },
  {
    slug: 'm6',
    nom: 'M6',
    description: 'Programme TV M6 ce soir : séries, divertissement et films.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q602487',
    logoUrl: `${SITE_URL}/loghi/m6.png`,
  },
  {
    slug: 'arte',
    nom: 'Arte',
    description: 'Programme TV Arte ce soir : culture européenne, documentaires et cinéma.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q161566',
    logoUrl: `${SITE_URL}/loghi/arte.png`,
  },
  {
    slug: 'c8',
    nom: 'C8',
    description: 'Programme TV C8 ce soir : divertissement, talk-shows et films.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q2830516',
    logoUrl: `${SITE_URL}/apple-touch-icon.png`,
  },
  {
    slug: 'w9',
    nom: 'W9',
    description: 'Programme TV W9 ce soir : musique, divertissement et séries.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q2830524',
    logoUrl: `${SITE_URL}/loghi/w9.png`,
  },
  {
    slug: 'tmc',
    nom: 'TMC',
    description: 'Programme TV TMC ce soir : films, séries et magazines.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q2830525',
    logoUrl: `${SITE_URL}/loghi/tmc.png`,
  },
  {
    slug: 'tfx',
    nom: 'TFX',
    description: 'Programme TV TFX ce soir : séries, films et divertissement.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q15704982',
    logoUrl: `${SITE_URL}/loghi/tfx.png`,
  },
  {
    slug: 'nrj12',
    nom: 'NRJ 12',
    description: 'Programme TV NRJ 12 ce soir : divertissement, téléréalité et séries.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q2830534',
    logoUrl: `${SITE_URL}/apple-touch-icon.png`,
  },
  {
    slug: 'lci',
    nom: 'LCI',
    description: 'Programme TV LCI ce soir : information en continu, débats et magazines.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q3214682',
    logoUrl: `${SITE_URL}/loghi/lci.png`,
  },
  {
    slug: 'france-4',
    nom: 'France 4',
    description: 'Programme TV France 4 ce soir : jeunesse, musique et spectacles.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q596018',
    logoUrl: `${SITE_URL}/loghi/france-4.png`,
  },
  {
    slug: 'bfm-tv',
    nom: 'BFM TV',
    description: 'Programme TV BFM TV ce soir : information en direct, reportages et débats.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q1350914',
    logoUrl: `${SITE_URL}/loghi/bfm-tv.png`,
  },
  {
    slug: 'cnews',
    nom: 'CNews',
    description: 'Programme TV CNews ce soir : actualités, débats et magazines.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q18006965',
    logoUrl: `${SITE_URL}/loghi/cnews.png`,
  },
  {
    slug: 'cstar',
    nom: 'CStar',
    description: 'Programme TV CStar ce soir : musique, divertissement et séries.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q2830528',
    logoUrl: `${SITE_URL}/loghi/cstar.png`,
  },
  {
    slug: 'gulli',
    nom: 'Gulli',
    description: 'Programme TV Gulli ce soir : dessins animés, séries jeunesse et famille.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q3118658',
    logoUrl: `${SITE_URL}/loghi/gulli.png`,
  },
  {
    slug: '6ter',
    nom: '6ter',
    description: 'Programme TV 6ter ce soir : famille, séries et divertissement.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q18385065',
    logoUrl: `${SITE_URL}/loghi/6ter.png`,
  },
  {
    slug: 'rmc-decouverte',
    nom: 'RMC Découverte',
    description: 'Programme TV RMC Découverte ce soir : aventure, sciences et documentaires.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q3424521',
    logoUrl: `${SITE_URL}/loghi/rmc-decouverte.png`,
  },
  {
    slug: 'rmc-story',
    nom: 'RMC Story',
    description: 'Programme TV RMC Story ce soir : histoire, grandes affaires et documentaires.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q3424519',
    logoUrl: `${SITE_URL}/loghi/rmc-story.png`,
  },
  {
    slug: 'franceinfo',
    nom: 'franceinfo',
    description: 'Programme TV franceinfo ce soir : information en continu et reportages.',
    wikidataSameAs: 'https://www.wikidata.org/wiki/Q18006967',
    logoUrl: `${SITE_URL}/loghi/franceinfo.png`,
  },
];

export const getChaineBySlug = (slug: string) =>
  CHAINES.find((chaine) => chaine.slug === slug);
