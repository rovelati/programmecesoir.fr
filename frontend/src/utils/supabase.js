import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase credentials in environment variables');
}

// Custom fetch con timeout di 180 secondi per le chiamate ai programmi EPG
// (l'endpoint Supabase può essere lento con grandi dataset)
const customFetch = (url, options = {}) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 180 secondi

    return fetch(url, {
        ...options,
        signal: options.signal || controller.signal,
    }).finally(() => {
        clearTimeout(timeoutId);
    });
};

export const supabase = createClient(
    supabaseUrl || '',
    supabaseAnonKey || '',
    {
        db: {
            schema: 'public',
        },
        global: {
            headers: {
                'x-client-info': 'programmecesoir.fr',
            },
            fetch: customFetch,
        },
        auth: {
            persistSession: false,
        },
    }
);
