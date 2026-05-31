/**
 * Official radio stream URLs for Italian radio stations
 * These are public, official streams provided by the radio stations
 */

export interface RadioStream {
  streamUrl: string;
  website?: string;
}

// Mapping of radio channel IDs/names to their official stream URLs
export const RADIO_STREAMS: Record<string, RadioStream> = {
  // Rai Radio
  'rai-radio-1': {
    streamUrl: 'https://icestreaming.rai.it/1.mp3',
    website: 'https://www.raiplayradio.it/radio1'
  },
  'rai-radio-2': {
    streamUrl: 'https://icestreaming.rai.it/2.mp3',
    website: 'https://www.raiplayradio.it/radio2'
  },
  'rai-radio-3': {
    streamUrl: 'https://icestreaming.rai.it/3.mp3',
    website: 'https://www.raiplayradio.it/radio3'
  },
  'radio-rai-1': {
    streamUrl: 'https://icestreaming.rai.it/1.mp3',
    website: 'https://www.raiplayradio.it/radio1'
  },
  'radio-rai-2': {
    streamUrl: 'https://icestreaming.rai.it/2.mp3',
    website: 'https://www.raiplayradio.it/radio2'
  },
  'radio-rai-3': {
    streamUrl: 'https://icestreaming.rai.it/3.mp3',
    website: 'https://www.raiplayradio.it/radio3'
  },
  'rai-radio-tre': {
    streamUrl: 'https://icestreaming.rai.it/3.mp3',
    website: 'https://www.raiplayradio.it/radio3'
  },
  
  // Radio Deejay
  'radio-deejay': {
    streamUrl: 'https://streamingv2.shoutcast.com/RadioDeejay',
    website: 'https://www.deejay.it/'
  },
  'deejay': {
    streamUrl: 'https://streamingv2.shoutcast.com/RadioDeejay',
    website: 'https://www.deejay.it/'
  },
  
  // RTL 102.5
  'rtl-1025': {
    streamUrl: 'https://streamingv2.shoutcast.com/rtl1025',
    website: 'https://www.rtl.it/'
  },
  'rtl-102-5': {
    streamUrl: 'https://streamingv2.shoutcast.com/rtl1025',
    website: 'https://www.rtl.it/'
  },
  
  // Radio Italia
  'radio-italia': {
    streamUrl: 'https://radioitaliasmi.akamaized.net/hls/live/2033128/radioitaliasmi/master.m3u8',
    website: 'https://www.radioitalia.it/'
  },
  
  // Virgin Radio
  'virgin-radio': {
    streamUrl: 'https://radio.virginradio.it/stream',
    website: 'https://www.virginradio.it/'
  },
  
  // Radio 105
  'radio-105': {
    streamUrl: 'https://streamingv2.shoutcast.com/Radio105',
    website: 'https://www.105.net/'
  },
  
  // Radio Monte Carlo
  'radio-monte-carlo': {
    streamUrl: 'https://streamingv2.shoutcast.com/rmc',
    website: 'https://www.rmc.it/'
  },
  'rmc': {
    streamUrl: 'https://streamingv2.shoutcast.com/rmc',
    website: 'https://www.rmc.it/'
  },
  
  // Radio Kiss Kiss
  'radio-kiss-kiss': {
    streamUrl: 'https://streamingv2.shoutcast.com/kisskiss',
    website: 'https://www.kisskiss.it/'
  },
  'kiss-kiss': {
    streamUrl: 'https://streamingv2.shoutcast.com/kisskiss',
    website: 'https://www.kisskiss.it/'
  },
  
  // Radio Capital
  'radio-capital': {
    streamUrl: 'https://streamingv2.shoutcast.com/capital',
    website: 'https://www.capital.it/'
  },
  'capital': {
    streamUrl: 'https://streamingv2.shoutcast.com/capital',
    website: 'https://www.capital.it/'
  },
  
  // Radio m2o
  'radio-m2o': {
    streamUrl: 'https://streamingv2.shoutcast.com/m2o',
    website: 'https://www.m2o.it/'
  },
  'm2o': {
    streamUrl: 'https://streamingv2.shoutcast.com/m2o',
    website: 'https://www.m2o.it/'
  },
};

/**
 * Check if a channel is a radio station
 */
export const isRadioChannel = (channelId: string, channelName: string): boolean => {
  const id = channelId.toLowerCase();
  const name = channelName.toLowerCase();
  
  // Check by ID
  if (id.includes('radio') || id.includes('rai-radio') || id.includes('radio-rai')) {
    return true;
  }
  
  // Check by name
  if (name.includes('radio') && !name.includes('television')) {
    return true;
  }
  
  // Check if it's in our radio streams list
  if (RADIO_STREAMS[id] || RADIO_STREAMS[name]) {
    return true;
  }
  
  return false;
};

/**
 * Get radio stream URL for a channel
 */
export const getRadioStreamUrl = (channelId: string, channelName: string): RadioStream | null => {
  const id = channelId.toLowerCase();
  const name = channelName.toLowerCase();
  
  // Try exact match by ID
  if (RADIO_STREAMS[id]) {
    return RADIO_STREAMS[id];
  }
  
  // Try exact match by name
  if (RADIO_STREAMS[name]) {
    return RADIO_STREAMS[name];
  }
  
  // Try partial match
  for (const [key, stream] of Object.entries(RADIO_STREAMS)) {
    if (id.includes(key) || name.includes(key) || key.includes(id) || key.includes(name)) {
      return stream;
    }
  }
  
  return null;
};
