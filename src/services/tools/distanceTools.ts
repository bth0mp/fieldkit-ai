import { ToolCall } from './types';
import { positionOf } from './coordinateTools';

/**
 * distance_bearing: how far one position is from another over the Earth's surface, the compass bearing to set
 * out on, and the bearing back. WGS84, by Vincenty's inverse formula (good to a millimetre). Bearings are
 * TRUE, measured from the pole: a magnetic compass reads differently by the local declination, which this does
 * not know. Along a long line the bearing changes on the way; the one given is at the start.
 */
type Place = { lat: number; lon: number };
type Line = { metres: number; bearing: number; bearingBack: number };

const RAD = Math.PI / 180;
const EQUATORIAL_RADIUS = 6378137;
const FLATTENING = 1 / 298.257223563;
const POLAR_RADIUS = EQUATORIAL_RADIUS * (1 - FLATTENING);
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** Closer than this (in degrees of arc) to the far side of the Earth, the series does not settle. */
const FAR_SIDE_MARGIN = 0.7;
const FAR_SIDE = 'The two places are almost exactly on opposite sides of the Earth, about 20,000 km apart. '
  + 'Nearly every direction leads from one to the other, so no bearing is given.';

const turn = (angle: number) => ((angle % 360) + 360) % 360;

/** The line between two places, or null when they are the same place. */
function lineBetween(from: Place, to: Place): Line | null {
  const u1 = Math.atan((1 - FLATTENING) * Math.tan(from.lat * RAD));
  const u2 = Math.atan((1 - FLATTENING) * Math.tan(to.lat * RAD));
  const [sinU1, cosU1, sinU2, cosU2] = [Math.sin(u1), Math.cos(u1), Math.sin(u2), Math.cos(u2)];
  const span = (turn(to.lon - from.lon + 180) - 180) * RAD;
  const arcOnSphere = Math.acos(Math.max(-1, Math.min(1, sinU1 * sinU2 + cosU1 * cosU2 * Math.cos(span)))) / RAD;
  if (arcOnSphere > 180 - FAR_SIDE_MARGIN) throw new Error(FAR_SIDE);

  let lambda = span;
  let sigma = 0;
  let sinSigma = 0;
  let cosSigma = 1;
  let cosSqAlpha = 1;
  let cos2SigmaM = 0;
  let settled = false;
  for (let round = 0; round < 100 && !settled; round++) {
    sinSigma = Math.hypot(cosU2 * Math.sin(lambda), cosU1 * sinU2 - sinU1 * cosU2 * Math.cos(lambda));
    if (sinSigma === 0) return null;
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * Math.cos(lambda);
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * Math.sin(lambda)) / sinSigma;
    cosSqAlpha = 1 - sinAlpha ** 2;
    cos2SigmaM = cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha;
    const c = (FLATTENING / 16) * cosSqAlpha * (4 + FLATTENING * (4 - 3 * cosSqAlpha));
    const next = span + (1 - c) * FLATTENING * sinAlpha
      * (sigma + c * sinSigma * (cos2SigmaM + c * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));
    settled = Math.abs(next - lambda) < 1e-12;
    lambda = next;
  }
  if (!settled || Math.abs(lambda) > Math.PI) throw new Error(FAR_SIDE);

  const uSq = (cosSqAlpha * (EQUATORIAL_RADIUS ** 2 - POLAR_RADIUS ** 2)) / POLAR_RADIUS ** 2;
  const a = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const b = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma = b * sinSigma * (cos2SigmaM + (b / 4) * (cosSigma * (-1 + 2 * cos2SigmaM ** 2)
    - (b / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)));
  const bearing = Math.atan2(cosU2 * Math.sin(lambda), cosU1 * sinU2 - sinU1 * cosU2 * Math.cos(lambda)) / RAD;
  const onward = Math.atan2(cosU1 * Math.sin(lambda), -sinU1 * cosU2 + cosU1 * sinU2 * Math.cos(lambda)) / RAD;
  return { metres: POLAR_RADIUS * a * (sigma - deltaSigma), bearing: turn(bearing), bearingBack: turn(onward + 180) };
}

function distanceText(metres: number): string {
  if (Math.round(metres) < 1000) return `${Math.round(metres)} m (${Math.round(metres / 0.3048)} ft)`;
  const decimals = metres < 100000 ? 2 : 1;
  return `${(metres / 1000).toFixed(decimals)} km (${(metres / 1609.344).toFixed(decimals)} mi)`;
}

/** "054° true (north-east)" style: three figures, as a bearing is spoken, and the nearest of eight compass points. */
const figures = (bearing: number) => `${String(Math.round(bearing) % 360).padStart(3, '0')}°`;
const point = (bearing: number) => COMPASS[Math.round(bearing / 45) % 8];
const placeText = (place: Place) => `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`;

function readPlace(call: ToolCall, name: 'from' | 'to'): Place {
  const raw = call.arguments[name];
  if (typeof raw !== 'string' || !raw.trim()) throw new Error(`Missing required parameter: ${name}`);
  try {
    return positionOf(raw);
  } catch (error) {
    throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** At a pole a bearing means nothing: every direction from it is the same. */
function poleSentence(place: Place): string | null {
  if (Math.abs(place.lat) < 89.99999) return null;
  return place.lat > 0 ? 'From the North Pole every direction is south' : 'From the South Pole every direction is north';
}

export function distanceBearing(call: ToolCall): string {
  const from = readPlace(call, 'from');
  const to = readPlace(call, 'to');
  const line = lineBetween(from, to);
  // Under half a metre apart the two print as the same position, and a bearing between them is rounding noise.
  if (!line || line.metres < 0.5) return `${placeText(from)} and ${placeText(to)} are the same place to within a metre.`;
  const head = `From ${placeText(from)} to ${placeText(to)}: ${distanceText(line.metres)}`;
  const out = poleSentence(from);
  const back = poleSentence(to);
  const outText = out ? `. ${out}, so no bearing is given.` : `, bearing ${figures(line.bearing)} true (${point(line.bearing)}).`;
  const backText = back ? ` ${back}, so no bearing back is given.` : ` Bearing back: ${figures(line.bearingBack)} (${point(line.bearingBack)}).`;
  return `${head}${outText}${backText}`;
}
