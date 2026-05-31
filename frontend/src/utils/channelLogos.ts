/**
 * Channel logo fallback URLs and utilities
 * Provides fallback logos when database logos are missing or fail to load
 */

// Fallback logo URLs for major channels
const FALLBACK_LOGOS: Record<string, string> = {
  'tf1': 'https://www.programme-tv.net/imgre/fit/~2~channel~f2b6de26acc4dc3e.png/480x480/quality/100/tf1.png',
  'france-2': 'https://www.programme-tv.net/imgre/fit/~2~channel~606394a5b095653a.png/480x480/quality/100/france-2.png',
  'france2': 'https://www.programme-tv.net/imgre/fit/~2~channel~606394a5b095653a.png/480x480/quality/100/france-2.png',
  'disney-xd': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Disney_XD_logo.svg/200px-Disney_XD_logo.svg.png',
  'disneyxd': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Disney_XD_logo.svg/200px-Disney_XD_logo.svg.png',
};

/**
 * Get channel logo URL with fallback
 */
export const getChannelLogo = (channelId: string, logoUrl?: string | null, channelName?: string): string => {
  // If logo URL exists and is valid, use it
  if (logoUrl && logoUrl.trim() !== '' && logoUrl !== 'null' && logoUrl !== 'undefined') {
    return logoUrl;
  }
  
  // Try to find fallback by channel ID
  const normalizedId = channelId.toLowerCase().replace(/\s+/g, '-');
  if (FALLBACK_LOGOS[normalizedId]) {
    return FALLBACK_LOGOS[normalizedId];
  }
  
  // Try to find fallback by channel name
  if (channelName) {
    const normalizedName = channelName.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    
    // Check direct match
    if (FALLBACK_LOGOS[normalizedName]) {
      return FALLBACK_LOGOS[normalizedName];
    }
    
    // Check partial matches
    for (const [key, url] of Object.entries(FALLBACK_LOGOS)) {
      if (normalizedName.includes(key) || key.includes(normalizedName)) {
        return url;
      }
    }
  }
  
  // Default fallback - a generic TV icon
  return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2U1ZTdlYiIvPjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTQ5OGE1IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5UVzwvdGV4dD48L3N2Zz4=';
};

/**
 * Check if logo URL is valid
 */
export const isValidLogoUrl = (url: string | null | undefined): boolean => {
  if (!url || url.trim() === '' || url === 'null' || url === 'undefined') {
    return false;
  }
  return true;
};
