export const CATEGORY_FILTERS: Record<string, string[]> = {
  'Films': ['Film', 'Films', 'Cinéma', 'Cinema', 'Movie', 'Movies', 'Téléfilm', 'Telefilm', 'Téléfilms', 'Telefilms', 'Autres films'],
  'Info': ['Information', 'Info', 'Journal', 'Actualité', 'Débat'],
  'Documentaires': ['Documentaire', 'Documentary', 'Découverte'],
  'Divertissement': ['Divertissement', 'Jeu', 'Téléréalité', 'Show', 'Magazine', 'Variétés'],
  'Series': ['Série', 'Séries', 'Serie', 'Series', 'Fiction', 'Sitcom', 'Soap'],
  'Sport': ['Sport'],
  'Jeunesse': ['Jeunesse', 'Enfants', 'Animation', 'Famille'],
  'Culture': ['Culture', 'Musique', 'Théâtre', 'Art', 'Histoire']
};

/**
 * Check if a program category matches a filter category
 */
export const programMatchesCategory = (programCategory: string, filterCategory: string): boolean => {
  if (!programCategory || !filterCategory) return false;
  
  const programCategoryLower = programCategory.toLowerCase();
  const matchingGenres = CATEGORY_FILTERS[filterCategory];
  
  if (!matchingGenres) return false;
  
  return matchingGenres.some(genre => 
    programCategoryLower.includes(genre.toLowerCase()) ||
    genre.toLowerCase().includes(programCategoryLower)
  );
};

/**
 * Get SEO title for a category
 */
export const getCategorySeoTitle = (category: string): string => {
  const titles: Record<string, string> = {
    'Films': 'Films à la TV ce soir',
    'Info': 'Info et journaux TV ce soir',
    'Documentaires': 'Documentaires à la TV ce soir',
    'Divertissement': 'Divertissements à la TV ce soir',
    'Series': 'Séries à la TV ce soir',
    'Sport': 'Sport à la TV ce soir',
    'Jeunesse': 'Programmes jeunesse ce soir',
    'Culture': 'Culture et arts à la TV ce soir'
  };
  return titles[category] || `Programme ${category} ce soir`;
};

/**
 * Get SEO description for a category
 */
export const getCategorySeoDescription = (category: string): string => {
  const descriptions: Record<string, string> = {
    'Films': 'Tous les films diffusés ce soir à la TV sur la TNT. Horaires, chaînes et synopsis.',
    'Info': 'Tous les journaux et émissions d’info diffusés ce soir à la TV.',
    'Documentaires': 'Documentaires diffusés ce soir à la TV sur la TNT. Découvrez les meilleurs sujets.',
    'Divertissement': 'Divertissements diffusés ce soir à la TV. Jeux, variétés et magazines.',
    'Series': 'Séries diffusées ce soir à la TV sur la TNT. Vos séries préférées en prime time.',
    'Sport': 'Sport diffusé ce soir à la TV. Tous les événements en direct.',
    'Jeunesse': 'Programmes jeunesse diffusés ce soir. Dessins animés et émissions famille.',
    'Culture': 'Culture et arts diffusés ce soir à la TV. Musique, théâtre, documentaires.'
  };
  return descriptions[category] || `Découvrez les programmes ${category} ce soir à la TV TNT.`;
};
