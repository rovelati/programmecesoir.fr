/**
 * Get current date in Europe/Paris timezone as YYYY-MM-DD string
 */
export const getTodayInParis = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Paris',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    return `${year}-${month}-${day}`;
};

/**
 * Get current Date object (browser local time)
 */
export const getNowInParis = () => {
    return new Date();
};

/**
 * Returns the current time slot based on Paris time
 * - aujourdhui: 06:00 - 17:59
 * - ce-soir: 18:00 - 23:59
 * - nuit: 00:00 - 05:59
 */
export const getCurrentTimeSlot = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Paris',
        hour: '2-digit',
        hour12: false
    });
    const hour = parseInt(formatter.format(now));

    if (hour >= 6 && hour < 18) return 'aujourdhui';
    if (hour >= 18 && hour <= 23) return 'ce-soir';
    return 'nuit';
};

export const getTimeSlotLabel = (slot) => {
    switch (slot) {
        case 'aujourdhui': return "Aujourd'hui";
        case 'ce-soir': return 'Ce soir';
        case 'nuit': return 'Nuit';
        default: return "Aujourd'hui";
    }
};

export const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
};
