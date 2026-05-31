/**
 * Logic for recommending programs based on user demographics.
 * Returns a weighted score for genres relative to the user profile.
 */

export const getRecommendedGenres = (age, gender) => {
    let scores = {};

    // 1. AGE BASED RULES
    if (age < 12) {
        scores['Jeunesse'] = 10;
        scores['Animation'] = 10;
        scores['Éducatif'] = 8;
        return scores; // Kids mostly just watch kids stuff
    }

    if (age >= 12 && age < 18) {
        scores['Série'] = 9;
        scores['Séries'] = 9;
        scores['Musique'] = 8;
        scores['Réalité'] = 7;
        scores['Divertissement'] = 6;
        scores['Cinéma'] = 6;
        scores['Film'] = 6;
        scores['Sitcom'] = 8;
        scores['Découverte'] = 5;
    }

    if (age >= 18 && age < 35) {
        scores['Série'] = 9;
        scores['Séries'] = 9;
        scores['Film'] = 8;
        scores['Cinéma'] = 8;
        scores['Sport'] = 7;
        scores['Divertissement'] = 6;
        scores['Crime'] = 7;
        scores['Musique'] = 6;
        scores['Découverte'] = 5;
    }

    if (age >= 35 && age < 60) {
        scores['Film'] = 8;
        scores['Cinéma'] = 8;
        scores['Actualités'] = 7;
        scores['Information'] = 7;
        scores['Sport'] = 7;
        scores['Crime'] = 6;
        scores['Divertissement'] = 6;
        scores['Documentaire'] = 5;
        scores['Découverte'] = 6;
        scores['Série'] = 5;
    }

    if (age >= 60) {
        scores['Information'] = 9;
        scores['Actualités'] = 9;
        scores['Soap'] = 8;
        scores['Magazine'] = 7;
        scores['Divertissement'] = 7;
        scores['Film'] = 6;
        scores['Théâtre'] = 6;
        scores['Découverte'] = 7;
        scores['Documentaire'] = 6;
    }

    // 2. GENDER BASED TWEAKS (Additive)
    if (gender === 'M' || gender === 'Homme') {
        scores['Sport'] = (scores['Sport'] || 0) + 5; // Strong boost
        scores['Crime'] = (scores['Crime'] || 0) + 2;
        scores['Actualités'] = (scores['Actualités'] || 0) + 2;
        scores['Information'] = (scores['Information'] || 0) + 2;
        scores['Documentaire'] = (scores['Documentaire'] || 0) + 2;
        scores['Découverte'] = (scores['Découverte'] || 0) + 1;
    }

    if (gender === 'F' || gender === 'Femme') {
        scores['Soap'] = (scores['Soap'] || 0) + 5;
        scores['Lifestyle'] = (scores['Lifestyle'] || 0) + 4;
        scores['Réalité'] = (scores['Réalité'] || 0) + 3;
        scores['Série'] = (scores['Série'] || 0) + 2;
        scores['Divertissement'] = (scores['Divertissement'] || 0) + 2;
        scores['Talk-show'] = (scores['Talk-show'] || 0) + 2;
        scores['Musique'] = (scores['Musique'] || 0) + 2;
        scores['Découverte'] = (scores['Découverte'] || 0) + 2;
    }

    return scores;
};

/**
 * Filter and sort programs based on recommendation scores.
 */
export const cleanAndSortRecommendations = (programs, genreScores) => {
    return programs
        .map(p => ({
            ...p,
            score: (genreScores[p.genre] || 0) + (p.score_base || 0) // score_base could be rating in future
        }))
        .filter(p => p.score > 0) // Only show relevant stuff
        .sort((a, b) => b.score - a.score); // Highest score first
};
