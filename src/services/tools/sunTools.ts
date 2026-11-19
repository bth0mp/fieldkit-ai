import { ToolCall } from './types';
import { positionOf } from './coordinateTools';
import { moonDay } from './moonTools';

/**
 * sun_times: sunrise, sunset, solar noon and civil twilight for a place and a date, worked out on the phone.
 *
 * The sun's position is NOAA's short series (the one behind its solar calculator, after Meeus). Sunrise and
 * sunset are when the sun's centre is 0.833 degrees below a level horizon (refraction plus the sun's radius);
 * civil twilight ends at 6 degrees below. Against the US Naval Observatory it is within a minute, two where
 * the sun only grazes the horizon; it knows nothing of a real skyline of hills.
 *
 * The answer ends with the moon: its phase at solar noon, and its risings and settings that day (moonTools).
 */
const RAD = Math.PI / 180;
const MINUTE_MS = 60000;
const HOUR_MS = 3600000;
const DAY_MS = 86400000;
const SUNRISE_ZENITH = 90.833;
const CIVIL_ZENITH = 96;
/** Passes over an event's time. Each uses the sun's position at the time the last one found. */
const ROUNDS = 5;
/** Solar noon falls inside these clock hours in every real time zone. Outside them the offset is not the place's. */
const NOON_EARLIEST_MIN = 10 * 60;
const NOON_LATEST_MIN = 15 * 60 + 30;

/** Where the sun is at an instant: its declination in degrees and the equation of time in minutes. */
function sunAt(ms: number): { declination: number; equationOfTime: number } {
  const century = (ms / DAY_MS + 2440587.5 - 2451545) / 36525;
  const meanLongitude = (280.46646 + century * (36000.76983 + century * 0.0003032)) * RAD;
  const meanAnomaly = (357.52911 + century * (35999.05029 - 0.0001537 * century)) * RAD;
  const eccentricity = 0.016708634 - century * (0.000042037 + 0.0000001267 * century);
  const centre = Math.sin(meanAnomaly) * (1.914602 - century * (0.004817 + 0.000014 * century))
    + Math.sin(2 * meanAnomaly) * (0.019993 - 0.000101 * century)
    + Math.sin(3 * meanAnomaly) * 0.000289;
  const node = (125.04 - 1934.136 * century) * RAD;
  const apparentLongitude = meanLongitude + (centre - 0.00569 - 0.00478 * Math.sin(node)) * RAD;
  const meanObliquity = 23 + (26 + (21.448 - century * (46.815 + century * (0.00059 - century * 0.001813))) / 60) / 60;
  const obliquity = (meanObliquity + 0.00256 * Math.cos(node)) * RAD;
  const y = Math.tan(obliquity / 2) ** 2;
  const equationOfTime = 4 * (y * Math.sin(2 * meanLongitude)
    - 2 * eccentricity * Math.sin(meanAnomaly)
    + 4 * eccentricity * y * Math.sin(meanAnomaly) * Math.cos(2 * meanLongitude)
    - 0.5 * y * y * Math.sin(4 * meanLongitude)
    - 1.25 * eccentricity ** 2 * Math.sin(2 * meanAnomaly)) / RAD;
  return { declination: Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude)) / RAD, equationOfTime };
}

/**
 * The moon at an instant: how much of its face is lit, and whether that is growing (Meeus, Astronomical
 * Algorithms, chapter 48). Good to about a point in a hundred.
 */
function moonPhrase(ms: number): string {
  const century = (ms / DAY_MS + 2440587.5 - 2451545) / 36525;
  const elongation = (297.8501921 + 445267.1114034 * century) * RAD;
  const sunAnomaly = (357.5291092 + 35999.0502909 * century) * RAD;
  const moonAnomaly = (134.9633964 + 477198.8675055 * century) * RAD;
  const phaseAngle = 180 - elongation / RAD
    - 6.289 * Math.sin(moonAnomaly) + 2.1 * Math.sin(sunAnomaly) - 1.274 * Math.sin(2 * elongation - moonAnomaly)
    - 0.658 * Math.sin(2 * elongation) - 0.214 * Math.sin(2 * moonAnomaly) - 0.11 * Math.sin(elongation);
  const percent = Math.round(((1 + Math.cos(phaseAngle * RAD)) / 2) * 100);
  // The phase angle runs from 180 (new) down to 0 (full) while the moon waxes, and back up while it wanes.
  const waxing = (((180 - phaseAngle) % 360) + 360) % 360 < 180;
  const shape = percent < 50 ? 'crescent' : 'gibbous';
  const name = percent <= 1 ? 'new moon' : percent >= 99 ? 'full moon' : `${waxing ? 'waxing' : 'waning'} ${shape}`;
  return ` Moon: ${name}, ${percent}% lit.`;
}

type Place = { lat: number; lon: number };
/** The instant the sun crosses a zenith angle, or which side of it the sun stays on. */
type Crossing = number | 'above' | 'below';

/**
 * When the sun is on the meridian (`side` 0, solar noon) or crosses `zenith` in the morning (-1) or evening (+1)
 * of the UTC day starting at `dayStart`. Whether a crossing exists at all is judged only at the time finally
 * found: near the start and end of the midnight sun the sun's position at noon gives the wrong answer.
 */
function crossing(place: Place, dayStart: number, pass: { side: -1 | 0 | 1; zenith: number }): Crossing {
  let instant = dayStart + DAY_MS / 2;
  for (let round = 0; round < ROUNDS; round++) {
    const { declination, equationOfTime } = sunAt(instant);
    let hourAngle = 0;
    if (pass.side !== 0) {
      const cosine = (Math.cos(pass.zenith * RAD) - Math.sin(place.lat * RAD) * Math.sin(declination * RAD))
        / (Math.cos(place.lat * RAD) * Math.cos(declination * RAD));
      if (round === ROUNDS - 1 && cosine < -1) return 'above';
      if (round === ROUNDS - 1 && cosine > 1) return 'below';
      hourAngle = Math.acos(Math.max(-1, Math.min(1, cosine))) / RAD;
    }
    instant = dayStart + (720 - 4 * (place.lon - pass.side * hourAngle) - equationOfTime) * MINUTE_MS;
  }
  return instant;
}

const solarNoon = (place: Place, dayStart: number) => crossing(place, dayStart, { side: 0, zenith: 0 }) as number;
const isBlank = (raw: unknown) => raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
const pad = (value: number) => String(value).padStart(2, '0');

type Day = { year: number; month: number; day: number };

function readDay(raw: unknown): Day {
  const match = typeof raw === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim()) : null;
  const [year, month, day] = match ? match.slice(1).map(Number) : [0, 0, 0];
  const made = new Date(Date.UTC(year, month - 1, day));
  if (!match || year < 1900 || year > 2100 || made.getUTCMonth() !== month - 1 || made.getUTCDate() !== day) {
    throw new Error('Date must be YYYY-MM-DD, between 1900 and 2100. Leave it out for today.');
  }
  return { year, month, day };
}

function readOffset(raw: unknown): number {
  const text = typeof raw === 'string' ? raw.trim() : '';
  const hours = typeof raw === 'number' ? raw : Number(/^[+-]?\d+(\.\d+)?$/.test(text) ? text : Number.NaN);
  if (!Number.isFinite(hours) || Math.abs(hours) > 14) {
    throw new Error('utc_offset must be a number of hours between -14 and 14, for example -5 or 5.5');
  }
  return hours;
}

/**
 * The day asked about and the clock the times are shown in. Left out, the offset is the phone's own on that
 * day (summer and winter differ), and the day is today: in the zone asked for if one was, else the phone's.
 */
function readWhen(args: { date?: unknown; utc_offset?: unknown }, now: Date): { day: Day; offsetMs: number } {
  const given = isBlank(args.utc_offset) ? null : readOffset(args.utc_offset) * HOUR_MS;
  const there = new Date(now.getTime() + (given ?? 0));
  const today = given === null
    ? { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
    : { year: there.getUTCFullYear(), month: there.getUTCMonth() + 1, day: there.getUTCDate() };
  const day = isBlank(args.date) ? today : readDay(args.date);
  const phoneOffsetMs = -new Date(day.year, day.month - 1, day.day, 12).getTimezoneOffset() * MINUTE_MS;
  return { day, offsetMs: given ?? phoneOffsetMs };
}

function zoneName(offsetMs: number): string {
  const minutes = Math.round(Math.abs(offsetMs) / MINUTE_MS);
  return `UTC${offsetMs < 0 ? '-' : '+'}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

type Events = { noon: number; rise: Crossing; set: Crossing; dawn: Crossing; dusk: Crossing };
/** Formats an instant as a clock time in the zone shown, and gives its minute count for sums. */
type Clock = { (instant: number): string; minute: (instant: number) => number };

function describe({ noon, rise, set, dawn, dusk }: Events, clock: Clock): string {
  const twilightTimes = typeof dawn === 'number' && typeof dusk === 'number';
  if (typeof rise === 'number' && typeof set === 'number') {
    const minutes = clock.minute(set) - clock.minute(rise);
    const daylight = `Daylight ${Math.floor(minutes / 60)} h ${minutes % 60} min.`;
    const day = `sunrise ${clock(rise)}, solar noon ${clock(noon)}, sunset ${clock(set)}`;
    if (!twilightTimes) return `${day}. It does not get darker than civil twilight tonight. ${daylight}`;
    return `civil dawn ${clock(dawn)}, ${day}, civil dusk ${clock(dusk)}. ${daylight}`;
  }
  if (rise === 'below' || set === 'below') {
    if (twilightTimes) return `the sun stays below the horizon all day: civil dawn ${clock(dawn)}, solar noon ${clock(noon)}, civil dusk ${clock(dusk)}.`;
    const twilight = dawn === 'above' || dusk === 'above' ? 'and it is civil twilight all day' : 'with no civil twilight';
    return `the sun stays below the horizon all day, ${twilight}.`;
  }
  // The first and last days of the midnight sun: the sun dips below the horizon once, for under an hour.
  if (typeof rise === 'number') return `sunrise ${clock(rise)}, solar noon ${clock(noon)}, and no sunset: the sun stays up through the night.`;
  if (typeof set === 'number') return `the sun is up from the night before, with no sunrise this day; solar noon ${clock(noon)}, sunset ${clock(set)}.`;
  return `the sun is up all day, with no sunrise or sunset. Its highest point, solar noon ${clock(noon)}.`;
}

/** " Moonset 13:42, moonrise 22:28." for the 24 hours from `start`, saying which of the two a day lacks. */
function moonEvents(place: Place, start: number, clock: Clock): string {
  const { events, up } = moonDay(place, start);
  if (events.length === 0) return up ? ' The moon is up all day.' : ' The moon is below the horizon all day.';
  const said = events.map(event => `${event.rises ? 'moonrise' : 'moonset'} ${clock(event.at)}`);
  if (events.every(event => !event.rises)) said.push('no moonrise this day');
  if (events.every(event => event.rises)) said.push('no moonset this day');
  const sentence = said.join(', ');
  return ` ${sentence[0].toUpperCase()}${sentence.slice(1)}.`;
}

export function sunTimes(call: ToolCall, now: Date = new Date()): string {
  const { position: rawPosition } = call.arguments;
  if (typeof rawPosition !== 'string' || !rawPosition.trim()) throw new Error('Missing required parameter: position');
  const place = positionOf(rawPosition);
  const { day, offsetMs } = readWhen(call.arguments, now);
  const midnight = Date.UTC(day.year, day.month - 1, day.day);

  // The solar day asked for is the one whose noon falls nearest midday on that date in the zone shown.
  const middayThere = midnight + DAY_MS / 2 - offsetMs;
  const dayStart = [-1, 0, 1]
    .map(shift => midnight + shift * DAY_MS)
    .reduce((best, start) => (Math.abs(solarNoon(place, start) - middayThere) < Math.abs(solarNoon(place, best) - middayThere) ? start : best));

  const minute = (instant: number) => Math.round((instant + offsetMs) / MINUTE_MS);
  /** "07:23", with "(+1 day)" when the event falls on another date in the zone shown. */
  const clock: Clock = Object.assign((instant: number) => {
    const shown = minute(instant) * MINUTE_MS;
    const days = Math.floor(shown / DAY_MS) - midnight / DAY_MS;
    const other = days === 0 ? '' : ` (${days > 0 ? '+' : '-'}${Math.abs(days)} day)`;
    return `${pad(new Date(shown).getUTCHours())}:${pad(new Date(shown).getUTCMinutes())}${other}`;
  }, { minute });

  const pass = (side: -1 | 1, zenith: number) => crossing(place, dayStart, { side, zenith });
  const noon = solarNoon(place, dayStart);
  const events = { noon, rise: pass(-1, SUNRISE_ZENITH), set: pass(1, SUNRISE_ZENITH), dawn: pass(-1, CIVIL_ZENITH), dusk: pass(1, CIVIL_ZENITH) };

  const zone = zoneName(offsetMs);
  const noonMinute = ((minute(noon) % 1440) + 1440) % 1440;
  const elsewhere = noonMinute < NOON_EARLIEST_MIN || noonMinute > NOON_LATEST_MIN
    ? ` These are ${zone} clock times, not this place's own local time, and its date there may differ. Give utc_offset for the place to get its local times.`
    : '';
  const head = `Sun at ${place.lat.toFixed(5)}, ${place.lon.toFixed(5)} on ${day.year}-${pad(day.month)}-${pad(day.day)} (${zone}): `;
  // The moon's events are those whose time, to the minute, is inside the calendar day asked about on the clock
  // shown. The day is counted from half a minute before its midnight, so a rising at 23:59:50 is 00:00 of the
  // next day, where the Naval Observatory lists it too, and not "00:00 (+1 day)" here and missing there.
  // ponytail: with utc_offset left out, the day is 24 hours on the phone's offset at noon. On the two days a year
  // the clocks change, a moon event in the hour gained or lost lands in neither day or in both (about one day
  // in eight years at a place). Use the real local day and per-event offsets if that ever matters.
  const moonDayStart = midnight - offsetMs - MINUTE_MS / 2;
  return `${head}${describe(events, clock)}${moonPhrase(noon)}${moonEvents(place, moonDayStart, clock)}${elsewhere}`;
}
