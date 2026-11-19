/**
 * When the moon rises and sets on one day, for sun_times, worked out on the phone.
 *
 * Where the moon is: the largest terms of the series in Meeus, Astronomical Algorithms, chapter 47 (every term
 * of at least a hundredth of a degree in longitude, and the ten largest in latitude), which places it to a few
 * hundredths of a degree. It rises or sets when its upper edge is on a level horizon: refraction lifts it 34 arc
 * minutes, and its parallax, less its own radius, puts its centre about an eighth of a degree above the true
 * horizon at that moment. Like the sun's times, these know nothing of a real skyline of hills.
 *
 * Against the US Naval Observatory, 434 risings and settings (1900 to 2100, from the equator to 78 degrees north
 * and south, 241 picked by the author and 193 by an independent reviewer) all came out within a minute, with no
 * event missing or extra. The exception is a moon that only grazes the horizon, up or down for under about half
 * an hour, which happens at high latitudes: there the series' few hundredths of a degree move the times by two
 * to five minutes, and a brief rising and setting can be missed or reported where the Observatory has none.
 * A pair less than two minutes apart can also fall between two looks at the sky.
 */
const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const EARTH_RADIUS_KM = 6378.14;
/** How often the moon's height is looked at across the day. It climbs or sinks a quarter of a degree a minute at most. */
const STEP_MS = 120000;
/** A crossing is narrowed down to this. */
const NEAR_ENOUGH_MS = 1000;

/** A term of a series: its size, then how many times D, M, M' and F (Meeus's names) go into its angle. */
type Term = readonly [number, number, number, number, number];

/** Degrees of ecliptic longitude. */
const LONGITUDE: readonly Term[] = [
  [6.288774, 0, 0, 1, 0], [1.274027, 2, 0, -1, 0], [0.658314, 2, 0, 0, 0], [0.213618, 0, 0, 2, 0],
  [-0.185116, 0, 1, 0, 0], [-0.114332, 0, 0, 0, 2], [0.058793, 2, 0, -2, 0], [0.057066, 2, -1, -1, 0],
  [0.053322, 2, 0, 1, 0], [0.045758, 2, -1, 0, 0], [-0.040923, 0, 1, -1, 0], [-0.03472, 1, 0, 0, 0],
  [-0.030383, 0, 1, 1, 0], [0.015327, 2, 0, 0, -2], [-0.012528, 0, 0, 1, 2], [0.01098, 0, 0, 1, -2],
  [0.010675, 4, 0, -1, 0], [0.010034, 0, 0, 3, 0],
];
/** Degrees of ecliptic latitude. */
const LATITUDE: readonly Term[] = [
  [5.128122, 0, 0, 0, 1], [0.280602, 0, 0, 1, 1], [0.277693, 0, 0, 1, -1], [0.173237, 2, 0, 0, -1],
  [0.055413, 2, 0, -1, 1], [0.046271, 2, 0, -1, -1], [0.032573, 2, 0, 0, 1], [0.017198, 0, 0, 2, 1],
  [0.009266, 2, 0, 1, -1], [0.008822, 0, 0, 2, -1],
];
/** Kilometres from the mean distance. */
const DISTANCE: readonly Term[] = [
  [-20905.355, 0, 0, 1, 0], [-3699.111, 2, 0, -1, 0], [-2955.968, 2, 0, 0, 0], [-569.925, 0, 0, 2, 0],
];

const series = (terms: readonly Term[], [d, m, mm, f]: number[], wave: (angle: number) => number) =>
  terms.reduce((total, [size, byD, byM, byMm, byF]) => total + size * wave(byD * d + byM * m + byMm * mm + byF * f), 0);

/** Days since noon on 1 January 2000, the epoch the series count from. */
const daysSince2000 = (ms: number) => ms / DAY_MS + 2440587.5 - 2451545;

/** Where the moon is at an instant, seen from the Earth's centre, in radians. */
function moonAt(ms: number): { rightAscension: number; declination: number; parallax: number } {
  const century = daysSince2000(ms) / 36525;
  const meanLongitude = 218.3164477 + century * (481267.88123421 - 0.0015786 * century);
  const angles = [
    297.8501921 + century * (445267.1114034 - 0.0018819 * century),
    357.5291092 + century * (35999.0502909 - 0.0001536 * century),
    134.9633964 + century * (477198.8675055 + 0.0087414 * century),
    93.272095 + century * (483202.0175233 - 0.0036539 * century),
  ].map(degrees => degrees * RAD);
  const longitude = (meanLongitude + series(LONGITUDE, angles, Math.sin)) * RAD;
  const latitude = series(LATITUDE, angles, Math.sin) * RAD;
  const distanceKm = 385000.56 + series(DISTANCE, angles, Math.cos);
  const obliquity = (23.4392911 - 0.0130042 * century) * RAD;
  return {
    rightAscension: Math.atan2(
      Math.sin(longitude) * Math.cos(obliquity) - Math.tan(latitude) * Math.sin(obliquity), Math.cos(longitude)),
    declination: Math.asin(
      Math.sin(latitude) * Math.cos(obliquity) + Math.cos(latitude) * Math.sin(obliquity) * Math.sin(longitude)),
    parallax: Math.asin(EARTH_RADIUS_KM / distanceKm),
  };
}

type Place = { lat: number; lon: number };

/** Whether the moon's upper edge is above a level horizon at a place and an instant. */
function isUp(place: Place, ms: number): boolean {
  const { rightAscension, declination, parallax } = moonAt(ms);
  const siderealTime = (280.46061837 + 360.98564736629 * daysSince2000(ms) + place.lon) * RAD;
  const lat = place.lat * RAD;
  const height = Math.asin(Math.sin(lat) * Math.sin(declination)
    + Math.cos(lat) * Math.cos(declination) * Math.cos(siderealTime - rightAscension));
  return height > 0.7275 * parallax - (34 / 60) * RAD;
}

type MoonEvent = { rises: boolean; at: number };

/**
 * The moon's risings and settings in the 24 hours from `start`, in the order they happen, and whether it was up
 * at `start` (which says which way round a day with no event is).
 */
export function moonDay(place: Place, start: number): { events: MoonEvent[]; up: boolean } {
  const up = isUp(place, start);
  const events: MoonEvent[] = [];
  let before = up;
  for (let from = start; from < start + DAY_MS; from += STEP_MS) {
    const after = isUp(place, from + STEP_MS);
    if (after !== before) {
      let [low, high] = [from, from + STEP_MS];
      while (high - low > NEAR_ENOUGH_MS) {
        const middle = (low + high) / 2;
        if (isUp(place, middle) === before) low = middle; else high = middle;
      }
      events.push({ rises: after, at: (low + high) / 2 });
    }
    before = after;
  }
  return { events, up };
}
