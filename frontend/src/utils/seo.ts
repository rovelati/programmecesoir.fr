import { useEffect } from 'react';
import { buildProgramGraph, getChannelSameAs } from './knowledgeGraph';

interface SEOProps {
  title: string;
  description: string;
  image?: string;
  url?: string;
  canonicalUrl?: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  channelName?: string;
  programTitle?: string;
  programStartTime?: string;
  programEndTime?: string;
  category?: string;
  noindex?: boolean; // Explicitly set to true for pages that should not be indexed
  channelUrl?: string; // Channel URL for breadcrumbs
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
    canonicalUrl,
    type = 'website',
    publishedTime,
    channelName,
    programTitle,
    programStartTime,
    programEndTime,
    category,
    noindex = false,
    channelUrl
  } = props;

  useEffect(() => {
    const siteUrl = window.location.origin;
    const rawUrl = canonicalUrl
      || (url ? (url.startsWith('http') ? url : new URL(url, siteUrl).toString()) : window.location.href);
    const fullUrl = rawUrl.split('?')[0].split('#')[0];
    const ogImage = image || `${siteUrl}/static/img/programmecesoir-social.jpg`; // Fallback image

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

    // Robots meta tag - explicitly set index/follow or noindex
    const robotsContent = noindex ? 'noindex,follow' : 'index,follow';
    getOrCreateMeta('robots', 'name').setAttribute('content', robotsContent);

    // Basic meta tags
    getOrCreateMeta('description', 'name').setAttribute('content', description);
    getOrCreateMeta('author', 'name').setAttribute('content', 'Programme Ce Soir');
    getOrCreateMeta('publisher', 'name').setAttribute('content', 'Programme Ce Soir');
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
      if (category) {
        getOrCreateMeta('article:section').setAttribute('content', category);
      }
    }

    // Video-specific tags for TV programs
    if (type === 'article' && programTitle && programStartTime && programEndTime) {
      getOrCreateMeta('og:type').setAttribute('content', 'video.tv_show');
      if (channelName) {
        getOrCreateMeta('video:series').setAttribute('content', channelName);
      }
      if (programStartTime) {
        getOrCreateMeta('video:release_date').setAttribute('content', programStartTime);
      }
      if (category) {
        getOrCreateMeta('video:tag', 'name').setAttribute('content', category);
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

    // Structured Data (JSON-LD) - Multiple schemas
    const structuredDataArray: any[] = [];

    if (type === 'article' && programTitle && programStartTime && programEndTime) {
      const siteUrl = window.location.origin;
      const fallbackChannelUrl = channelUrl || '/';
      const channelSameAs = getChannelSameAs(channelUrl, channelName);
      structuredDataArray.push(
        ...buildProgramGraph({
          siteUrl,
          fullUrl,
          title: programTitle,
          description,
          image: ogImage,
          category,
          startTime: programStartTime,
          endTime: programEndTime,
          channelName: channelName || 'Chaîne TV',
          channelUrl: fallbackChannelUrl,
          channelSameAs,
        })
      );
    } else if (channelName && type !== 'website') {
      // TVChannel for channel pages
      structuredDataArray.push({
        '@context': 'https://schema.org',
        '@type': 'TVChannel',
        name: channelName,
        description: description,
        url: fullUrl,
      });
    } else if (category) {
      // Category page - CollectionPage with ItemList
      structuredDataArray.push({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        description: description,
        url: fullUrl,
        about: {
          '@type': 'Thing',
          name: category,
        },
      });
    } else {
      // WebPage for other pages
      structuredDataArray.push({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: title,
        description: description,
        url: fullUrl,
      });
    }

    // Remove only scripts managed by this hook, without touching external JSON-LD
    const oldScripts = document.querySelectorAll('script[type="application/ld+json"][data-seo-managed="1"]');
    oldScripts.forEach(script => script.remove());

    // Add new structured data
    structuredDataArray.forEach(data => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo-managed', '1');
      script.textContent = JSON.stringify(data);
      document.head.appendChild(script);
    });

    // Cleanup function
    return () => {
      // Note: We don't remove meta tags on cleanup as they should persist
      // until the next page navigation updates them
    };
  }, [title, description, image, url, canonicalUrl, type, publishedTime, channelName, programTitle, programStartTime, programEndTime, category, noindex, channelUrl]);
};
