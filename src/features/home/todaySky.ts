/**
 * Today's sunrise, sunset and moonrise for the home place, as the phone's clock shows them. The sun and moon
 * come from the same calculators as the sun_times tool, so Home and the assistant print the same minutes.
 */
import { sunCrossings } from '../../services/tools/sunTools';
import { moonDay } from '../../services/tools/moonTools';

export interface TodaySky {
  sunrise: string | null;
  sunset: string | null;
  /** Set when the sun has no rising or setting today: it stays up, or stays down, all day. */
  sunAllDay: 'up' | 'down' | null;
  moonrise: string | null;
}

const MINUTE_MS = 60000;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "07:28": the instant on the phone's clock on the day of `now`, rounded to the nearest minute. */
function clock(instant: number, now: Date): string {
  const offsetMs = -new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTimezoneOffset() * MINUTE_MS;
  const shown = new Date(Math.round((instant + offsetMs) / MINUTE_MS) * MINUTE_MS);
  return `${String(shown.getUTCHours()).padStart(2, '0')}:${String(shown.getUTCMinutes()).padStart(2, '0')}`;
}

export function todaySky(place: { lat: number; lon: number }, now: Date): TodaySky {
  const { rise, set, moonStart } = sunCrossings(place, now);
  const time = (crossing: number | 'above' | 'below') => (typeof crossing === 'number' ? clock(crossing, now) : null);
  // On the first and last days of the midnight sun only one of the two is missing, so a time still shows.
  const none = typeof rise !== 'number' && typeof set !== 'number';
  const sunAllDay = !none ? null : rise === 'below' || set === 'below' ? 'down' : 'up';
  const moonrise = moonDay(place, moonStart).events.find((event) => event.rises);
  return {
    sunrise: time(rise),
    sunset: time(set),
    sunAllDay,
    moonrise: moonrise ? clock(moonrise.at, now) : null,
  };
}

/** "Sat 21 Nov". */
export function formatDay(now: Date): string {
  return `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;
}
