import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../utils/supabase';
import { getCategoryBySlug } from '../utils/categories';
import { getTodayInParis } from '../utils/timeSlots';
import { CHANNELS_TABLE, PROGRAMS_TABLE } from '../utils/dbTables';

const programsCache = new Map();

export const usePrograms = ({
    timeSlot,
    channelId,
    channelIds,
    excludeChannelIds,
    date,
    categorySlug,
    startTime,
    endTime,
    minEndTime,
    enabled = true,
    splitChannelQueries = false,
    cacheTtlMs = 0,
    pageSize = 1000,
    maxPages = 2,
    maxPrograms = null,
    programFields = null,
    initialData = null,
    initialDataKey = '',
    skipFetchIfInitialData = false,
} = {}) => {
    const seededPrograms = Array.isArray(initialData) ? initialData : [];
    const [programs, setPrograms] = useState(seededPrograms);
    const [loading, setLoading] = useState(enabled && seededPrograms.length === 0);
    const [error, setError] = useState(null);

    const normalizedChannelIds = useMemo(() => {
        if (!Array.isArray(channelIds)) return [];
        return [...new Set(channelIds.map(v => String(v || '').trim()).filter(Boolean))].sort();
    }, [channelIds]);

    const normalizedExcludeChannelIds = useMemo(() => {
        if (!Array.isArray(excludeChannelIds)) return [];
        return [...new Set(excludeChannelIds.map(v => String(v || '').trim()).filter(Boolean))].sort();
    }, [excludeChannelIds]);

    // Dependency key for useEffect to re-run
    const dependencyKey = JSON.stringify({
        timeSlot,
        channelId,
        channelIds: normalizedChannelIds,
        excludeChannelIds: normalizedExcludeChannelIds,
        date,
        categorySlug,
        startTime,
        endTime,
        minEndTime,
        enabled,
        splitChannelQueries,
        cacheTtlMs,
        pageSize,
        maxPages,
        maxPrograms,
        programFields,
        initialDataKey,
        skipFetchIfInitialData
    });

    useEffect(() => {
        if (!enabled) {
            setPrograms([]);
            setError(null);
            setLoading(false);
            return;
        }

        let isCancelled = false;

        async function fetchPrograms() {
            try {
                const hasSeededPrograms = seededPrograms.length > 0;
                if (hasSeededPrograms) {
                    setPrograms(seededPrograms);
                    setError(null);
                    setLoading(false);
                } else {
                    // Clear stale route data immediately when switching to a fresh query.
                    setPrograms([]);
                    setError(null);
                    setLoading(true);
                }

                const cacheKey = dependencyKey;
                const ttl = Number(cacheTtlMs) || 0;
                if (hasSeededPrograms && ttl > 0) {
                    programsCache.set(cacheKey, { timestamp: Date.now(), data: seededPrograms });
                }
                if (hasSeededPrograms && skipFetchIfInitialData) {
                    setPrograms(seededPrograms);
                    setError(null);
                    setLoading(false);
                    return;
                }
                if (ttl > 0) {
                    const cached = programsCache.get(cacheKey);
                    if (!hasSeededPrograms && cached && (Date.now() - cached.timestamp) < ttl) {
                        setPrograms(cached.data);
                        setLoading(false);
                        return;
                    }
                }

                const defaultFields = 'id, channel_id, title, description, start_time, end_time, genre, poster_url, replay_url';
                const selectFields = programFields || defaultFields;

                const buildQuery = (forcedChannelId) => {
                    let query = supabase
                        .from(PROGRAMS_TABLE)
                        .select(`
                            ${selectFields},
                            channels:${CHANNELS_TABLE} (
                              name,
                              logo_url,
                              channel_number
                            )
                          `)
                        .order('start_time', { ascending: true });

                    if (timeSlot) {
                        query = query.eq('time_slot', timeSlot);
                    }

                    if (forcedChannelId) {
                        query = query.eq('channel_id', forcedChannelId);
                    } else {
                        if (channelId) {
                            query = query.eq('channel_id', channelId);
                        }

                        if (normalizedChannelIds.length > 0) {
                            query = query.in('channel_id', normalizedChannelIds);
                        }

                        if (normalizedExcludeChannelIds.length > 0) {
                            const excluded = normalizedExcludeChannelIds
                                .map(v => `"${v.replace(/"/g, '\\"')}"`)
                                .join(',');
                            query = query.not('channel_id', 'in', `(${excluded})`);
                        }
                    }

                    if (categorySlug) {
                        const category = getCategoryBySlug(categorySlug);
                        if (category && category.genres.length > 0) {
                            const genreClauses = category.genres
                                .map((genre) => String(genre || '').trim())
                                .filter(Boolean)
                                .map((genre) => `genre.ilike.*${genre.replace(/[%*,()]/g, '').replace(/\s+/g, '*')}*`);

                            if (genreClauses.length > 0) {
                                query = query.or(genreClauses.join(','));
                            }
                        }
                    }

                    if (startTime) {
                        query = query.gte('start_time', startTime);
                    }

                    if (endTime) {
                        query = query.lte('start_time', endTime);
                    }

                    if (minEndTime) {
                        query = query.gte('end_time', minEndTime);
                    }

                    if (!startTime && !endTime) {
                        if (date) {
                            query = query.eq('date', date);
                        } else {
                            const today = getTodayInParis();
                            const yesterdayDate = new Date(today);
                            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
                            const yesterday = yesterdayDate.toISOString().split('T')[0];

                            const tomorrowDate = new Date(today);
                            tomorrowDate.setDate(tomorrowDate.getDate() + 1);
                            const tomorrow = tomorrowDate.toISOString().split('T')[0];

                            query = query.gte('date', yesterday).lte('date', tomorrow);
                        }
                    }

                    return query;
                };

                const fetchPaged = async (query, pageLimit) => {
                    let dataAcc = [];
                    let page = 0;
                    let hasMore = true;
                    const maxPageCount = Math.max(1, Number(pageLimit) || 1);
                    const safePageSize = Math.max(50, Number(pageSize) || 1000);

                    while (hasMore && page < maxPageCount) {
                        const rangeStart = page * safePageSize;
                        const rangeEnd = (page + 1) * safePageSize - 1;
                        const { data, error: pageError } = await query.range(rangeStart, rangeEnd);
                        if (pageError) throw pageError;

                        if (data && data.length > 0) {
                            dataAcc = [...dataAcc, ...data];
                            if (maxPrograms && dataAcc.length >= maxPrograms) {
                                dataAcc = dataAcc.slice(0, maxPrograms);
                                break;
                            }
                            if (data.length < safePageSize) {
                                hasMore = false;
                            } else {
                                page += 1;
                            }
                        } else {
                            hasMore = false;
                        }
                    }

                    return dataAcc;
                };

                let allData = [];

                if (splitChannelQueries && normalizedChannelIds.length > 0 && !channelId) {
                    const dedupe = new Map();
                    for (const singleChannelId of normalizedChannelIds) {
                        const channelData = await fetchPaged(buildQuery(singleChannelId), maxPages);
                        channelData.forEach((item) => {
                            const fallbackKey = `${item?.channel_id || ''}|${item?.start_time || ''}|${item?.title || ''}`;
                            const key = String(item?.id || fallbackKey);
                            if (!dedupe.has(key)) {
                                dedupe.set(key, item);
                            }
                        });
                    }
                    allData = Array.from(dedupe.values()).sort((a, b) =>
                        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
                    );
                } else {
                    allData = await fetchPaged(buildQuery(), maxPages);
                }

                if (isCancelled) return;

                setPrograms(allData);
                if (ttl > 0) {
                    programsCache.set(cacheKey, { timestamp: Date.now(), data: allData });
                }
            } catch (err) {
                if (isCancelled) return;
                console.error('Error fetching programs:', err);
                setError(err.message);
            } finally {
                if (isCancelled) return;
                setLoading(false);
            }
        }

        fetchPrograms();

        return () => {
            isCancelled = true;
        };
    }, [dependencyKey]);

    return { programs, loading, error };
};
