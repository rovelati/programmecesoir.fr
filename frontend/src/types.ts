
export interface Program {
  id: string;
  title: string;
  startTime: string; // ISO format
  endTime: string;   // ISO format
  category: string;
  description: string;
  posterUrl?: string;
  replayUrl?: string;
  isLive?: boolean;
}

export interface Channel {
  id: string;
  name: string;
  number: number;
  logo: string;
  type: 'Generalista' | 'Tematico' | 'Film' | 'Sport' | 'News' | 'Radio';
  programs: Program[];
  color?: string; // Optional branding color
  isRadio?: boolean; // Flag to identify radio stations
  streamUrl?: string; // Official stream URL for radio stations
  website?: string; // Official website URL
}

export type TimeSlotFilter = 'Tous' | 'Films' | 'Info' | 'Documentaires' | 'Divertissement' | 'Series' | 'Sport' | 'Jeunesse' | 'Culture';
export type TimeView = 'now' | 'tonight' | 'tomorrow';

export type ChannelViewMode = 'aujourdhui' | 'maintenant' | 'ce-soir' | 'demain';

export type PageState =
  | { type: 'home'; category?: TimeSlotFilter }
  | { type: 'channel'; channelId: string; subView: TimeView; channelViewMode?: ChannelViewMode }
  | { type: 'program'; channelId: string; programId: string; programDate?: string; channelSlug?: string; programSlug?: string; programAiringToken?: string }
  | { type: 'program-loading'; channelSlug: string; programSlug: string; programAiringToken?: string }
  | { type: 'birthday'; slug?: string }
  | { type: 'birthday-archive' }
  | { type: 'news' }
  | { type: 'entity-index'; entityType: 'film' | 'series' | 'actor' }
  | { type: 'entity'; entityType: 'film' | 'series' | 'actor'; slug: string }
  | { type: 'admin-test' }
  | { type: 'admin-url-inspection' }
  | { type: 'recommender' }
  | { type: 'search'; query: string }
  | { type: 'notfound'; notFoundType: 'program' | 'channel'; channelSlug?: string; programSlug?: string; programAiringToken?: string }
  | { type: 'cookie-policy' }
  | { type: 'terms' }
  | { type: 'credits' };
