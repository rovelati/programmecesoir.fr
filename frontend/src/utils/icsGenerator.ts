/**
 * Utility functions for generating iCalendar (.ics) files
 */

interface ICSOptions {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location: string;
  url: string;
  reminderMinutes?: number;
}

/**
 * Generate an iCalendar (.ics) file content
 */
export const generateICS = (options: ICSOptions): string => {
  const {
    title,
    description,
    startTime,
    endTime,
    location,
    url,
    reminderMinutes = 15
  } = options;

  // Format date to ICS format (YYYYMMDDTHHmmssZ)
  const formatICSDate = (date: Date): string => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
  };

  // Generate unique UID
  const uid = `programmecesoir-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@programmecesoir.fr`;

  // Calculate reminder time (15 minutes before start)
  const reminderTime = new Date(startTime);
  reminderTime.setMinutes(reminderTime.getMinutes() - reminderMinutes);

  // Escape text for ICS format
  const escapeICS = (text: string): string => {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '');
  };

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ProgrammeCeSoir//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatICSDate(new Date())}`,
    `DTSTART:${formatICSDate(startTime)}`,
    `DTEND:${formatICSDate(endTime)}`,
    `SUMMARY:${escapeICS(title)}`,
    `DESCRIPTION:${escapeICS(description)}\\n\\nLink: ${url}`,
    `LOCATION:${escapeICS(location)}`,
    `URL:${url}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeICS(`Rappel : ${title} dans 15 minutes sur ${location}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  return icsContent;
};

/**
 * Download ICS file
 */
export const downloadICS = (options: ICSOptions, filename?: string): void => {
  const icsContent = generateICS(options);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `${options.title.replace(/[^a-z0-9]/gi, '_')}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Generate Google Calendar web URL (alternative for mobile)
 */
export const generateGoogleCalendarUrl = (options: ICSOptions): string => {
  const formatGoogleDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: options.title,
    dates: `${formatGoogleDate(options.startTime)}/${formatGoogleDate(options.endTime)}`,
    details: `${options.description}\n\nLink: ${options.url}`,
    location: options.location,
    sf: 'true',
    output: 'xml',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

/**
 * Open Google Calendar web (for mobile devices)
 */
export const openGoogleCalendar = (options: ICSOptions): void => {
  const url = generateGoogleCalendarUrl(options);
  window.open(url, '_blank');
};
