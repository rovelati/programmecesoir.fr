import { useEffect } from 'react';

interface SEOProps {
  title: string;
  description: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  channelName?: string;
  programTitle?: string;
  programStartTime?: string;
  programEndTime?: string;
}

/**
 * Hook to manage SEO meta tags, Open Graph, and structured data
 */
export const useSEO = (props: SEOProps) => {
  const {
    title,
    description,
    image,
    url,
    type = 'website',
    publishedTime,
    channelName,
    programTitle,
    programStartTime,
    programEndTime
  } = props;

  useEffect(() => {
    const siteUrl = window.location.origin;
    const fullUrl = url ? `${siteUrl}${url}` : window.location.href;
    const ogImage = image || `${siteUrl}/og-default.jpg`; // Fallback image

    // Update document title
    document.title = title;

    // Helper to get or create meta tag
    const getOrCreateMeta = (property: string, attribute: 'name' | 'property' = 'property') => {
      let meta = document.querySelector(`meta[${attribute}="${property}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attribute, property);
        document.head.appendChild(meta);
      }
      return meta;
    };

    // Basic meta tags
    getOrCreateMeta('description', 'name').setAttribute('content', description);
    getOrCreateMeta('keywords', 'name').setAttribute('content', 
      `programme tv, programme ce soir, tnt, guide tv, grille tv, ${channelName || ''}, ${programTitle || ''}, télévision française`.trim()
    );

    // Open Graph tags
    getOrCreateMeta('og:title').setAttribute('content', title);
    getOrCreateMeta('og:description').setAttribute('content', description);
    getOrCreateMeta('og:type').setAttribute('content', type);
    getOrCreateMeta('og:url').setAttribute('content', fullUrl);
    getOrCreateMeta('og:image').setAttribute('content', ogImage);
    getOrCreateMeta('og:site_name').setAttribute('content', 'Programme Ce Soir');
    getOrCreateMeta('og:locale').setAttribute('content', 'fr_FR');

    // Twitter Card
    getOrCreateMeta('twitter:card', 'name').setAttribute('content', 'summary_large_image');
    getOrCreateMeta('twitter:title', 'name').setAttribute('content', title);
    getOrCreateMeta('twitter:description', 'name').setAttribute('content', description);
    getOrCreateMeta('twitter:image', 'name').setAttribute('content', ogImage);

    // Article-specific tags
    if (type === 'article' && publishedTime) {
      getOrCreateMeta('article:published_time').setAttribute('content', publishedTime);
      if (channelName) {
        getOrCreateMeta('article:author').setAttribute('content', channelName);
      }
    }

    // Canonical URL
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', fullUrl);

    // Structured Data (JSON-LD)
    let structuredData: any = {
      '@context': 'https://schema.org',
      '@type': type === 'article' ? 'TVEpisode' : 'WebPage',
      name: title,
      description: description,
      url: fullUrl,
    };

    if (type === 'article' && programTitle && programStartTime && programEndTime) {
      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'TVEpisode',
        name: programTitle,
        description: description,
        url: fullUrl,
        partOfSeries: {
          '@type': 'TVSeries',
          name: channelName || 'Programma TV',
        },
        partOfSeason: {
          '@type': 'TVSeason',
          seasonNumber: 1, // Could be extracted from title if available
        },
        episodeNumber: 1, // Could be extracted from title if available
        broadcastStartTime: programStartTime,
        broadcastEndTime: programEndTime,
      };
    } else if (channelName) {
      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'TVChannel',
        name: channelName,
        description: description,
        url: fullUrl,
      };
    }

    // Remove old structured data
    const oldScript = document.querySelector('script[type="application/ld+json"]');
    if (oldScript) {
      oldScript.remove();
    }

    // Add new structured data
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(structuredData);
    document.head.appendChild(script);

    // Cleanup function
    return () => {
      // Note: We don't remove meta tags on cleanup as they should persist
      // until the next page navigation updates them
    };
  }, [title, description, image, url, type, publishedTime, channelName, programTitle, programStartTime, programEndTime]);
};
