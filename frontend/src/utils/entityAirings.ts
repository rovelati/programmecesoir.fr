import type { EntityAiring } from '../types/entities';

const toTimestamp = (value?: string | null) => {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
};

export const filterActiveEntityAirings = <T extends EntityAiring>(airings: T[] | null | undefined, now = new Date()): T[] => {
  if (!Array.isArray(airings) || airings.length === 0) {
    return [];
  }

  const nowTs = now.getTime();
  return airings.filter((airing) => {
    const endTs = toTimestamp(airing.endTime);
    const startTs = toTimestamp(airing.startTime);

    if (!Number.isNaN(endTs)) {
      return endTs >= nowTs;
    }

    if (!Number.isNaN(startTs)) {
      return startTs >= nowTs;
    }

    return false;
  });
};
