import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { getRecommendedGenres, cleanAndSortRecommendations } from '../utils/recommendationRules';
import { getCurrentTimeSlot, getTodayInParis } from '../utils/timeSlots';
import { CHANNELS_TABLE, PROGRAMS_TABLE } from '../utils/dbTables';

export const useRecommendation = ({ age, gender, timeSlot }) => {
    const [recommendations, setRecommendations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Only run if we have basic user info
        if (!age || !gender) {
            setRecommendations([]);
            return;
        }

        async function fetchAndRecommend() {
            try {
                setLoading(true);
                setError(null);

                const slotToUse = timeSlot || getCurrentTimeSlot();
                const genreScores = getRecommendedGenres(parseInt(age), gender);

                // Optimisation : on pourrait filtrer par genres en SQL pour ne garder que les recommandations
                // Mais récupérer les programmes du créneau est généralement assez léger (une page)
                // donc on filtre côté client pour un meilleur ranking.
                // On récupère tout le créneau.

                // Get today's date in Europe/Paris timezone
                const today = getTodayInParis();

                const { data: programs, error: fetchError } = await supabase
                    .from(PROGRAMS_TABLE)
                    .select(`
            *,
            channels:${CHANNELS_TABLE} (
              name,
              logo_url,
              channel_number
            )
          `)
                    .eq('date', today)
                    .eq('time_slot', slotToUse)
                    .order('start_time', { ascending: true });

                if (fetchError) throw fetchError;

                // Apply Logic
                const rankedPrograms = cleanAndSortRecommendations(programs, genreScores);

                // Take top 10
                setRecommendations(rankedPrograms.slice(0, 10));

            } catch (err) {
                console.error('Recommendation engine error:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchAndRecommend();
    }, [age, gender, timeSlot]);

    return { recommendations, loading, error };
};
