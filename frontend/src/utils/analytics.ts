/**
 * Google Analytics 4 utility functions
 */

declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
  }
}

const GA4_ID = 'G-ZQ67HN31M1';
let lastTrackedPath: string | null = null;

/**
 * Track a page view
 */
export const trackPageView = (url: string, title?: string) => {
  if (typeof window !== 'undefined' && window.gtag) {
    if (lastTrackedPath === url) return;
    lastTrackedPath = url;
    window.gtag('event', 'page_view', {
      page_path: url,
      page_title: title,
      page_location: window.location.href,
      send_to: GA4_ID,
    });
  }
};

/**
 * Track a custom event
 */
export const trackEvent = (
  eventName: string,
  eventParams?: {
    [key: string]: any;
  }
) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, eventParams);
  }
};

/**
 * Track program view
 */
export const trackProgramView = (programTitle: string, channelName: string) => {
  trackEvent('view_program', {
    program_title: programTitle,
    channel_name: channelName,
  });
};

/**
 * Track channel view
 */
export const trackChannelView = (channelName: string, viewMode: string) => {
  trackEvent('view_channel', {
    channel_name: channelName,
    view_mode: viewMode,
  });
};

/**
 * Track program click
 */
export const trackProgramClick = (programTitle: string, channelName: string) => {
  trackEvent('click_program', {
    program_title: programTitle,
    channel_name: channelName,
  });
};

/**
 * Track channel click
 */
export const trackChannelClick = (channelName: string) => {
  trackEvent('click_channel', {
    channel_name: channelName,
  });
};

/**
 * Track filter change
 */
export const trackFilterChange = (filterName: string) => {
  trackEvent('change_filter', {
    filter_name: filterName,
  });
};

/**
 * Track search
 */
export const trackSearch = (searchTerm: string) => {
  trackEvent('search', {
    search_term: searchTerm,
  });
};

/**
 * Track recommender usage
 */
export const trackRecommender = () => {
  trackEvent('use_recommender');
};

/**
 * Track save reminder
 */
export const trackSaveReminder = (programTitle: string, channelName: string) => {
  trackEvent('save_reminder', {
    program_title: programTitle,
    channel_name: channelName,
  });
};

/**
 * Track scroll depth
 */
export const trackScrollDepth = (percent: number, pagePath?: string) => {
  trackEvent('scroll_depth', {
    percent,
    page_path: pagePath || window.location.pathname,
  });
};
