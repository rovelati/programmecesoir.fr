/**
 * Mappa delle macro-categorie e dei generi corrispondenti nel Database (FR).
 * Chiave: slug URL
 * Valore: array di generi raw trovati nel DB o Label UI
 */
export const CATEGORIES = {
    'film-ce-soir': {
        title: 'Films ce soir',
        genres: ['Film', 'Films', 'Cinéma', 'Cinema', 'Téléfilm', 'Telefilm', 'Téléfilms', 'Telefilms', 'Movie', 'Movies', 'Autres films']
    },
    'series-ce-soir': {
        title: 'Séries ce soir',
        genres: ['Série', 'Séries', 'Serie', 'Series', 'Fiction', 'Sitcom', 'Soap']
    },
    'sport-ce-soir': {
        title: 'Sport ce soir',
        genres: ['Sport']
    },
    'documentaires-ce-soir': {
        title: 'Documentaires ce soir',
        genres: ['Documentaire', 'Documentary', 'Découverte']
    },
    'divertissement-ce-soir': {
        title: 'Divertissement ce soir',
        genres: ['Divertissement', 'Jeu', 'Téléréalité', 'Show', 'Magazine', 'Variétés']
    },
    'infos-ce-soir': {
        title: 'Info ce soir',
        genres: ['Information', 'Info', 'Journal', 'Actualité', 'Débat']
    },
    'jeunesse-ce-soir': {
        title: 'Jeunesse ce soir',
        genres: ['Jeunesse', 'Enfants', 'Animation', 'Famille']
    },
    'culture-ce-soir': {
        title: 'Culture ce soir',
        genres: ['Culture', 'Musique', 'Théâtre', 'Art', 'Histoire']
    }
};

/**
 * Ritorna le info della categoria dato lo slug
 */
export const getCategoryBySlug = (slug) => {
    return CATEGORIES[slug] || null;
};

/**
 * Ritorna la lista completa delle categorie per il menu
 */
export const getCategoryList = () => {
    return Object.entries(CATEGORIES).map(([slug, data]) => ({
        slug,
        title: data.title
    }));
};
