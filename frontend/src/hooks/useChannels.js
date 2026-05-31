import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { CHANNELS_TABLE } from '../utils/dbTables';

export const useChannels = () => {
    const [channels, setChannels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchChannels() {
            try {
                setLoading(true);
                const { data, error } = await supabase
                    .from(CHANNELS_TABLE)
                    .select('*')
                    .order('channel_number', { ascending: true });

                if (error) throw error;
                setChannels(data);
            } catch (err) {
                console.error('Error fetching channels:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchChannels();
    }, []);

    return { channels, loading, error };
};
