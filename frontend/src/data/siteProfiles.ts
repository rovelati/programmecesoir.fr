export type SiteProfile = {
  label: string;
  url: string;
  rel: string;
};

export const SITE_PROFILES: SiteProfile[] = [
  {
    label: 'Trustpilot',
    url: 'https://www.trustpilot.com/review/programmecesoir.fr',
    rel: 'noopener',
  },
  {
    label: 'Blinx',
    url: 'https://www.blinx.biz/programme-ce-soir',
    rel: 'noopener',
  },
  {
    label: 'Hotfrog',
    url: 'https://www.hotfrog.fr/company/3b9657ae9cdea1064cdf913a4307e9bc',
    rel: 'noopener',
  },
  {
    label: 'Gravatar',
    url: 'https://gravatar.com/nachocasually086548ae02',
    rel: 'noopener',
  },
  {
    label: 'Wikidata',
    url: 'https://www.wikidata.org/wiki/Q138768630',
    rel: 'noopener',
  },
  {
    label: 'Bluesky',
    url: 'https://bsky.app/profile/programmecesoir.bsky.social',
    rel: 'me noopener',
  },
  // { label: 'LinkedIn', url: 'https://www.linkedin.com/company/programme-ce-soir', rel: 'me noopener' },
  // { label: 'Facebook', url: 'https://www.facebook.com/programmecesoir', rel: 'me noopener' },
  // { label: 'Pinterest', url: 'https://www.pinterest.fr/programmecesoir', rel: 'me noopener' },
  // { label: 'Product Hunt', url: 'https://www.producthunt.com/products/programme-ce-soir', rel: 'noopener' },
  // { label: 'AlternativeTo', url: 'https://alternativeto.net/software/programme-ce-soir/', rel: 'noopener' },
  // { label: 'Crunchbase', url: 'https://www.crunchbase.com/organization/programme-ce-soir', rel: 'noopener' },
];

export const SITE_SAME_AS = [
  'https://www.wikidata.org/wiki/Q138768630',
  'https://bsky.app/profile/programmecesoir.bsky.social',
  'https://www.trustpilot.com/review/programmecesoir.fr',
];
