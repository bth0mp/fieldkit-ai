/**
 * Calendar times as the model writes them (ISO 8601) and as people read them ("Fri 6 Nov 14:00-14:30").
 * Pure: local time comes from the device's own Date, so no locale data or date library is needed.
 */

const ISO_8601 = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Minutes east of UTC for a `Z`, `+02`, `+0200` or `-05:30` suffix. */
function offsetMinutes(zone: string): number {
  if (zone === 'Z') return 0;
  const sign = zone.startsWith('-') ? -1 : 1;
  const digits = zone.slice(1).replace(':', '');
  return sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || 0));
}

/**
 * Epoch ms for an ISO 8601 date or date-time, or null when the text is not one (or names a day or time that
 * does not exist). A date or a time without an offset is local time: "2026-11-06" is local midnight.
 */
export function parseIsoTime(text: unknown): number | null {
  if (typeof text !== 'string') return null;
  const match = ISO_8601.exec(text.trim());
  if (!match) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0', frac = '', zone] = match;
  const [year, month, day, hour, minute, second] = [y, mo, d, h, mi, s].map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const ms = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;
  if (zone) return Date.UTC(year, month - 1, day, hour, minute, second, ms) - offsetMinutes(zone) * 60_000;
  return new Date(year, month - 1, day, hour, minute, second, ms).getTime();
}

const pad = (n: number): string => String(n).padStart(2, '0');

function dayText(date: Date, utc: boolean): string {
  const weekday = utc ? date.getUTCDay() : date.getDay();
  const dayOfMonth = utc ? date.getUTCDate() : date.getDate();
  const month = utc ? date.getUTCMonth() : date.getMonth();
  return `${WEEKDAYS[weekday]} ${dayOfMonth} ${MONTHS[month]}`;
}

const clockText = (date: Date): string => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/**
 * "Fri 6 Nov 14:00-14:30" in local time; an event that ends on a later day names both days
 * ("Fri 6 Nov 22:00-Sat 7 Nov 01:00"). An all-day event has an exclusive end: "Fri 6 Nov, all day", or
 * "Fri 6 Nov-Sun 8 Nov, all day". The calendar stores one as UTC midnights, so its days are read in UTC
 * (the default); one the model asks for ("2026-11-06", which parses to local midnight) is read in local days.
 */
export function formatEventTime(event: { begin: number; end: number; allDay?: boolean }, allDayIn: 'utc' | 'local' = 'utc'): string {
  const begin = new Date(event.begin);
  if (event.allDay) {
    const last = new Date(Math.max(event.begin, event.end - 1));
    const utc = allDayIn === 'utc';
    const first = dayText(begin, utc);
    const lastDay = dayText(last, utc);
    return first === lastDay ? `${first}, all day` : `${first}-${lastDay}, all day`;
  }
  const end = new Date(event.end);
  const endDay = dayText(end, false);
  const endDayPrefix = dayText(begin, false) === endDay ? '' : `${endDay} `;
  return `${dayText(begin, false)} ${clockText(begin)}-${endDayPrefix}${clockText(end)}`;
}
