import { ToolCall } from './types';

/**
 * convert_coordinates: one position in, the same position out as latitude/longitude, UTM and MGRS.
 *
 * WGS84. Transverse Mercator by the Krueger series (Karney 2011, three terms: well under a millimetre
 * inside a zone). Covers the UTM latitudes, 80 S to 84 N; the polar grids (UPS) are not handled.
 * UTM is rounded to the metre. MGRS is truncated, because a grid reference names the square a point is in.
 *
 * Someone may walk to what this prints, so the reader below refuses text it cannot be sure of, and answers
 * both ways where a letter has two meanings, rather than pick one silently.
 */
type Grid = { zone: number; easting: number; northing: number };
type Utm = Grid & { band: string };
type LatLon = { lat: number; lon: number };
/**
 * One way of reading a position. `digits` is the MGRS precision it was given in (5 = one metre); `mgrsBand`
 * is the band letter of the grid square, which for a coarse square can differ from its corner's own band.
 * `mgrsGrid` is set when the grid reference belongs to another zone than the UTM numbers were written in.
 */
type Reading = LatLon & { utm: Utm; digits: number; mgrsBand: string; mgrsGrid?: Grid; label?: string; note?: string };

const RAD = Math.PI / 180;
const FALSE_EASTING = 500000;
const FALSE_NORTHING_SOUTH = 10000000;
const FLATTENING = 1 / 298.257223563;
const N = FLATTENING / (2 - FLATTENING);
const ECCENTRICITY = (2 * Math.sqrt(N)) / (1 + N);
/** Scale factor 0.9996 times the rectifying radius of the WGS84 ellipsoid (a = 6 378 137 m). */
const RADIUS = ((0.9996 * 6378137) / (1 + N)) * (1 + N ** 2 / 4 + N ** 4 / 64);
const ALPHA = [N / 2 - (2 * N ** 2) / 3 + (5 * N ** 3) / 16, (13 * N ** 2) / 48 - (3 * N ** 3) / 5, (61 * N ** 3) / 240];
const BETA = [N / 2 - (2 * N ** 2) / 3 + (37 * N ** 3) / 96, N ** 2 / 48 + N ** 3 / 15, (17 * N ** 3) / 480];
const DELTA = [2 * N - (2 * N ** 2) / 3 - 2 * N ** 3, (7 * N ** 2) / 3 - (8 * N ** 3) / 5, (56 * N ** 3) / 15];

/** Latitude bands C to X, 8 degrees each from 80 S; X runs 72 to 84 N. I and O are never used. */
const BANDS = 'CDEFGHJKLMNPQRSTUVWX';
/** 100 km column letters, by zone number modulo 3, and row letters (odd zones start at A, even at F). */
const COLUMNS = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
const ROWS = 'ABCDEFGHJKLMNPQRSTUV';
const SQUARE_SIZES = ['100 km', '10 km', '1 km', '100 m', '10 m'];
const SVALBARD_ZONES: Array<[number, number]> = [[9, 31], [21, 33], [33, 35], [42, 37]];
/** A grid value rounded to the metre can sit this far (in degrees) outside the band it was written with. */
const ROUNDING_SLACK = 1e-5;
/** How far (in degrees) a typed band letter may be from the truth before the text is refused. */
const BAND_SLACK = 0.01;

const UTM_PATTERN = /^(\d{1,2})\s*([C-HJ-NP-X])\s+(\d{6,7}(?:\.\d+)?)(?:\s*M?E)?[\s,]+(\d{1,8}(?:\.\d+)?)(?:\s*M?N)?$/;
const MGRS_PATTERN = /^(\d{1,2})\s*([C-HJ-NP-X])\s*([A-HJ-NP-Z])\s*([A-HJ-NP-V])\s*(?:(\d+)\s+(\d+)|(\d*))$/;
const LAT_LON_TOKEN = /[NSEW]|-?\d+(?:\.\d+)?/g;
const EXAMPLES = 'Give a latitude and longitude such as 40.6892, -74.0445; a UTM position such as '
  + '18T 580736 4504695; or an MGRS grid reference such as 18TWL8073504695.';

const isNorthBand = (band: string) => band >= 'N';
const centralMeridian = (zone: number) => zone * 6 - 183;
const rowOffset = (zone: number) => (zone % 2 === 0 ? 5 : 0);
/** A difference of longitudes, or a longitude, brought into -180 to 180. */
const wrap = (angle: number) => ((((angle + 180) % 360) + 360) % 360) - 180;

function zoneFor({ lat, lon }: LatLon): number {
  if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) return 32; // south-west Norway
  const svalbard = lat >= 72 && lon >= 0 ? SVALBARD_ZONES.find(([east]) => lon < east) : undefined;
  return svalbard ? svalbard[1] : Math.min(60, Math.floor((lon + 180) / 6) + 1);
}

/** The band a latitude is in. The equator itself and everything north of it is northern. */
function bandOf(lat: number): string {
  const index = Math.max(0, Math.min(19, Math.floor((lat + 80) / 8)));
  return BANDS[lat < 0 ? Math.min(9, index) : index];
}

function bandRange(band: string): [number, number] {
  const south = BANDS.indexOf(band) * 8 - 80;
  return [south, band === 'X' ? 84 : south + 8];
}

/** How far outside a band a latitude is, in degrees; 0 inside it. */
function outsideBand(band: string, lat: number): number {
  const [south, north] = bandRange(band);
  return Math.max(south - lat, lat - north, 0);
}

/** The typed band letter if the position is in it (give or take a rounded metre), else the band it is in. */
function labelBand(typed: string, lat: number): string {
  const actual = bandOf(lat);
  const sameHalf = isNorthBand(typed) === isNorthBand(actual);
  return sameHalf && outsideBand(typed, lat) <= ROUNDING_SLACK ? typed : actual;
}

function toUtm(position: LatLon): Utm {
  const zone = zoneFor(position);
  const dLon = wrap(position.lon - centralMeridian(zone)) * RAD;
  const sinLat = Math.sin(position.lat * RAD);
  const t = Math.sinh(Math.atanh(sinLat) - ECCENTRICITY * Math.atanh(ECCENTRICITY * sinLat));
  const xi0 = Math.atan2(t, Math.cos(dLon));
  const eta0 = Math.atanh(Math.sin(dLon) / Math.hypot(1, t));
  let xi = xi0;
  let eta = eta0;
  ALPHA.forEach((a, i) => {
    const j = 2 * (i + 1);
    xi += a * Math.sin(j * xi0) * Math.cosh(j * eta0);
    eta += a * Math.cos(j * xi0) * Math.sinh(j * eta0);
  });
  // A latitude so slightly south that its northing is 10,000,000 to the last bit is the equator: one name for it.
  const fromEquator = RADIUS * xi;
  const north = position.lat >= 0 || FALSE_NORTHING_SOUTH + fromEquator >= FALSE_NORTHING_SOUTH;
  return {
    zone,
    band: bandOf(north ? Math.max(position.lat, 0) : position.lat),
    easting: FALSE_EASTING + RADIUS * eta,
    northing: north ? Math.max(fromEquator, 0) : FALSE_NORTHING_SOUTH + fromEquator,
  };
}

function toLatLon(grid: Grid, north: boolean): LatLon {
  const xi = (grid.northing - (north ? 0 : FALSE_NORTHING_SOUTH)) / RADIUS;
  const eta = (grid.easting - FALSE_EASTING) / RADIUS;
  let xi0 = xi;
  let eta0 = eta;
  BETA.forEach((b, i) => {
    const j = 2 * (i + 1);
    xi0 -= b * Math.sin(j * xi) * Math.cosh(j * eta);
    eta0 -= b * Math.cos(j * xi) * Math.sinh(j * eta);
  });
  const chi = Math.asin(Math.sin(xi0) / Math.cosh(eta0));
  const lat = DELTA.reduce((sum, d, i) => sum + d * Math.sin(2 * (i + 1) * chi), chi);
  return { lat: lat / RAD, lon: wrap(centralMeridian(grid.zone) + Math.atan2(Math.sinh(eta0), Math.cos(xi0)) / RAD) };
}

function formatMgrs({ utm, digits, mgrsBand, mgrsGrid }: Reading): string {
  const grid = mgrsGrid ?? utm;
  const easting = Math.floor(grid.easting);
  const northing = Math.floor(grid.northing);
  const column = COLUMNS[(grid.zone - 1) % 3][Math.floor(easting / 100000) - 1];
  const row = ROWS[(Math.floor(northing / 100000) + rowOffset(grid.zone)) % 20];
  const part = (metres: number) => String(Math.floor((metres % 100000) / 10 ** (5 - digits))).padStart(digits, '0');
  const square = `${grid.zone}${mgrsBand} ${column}${row}`;
  return digits === 0 ? square : `${square} ${part(easting)} ${part(northing)}`;
}

function checkedZone(text: string): number {
  const zone = Number(text);
  if (zone < 1 || zone > 60) throw new Error('Zone must be 1 to 60');
  return zone;
}

/** A UTM position in one hemisphere, with the band it really lies in. */
function utmReading(grid: Grid, north: boolean): Reading {
  // A southern northing of 10,000,000 is the equator itself, which is written as northern 0.
  const onEquator = !north && grid.northing >= FALSE_NORTHING_SOUTH;
  const placed = onEquator ? { ...grid, northing: grid.northing - FALSE_NORTHING_SOUTH } : grid;
  const position = toLatLon(placed, north || onEquator);
  const band = bandOf(position.lat);
  // UTM numbers may run past the edge of their zone. A grid reference may not: it is given in the point's own zone.
  const own = toUtm(position);
  const elsewhere = own.zone === grid.zone ? {} : { mgrsGrid: own };
  return { ...position, utm: { ...placed, band }, digits: 5, mgrsBand: band, ...elsewhere };
}

/** The same reading with the band letter that was typed, when the position is in that band. */
function withTypedBand(reading: Reading, letter: string): Reading {
  const band = labelBand(letter, reading.lat);
  return { ...reading, utm: { ...reading.utm, band }, mgrsBand: band };
}

/**
 * "18T 580736 4504695". The letter is a latitude band, but N and S are also written for the hemisphere
 * ("18N", "56S": GeographicLib prints UTM that way). N cannot mislead: band N is northern. S can: band S is
 * 32 to 40 north, and the same numbers read as "south" are a real place 10,000 km away. So S gets both
 * readings whenever the northern one is in band S or within a band of it (a slip of one letter).
 */
function readUtm([, zoneText, letter, eastingText, northingText]: RegExpExecArray): Reading[] {
  const grid = { zone: checkedZone(zoneText), easting: Number(eastingText), northing: Number(northingText) };
  if (grid.easting < 100000 || grid.easting >= 900000) throw new Error('Easting must be 100000 to 899999');
  if (grid.northing > FALSE_NORTHING_SOUTH) throw new Error('Northing must be 10000000 or less');
  if (letter === 'S') return readZoneS(grid, northingText);
  const typed = utmReading(grid, isNorthBand(letter));
  if (outsideBand(letter, typed.lat) <= BAND_SLACK) return [withTypedBand(typed, letter)];
  if (letter === 'N' && typed.lat <= 84 + BAND_SLACK) return [{ ...typed, note: ' (N read as northern hemisphere)' }];
  return refuseBand(letter, northingText);
}

function readZoneS(grid: Grid, northingText: string): Reading[] {
  const north = utmReading(grid, true);
  const south = { ...utmReading(grid, false), label: `Zone ${grid.zone}, southern hemisphere` };
  const offBand = outsideBand('S', north.lat);
  const southExists = south.lat >= -80 - BAND_SLACK;
  if (offBand <= BAND_SLACK) {
    const asBand = { ...withTypedBand(north, 'S'), label: 'Latitude band S, northern hemisphere' };
    return southExists ? [asBand, south] : [asBand];
  }
  if (!southExists) return refuseBand('S', northingText);
  if (offBand > 8) return [{ ...south, label: undefined, note: ' (S read as southern hemisphere)' }];
  return [{ ...north, label: `Northern hemisphere, latitude band ${north.utm.band} (not S)` }, south];
}

function refuseBand(band: string, northingText: string): never {
  const [south, north] = bandRange(band);
  throw new Error(`Northing ${northingText} is not in latitude band ${band} (${south} to ${north} degrees)`);
}

/** The digits after the letters: one run split evenly, or two groups that must match in length. */
function mgrsDigits(first: string | undefined, second: string | undefined, run = ''): [string, string] {
  if (first !== undefined && second !== undefined) {
    if (first.length !== second.length || first.length > 5) {
      throw new Error(`The two halves of a grid reference must have the same number of digits, five at most `
        + `(got ${first.length} and ${second.length})`);
    }
    return [first, second];
  }
  if (run.length % 2 !== 0 || run.length > 10) {
    throw new Error('A grid reference needs an even number of digits after its letters, ten at most');
  }
  return [run.slice(0, run.length / 2), run.slice(run.length / 2)];
}

function readMgrs([, zoneText, band, column, row, first, second, run]: RegExpExecArray): Reading[] {
  const zone = checkedZone(zoneText);
  const [eastDigits, northDigits] = mgrsDigits(first, second, run);
  const digits = eastDigits.length;
  const size = 10 ** (5 - digits);
  const columnIndex = COLUMNS[(zone - 1) % 3].indexOf(column);
  if (columnIndex < 0) throw new Error(`Column letter ${column} does not occur in zone ${zone}`);
  const easting = (columnIndex + 1) * 100000 + Number(eastDigits) * size;
  const rowIndex = (ROWS.indexOf(row) - rowOffset(zone) + 20) % 20;
  const within2000km = rowIndex * 100000 + Number(northDigits) * size;
  const north = isNorthBand(band);
  // Row letters repeat every 2,000 km. The latitude band says which repeat is meant: take the one whose
  // square (judged at its centre) lies in the band.
  const candidates = [0, 1, 2, 3, 4].map(repeat => {
    const grid = { zone, easting, northing: within2000km + repeat * 2000000 };
    const centre = toLatLon({ zone, easting: easting + size / 2, northing: grid.northing + size / 2 }, north);
    return { grid, centre, miss: outsideBand(band, centre.lat) };
  });
  const best = candidates.reduce((a, b) => (b.miss < a.miss ? b : a));
  if (best.miss > 0.5) throw new Error(`Row letter ${row} does not occur in latitude band ${band} of zone ${zone}`);
  checkSquareInZone({ ...best.grid, size, north }, `${column}${row}`);
  const position = toLatLon(best.grid, north);
  const mgrsBand = labelBand(band, best.centre.lat);
  return [{ ...position, utm: { ...best.grid, band: labelBand(mgrsBand, position.lat) }, digits, mgrsBand }];
}

/**
 * A mistyped column letter gives a square that exists on paper but lies outside the zone. Refuse those, and
 * only those: a zone's edge leans across the grid, so a real square may reach into its zone by one corner.
 */
function checkSquareInZone(square: Grid & { size: number; north: boolean }, letters: string): void {
  const meridian = centralMeridian(square.zone);
  const touchesZone = [0, 1, 2, 3].some(corner => {
    const easting = square.easting + (corner % 2) * square.size;
    const northing = square.northing + Math.floor(corner / 2) * square.size;
    const { lat, lon } = toLatLon({ zone: square.zone, easting, northing }, square.north);
    // Zones are 3 degrees either side of their meridian; Norway's 32V and the Svalbard zones reach 6.
    return Math.abs(wrap(lon - meridian)) <= (lat >= 56 ? 6 : 3) + BAND_SLACK;
  });
  if (!touchesZone) throw new Error(`Grid square ${letters} lies outside zone ${square.zone}. Check the letters.`);
}

/** Degrees, or degrees and minutes, or degrees, minutes and seconds, as one number. Null if not sensible. */
function degrees(parts: number[]): number | null {
  const [d, m = 0, s = 0] = parts;
  const wholeButLast = parts.slice(0, -1).every(Number.isInteger);
  if (parts.length < 1 || parts.length > 3 || parts.some(p => p < 0) || m >= 60 || s >= 60 || !wholeButLast) return null;
  return d + m / 60 + s / 3600;
}

/** "40 41 21 N 74 2 40 W" or "N 40, W 105": each letter owns the numbers on its side. */
function readLettered(tokens: string[]): LatLon | null {
  const isLetter = (token: string) => 'NSEW'.includes(token);
  const letterFirst = isLetter(tokens[0]);
  const groups: Array<{ letter: string; parts: number[] }> = [];
  let pending: number[] = [];
  for (const token of tokens) {
    if (isLetter(token)) {
      groups.push({ letter: token, parts: letterFirst ? [] : pending });
      pending = [];
    } else {
      (letterFirst ? groups[groups.length - 1].parts : pending).push(Number(token));
    }
  }
  const latGroup = groups.find(g => 'NS'.includes(g.letter));
  const lonGroup = groups.find(g => 'EW'.includes(g.letter));
  if (groups.length !== 2 || pending.length > 0 || !latGroup || !lonGroup) return null;
  const lat = degrees(latGroup.parts);
  const lon = degrees(lonGroup.parts);
  if (lat === null || lon === null) return null;
  return { lat: latGroup.letter === 'S' ? -lat : lat, lon: lonGroup.letter === 'W' ? -lon : lon };
}

const AXIS_LABEL = /\b(?:LATITUDE|LAT|LONGITUDE|LONG|LON|LNG)\b/;
const AXIS_LABEL_OR_NUMBER = new RegExp(`${AXIS_LABEL.source}|-?\\d+(?:\\.\\d+)?`, 'g');
const AXIS_LABEL_WITH_MARK = new RegExp(`${AXIS_LABEL.source}\\.?\\s*[:=]?`, 'g');

/**
 * Whether the first of two numbers is the latitude. "Lon: -74, Lat: 40" says it is not; no labels means it
 * is, by convention. Null when the labels contradict each other (two latitudes).
 */
function latitudeComesFirst(text: string): boolean | null {
  const items = text.match(AXIS_LABEL_OR_NUMBER) ?? [];
  const axis = (item: string | undefined) => {
    if (!item || !AXIS_LABEL.test(item)) return undefined;
    return item.startsWith('LAT') ? 'lat' : 'lon';
  };
  // One label between the two numbers ("40.6892, lat -74.0445") could belong to either: not readable.
  if (items.length === 3 && axis(items[1])) return null;
  // A label sits before its number ("lat 40") or after it ("40 lat"): whichever the text starts with.
  const step = axis(items[0]) ? -1 : 1;
  const [first, second] = items.map((item, i) => (axis(item) ? null : axis(items[i + step]) ?? 'none')).filter(a => a !== null);
  if (first !== 'none' && first === second) return null;
  if (first !== 'none') return first === 'lat';
  return second !== 'lat';
}

function readLatLon(upper: string): LatLon | null {
  const spoken = upper.replaceAll(/\bNORTH\b/g, 'N').replaceAll(/\bSOUTH\b/g, 'S').replaceAll(/\bEAST\b/g, 'E').replaceAll(/\bWEST\b/g, 'W');
  const text = spoken.replaceAll(AXIS_LABEL_WITH_MARK, ' ');
  // Anything besides numbers, hemisphere letters and the usual marks means this is not a position.
  // A dash glued between two numbers ("55.75-37.62") could be a minus or a separator: not readable either.
  if (text.replaceAll(LAT_LON_TOKEN, '').replaceAll(/[°º'′’"″”,;\s]/g, '') !== '' || /\d-\d/.test(text)) return null;
  const tokens = text.match(LAT_LON_TOKEN) ?? [];
  if (!tokens.some(token => 'NSEW'.includes(token))) {
    const latFirst = latitudeComesFirst(spoken);
    if (tokens.length !== 2 || latFirst === null) return null;
    const [a, b] = tokens.map(Number);
    return latFirst ? { lat: a, lon: b } : { lat: b, lon: a };
  }
  // With letters, several numbers per side mean degrees and minutes, so "48,36 N" would be read as 48 degrees
  // 36 minutes when the writer may have meant 48.36 degrees. Refuse it and say how to write it.
  if (/\d,\d/.test(text)) {
    throw new Error('Write decimals with a decimal point, not a comma. For example, "48,36 N" could mean 48.36 degrees or 48 degrees 36 minutes.');
  }
  return readLettered(tokens);
}

/** Upper case, without the brackets, quotes, closing full stop or "MGRS" label that people put round a position. */
function tidy(text: string): string {
  const unwrap = (s: string) => s.replace(/^[([{"'\s]+/, '').replace(/[)\]}"'.\s]+$/, '');
  return unwrap(unwrap(text.toUpperCase()).replace(/^(?:MGRS|USNG|UTM)(?:\s*ZONE\b)?\s*[:=]?\s*/, ''));
}

function readPosition(text: string): Reading[] {
  const upper = tidy(text);
  const utm = UTM_PATTERN.exec(upper);
  if (utm) return readUtm(utm);
  const mgrs = MGRS_PATTERN.exec(upper);
  if (mgrs) return readMgrs(mgrs);
  const position = readLatLon(upper);
  if (!position) throw new Error(`Could not read "${text}". ${EXAMPLES}`);
  if (Math.abs(position.lat) > 90) throw new Error('Latitude must be between -90 and 90. Give the latitude first.');
  if (Math.abs(position.lon) > 180) throw new Error('Longitude must be between -180 and 180');
  if (position.lat < -80 || position.lat > 84) {
    throw new Error(`${text} is outside the area UTM and MGRS cover here (80 S to 84 N)`);
  }
  const grid = toUtm(position);
  return [{ ...position, utm: grid, digits: 5, mgrsBand: grid.band }];
}

/** Five decimals is about a metre. Never "-0.00000". */
function fixed5(value: number): string {
  const text = value.toFixed(5);
  return text === '-0.00000' ? '0.00000' : text;
}

function describe(reading: Reading): string {
  const { lat, lon, utm, digits } = reading;
  const corner = digits < 5 ? ` (${SQUARE_SIZES[digits]} square; the position is its south-west corner)` : '';
  const grid = `${utm.zone}${utm.band} ${Math.round(utm.easting)} ${Math.round(utm.northing)}`;
  return `${fixed5(lat)}, ${fixed5(lon)} = UTM ${grid} = MGRS ${formatMgrs(reading)}${corner}${reading.note ?? ''}`;
}

export function convertCoordinates(call: ToolCall): string {
  const raw = call.arguments.position;
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('Missing required parameter: position');
  const readings = readPosition(raw.trim());
  if (readings.length === 1) return describe(readings[0]);
  const ways = readings.map(reading => `${reading.label}: ${describe(reading)}`).join('\n');
  return `${raw.trim()} can be read two ways. Ask which is meant before using either.\n${ways}`;
}
