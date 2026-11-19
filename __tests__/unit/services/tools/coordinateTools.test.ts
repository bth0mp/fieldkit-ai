/**
 * convert_coordinates: latitude/longitude, UTM and MGRS, each way.
 *
 * The expected grid values are NOT this module's own output. They were read on 2026-11-18 from GeographicLib's
 * GeoConvert (WGS84), and two of them cross-checked against NOAA's NCAT service. GeoConvert rounds UTM to the
 * metre and truncates MGRS (a grid reference names the square the point is in), so the two can differ by one
 * in the last digit: that difference is part of what is checked here.
 */
import { convertCoordinates } from '../../../../src/services/tools/coordinateTools';

const run = (position: unknown) => convertCoordinates({ name: 'convert_coordinates', arguments: { position } });

/** [latitude, longitude, UTM, MGRS at 1 m] */
const REFERENCE: Array<[number, number, string, string]> = [
  [40.6892, -74.0445, '18T 580736 4504695', '18T WL 80735 04695'],
  [48.8584, 2.2945, '31U 448252 5411955', '31U DQ 48252 11954'],
  [-33.8568, 151.2153, '56H 334901 6252289', '56H LH 34900 52288'],
  [0, 3, '31N 500000 0', '31N EA 00000 00000'],
  [60, 5, '32V 276980 6658157', '32V KM 76979 58157'], // Norway: zone 32 is widened west to 3 E
  [78, 15, '33X 500000 8658370', '33X WG 00000 58369'], // Svalbard: zones 31, 33, 35, 37 only
  [-0.0001, -78.5, '17M 778276 9999989', '17M QV 78276 99988'], // just south of the equator
  [35.6586, 139.7454, '54S 386438 3946808', '54S UE 86437 46808'],
  [64, -22, '27W 451089 7097398', '27W VL 51089 97397'],
  [-54.8, -68.3, '19F 545000 3927239', '19F EV 45000 27239'],
  [40, -105, '13T 500000 4427757', '13T EE 00000 27757'],
  [51.4778, -0.0015, '30U 708214 5707225', '30U YC 08213 07224'],
];

/** The latitude and longitude a result line starts with. */
function latLonOf(result: string): [number, number] {
  const m = /^(-?\d+\.\d+), (-?\d+\.\d+) = /.exec(result);
  if (!m) throw new Error(`no latitude, longitude at the start of: ${result}`);
  return [Number(m[1]), Number(m[2])];
}

describe('convert_coordinates', () => {
  it.each(REFERENCE)('%s, %s gives the reference UTM and MGRS', (lat, lon, utm, mgrs) => {
    expect(run(`${lat}, ${lon}`)).toBe(`${lat.toFixed(5)}, ${lon.toFixed(5)} = UTM ${utm} = MGRS ${mgrs}`);
  });

  // 2e-5 of a degree is about two metres: one for the rounded grid value, one for the five printed decimals.
  it.each(REFERENCE)('the UTM for %s, %s leads back to it within two metres', (lat, lon, utm) => {
    // A position in latitude band S (Tokyo here) comes back as one of two readings: see the "S" case below.
    const bandS = 'Latitude band S, northern hemisphere: ';
    const answer = run(utm);
    const result = answer.includes(bandS) ? answer.split('\n').find(l => l.startsWith(bandS))!.slice(bandS.length) : answer;
    const [gotLat, gotLon] = latLonOf(result);
    expect(Math.abs(gotLat - lat)).toBeLessThan(2e-5);
    // A metre of easting is more degrees of longitude the nearer the pole.
    expect(Math.abs(gotLon - lon) * Math.cos(lat * Math.PI / 180)).toBeLessThan(2e-5);
    expect(result).toContain(` = UTM ${utm} = MGRS `);
  });

  it.each(REFERENCE)('the MGRS for %s, %s leads back to it within two metres', (lat, lon, _utm, mgrs) => {
    const result = run(mgrs);
    const [gotLat, gotLon] = latLonOf(result);
    expect(Math.abs(gotLat - lat)).toBeLessThan(2e-5);
    expect(Math.abs(gotLon - lon) * Math.cos(lat * Math.PI / 180)).toBeLessThan(2e-5);
    expect(result.endsWith(` = MGRS ${mgrs}`)).toBe(true);
  });

  it('reads a grid reference with or without spaces, in either case', () => {
    const expected = '40.00000, -105.00000 = UTM 13T 500000 4427757 = MGRS 13T EE 00000 27757';
    expect(run('13TEE0000027757')).toBe(expected);
    expect(run('13T EE 00000 27757')).toBe(expected);
    expect(run('13tee0000027757')).toBe(expected);
    expect(run('13T 500000 4427757')).toBe(expected);
    expect(run('13T 500000mE 4427757mN')).toBe(expected);
  });

  it('reads latitude and longitude the ways people write them', () => {
    const boulder = '40.00000, -105.00000 = UTM 13T 500000 4427757 = MGRS 13T EE 00000 27757';
    expect(run('40 -105')).toBe(boulder);
    expect(run('40 N, 105 W')).toBe(boulder);
    expect(run('W 105, N 40')).toBe(boulder);
    expect(run('40°00\'00"N 105°00\'00"W')).toBe(boulder);
    expect(run('33.8568 S, 151.2153 E')).toBe('-33.85680, 151.21530 = UTM 56H 334901 6252289 = MGRS 56H LH 34900 52288');
    // degrees and decimal minutes, as a marine or aviation GPS shows them
    expect(run('40°41.352\'N 74°2.67\'W')).toBe('40.68920, -74.04450 = UTM 18T 580736 4504695 = MGRS 18T WL 80735 04695');
  });

  it('keeps a coarser grid reference coarse, and says which corner the position is', () => {
    const result = run('18TWL8004');
    expect(result).toContain(' = UTM 18T 580000 4504000 = MGRS 18T WL 80 04 (1 km square; the position is its south-west corner)');
    const [lat, lon] = latLonOf(result);
    // The square holds the Statue of Liberty (40.6892, -74.0445), north-east of the corner and within a kilometre.
    expect(40.6892 - lat).toBeGreaterThan(0);
    expect(40.6892 - lat).toBeLessThan(0.01);
    expect(-74.0445 - lon).toBeGreaterThan(0);
    expect(-74.0445 - lon).toBeLessThan(0.012);
    expect(run('18TWL')).toContain(' = MGRS 18T WL (100 km square; the position is its south-west corner)');
  });

  it('refuses the polar areas, which UTM does not cover', () => {
    expect(() => run('84.5, 10')).toThrow(/outside the area UTM and MGRS cover here \(80 S to 84 N\)/);
    expect(() => run('-80.5, 0')).toThrow(/outside the area UTM and MGRS cover here/);
  });

  it('refuses a latitude or longitude that cannot exist', () => {
    expect(() => run('95, 10')).toThrow(/Latitude must be between -90 and 90/);
    expect(() => run('45, 190')).toThrow(/Longitude must be between -180 and 180/);
  });

  // "S" after a zone number is latitude band S (32 to 40 north) to some and "southern hemisphere" to others, and
  // GeographicLib itself prints UTM the second way ("19s 545000 3927239"). For northings 3,540,000 to 4,434,000 both
  // readings are real places 10,000 km apart, so one silent pick is never safe.
  it('gives both readings when "S" could be latitude band S or the southern hemisphere', () => {
    const result = run('19S 545000 3927239');
    expect(result).toMatch(/^19S 545000 3927239 can be read two ways\./);
    // Reference row 10 (GeoConvert): -54.8, -68.3 is 19s 545000 3927239, MGRS 19FEV4500027239.
    expect(result).toContain('\nZone 19, southern hemisphere: -54.80000, -68.30000 = UTM 19F 545000 3927239 = MGRS 19F EV 45000 27239');
    // GeoConvert for "19n 545000 3927239": 35.48767 -68.50390, MGRS 19SEV4500027239.
    expect(result).toContain('\nLatitude band S, northern hemisphere: 35.48767, -68.50390 = UTM 19S 545000 3927239 = MGRS 19S EV 45000 27239');
  });

  it('gives both readings when "S" does not fit band S but the place is just outside it', () => {
    // 13S 500000 4429000 is 40.01 north, a kilometre into band T; read as "south" it is 50 south. Neither is safe to assume.
    const result = run('13S 500000 4429000');
    expect(result).toMatch(/^13S 500000 4429000 can be read two ways\./);
    expect(result).toMatch(/\nNorthern hemisphere, latitude band T \(not S\): 40\.01\d{3}, -105\.00000 = UTM 13T 500000 4429000 = /);
    expect(result).toMatch(/\nZone 13, southern hemisphere: -50\.29\d{3}, -105\.00000 = UTM 13F 500000 4429000 = /);
    // Reference row 1 written with the neighbouring band letter.
    expect(run('18S 580736 4504695'))
      .toContain('\nNorthern hemisphere, latitude band T (not S): 40.68920, -74.04450 = UTM 18T 580736 4504695 = MGRS 18T WL 80736 04695');
  });

  it('reads N or S as the hemisphere when the numbers cannot be that latitude band, and says so', () => {
    // GeoConvert prints these two as "18n 580736 4504695" and "56s 334901 6252289" (reference rows 1 and 3).
    expect(run('18N 580736 4504695'))
      .toBe('40.68920, -74.04450 = UTM 18T 580736 4504695 = MGRS 18T WL 80736 04695 (N read as northern hemisphere)');
    // GeoConvert for "56s 334901 6252289": -33.85680 151.21530, MGRS 56HLH3490152289. Read as north it would be 56 north,
    // two bands away from S, so "south" is the only sensible reading.
    expect(run('56S 334901 6252289'))
      .toBe('-33.85680, 151.21530 = UTM 56H 334901 6252289 = MGRS 56H LH 34901 52289 (S read as southern hemisphere)');
    // Band N really is 0 to 8 north, so here the letter needs no second reading.
    expect(run('31N 500000 0')).toBe('0.00000, 3.00000 = UTM 31N 500000 0 = MGRS 31N EA 00000 00000');
  });

  it('prints the latitude band the position is really in, whatever letter was typed', () => {
    // 13S EE 00000 28312 is 40.005 north, just inside band T; GeoConvert answers 13TEE0000028312.
    expect(run('13S EE 00000 28312')).toMatch(/ = UTM 13T 500000 4428312 = MGRS 13T EE 00000 28312$/);
  });

  it('reads its own answers back, at the equator and for a coarse square whose corner is in the next band', () => {
    // Half a metre south of the equator prints as northing 10000000 (GeoConvert prints that too). Read back, it is
    // the equator, which this tool always writes the northern way (its own choice of two names for one point).
    expect(run('31M 500000 10000000')).toBe('0.00000, 3.00000 = UTM 31N 500000 0 = MGRS 31N EA 00000 00000');
    expect(run('-0.00000000000000001, 3')).toBe('0.00000, 3.00000 = UTM 31N 500000 0 = MGRS 31N EA 00000 00000');
    // The corner of square 13T EE is at 39.75 north, in band S.
    const corner = run('13TEE');
    expect(corner).toContain(' = UTM 13S 500000 4400000 = MGRS 13T EE (100 km square; the position is its south-west corner)');
  });

  it('keeps longitude between -180 and 180 at the edge of zone 1', () => {
    // Square 1N AA lies across the 180th meridian. GeoConvert for "01n 100000 0": longitude 179.40767.
    expect(run('1NAA')).toMatch(/^0\.00000, 179\.40767 = /);
  });

  it('reads labelled values by their labels, not by their order', () => {
    const liberty = '40.68920, -74.04450 = UTM 18T 580736 4504695 = MGRS 18T WL 80735 04695';
    expect(run('Lon: -74.0445, Lat: 40.6892')).toBe(liberty);
    expect(run('lng -74.0445 lat 40.6892')).toBe(liberty);
    expect(run('-74.0445 lon, 40.6892 lat')).toBe(liberty);
    expect(run('lon -74.0445, 40.6892')).toBe(liberty);
    expect(run('lat 40.6892, -74.0445')).toBe(liberty);
    // Reference row 2, longitude first.
    expect(run('Longitude: 2.2945, Latitude: 48.8584')).toBe('48.85840, 2.29450 = UTM 31U 448252 5411955 = MGRS 31U DQ 48252 11954');
    expect(() => run('lat -74.0445, lat 40.6892')).toThrow(/Could not read/);
  });

  it('reads the hemisphere spoken as a word', () => {
    expect(run('40.6892 north, 74.0445 west')).toBe('40.68920, -74.04450 = UTM 18T 580736 4504695 = MGRS 18T WL 80735 04695');
  });

  it('accepts real grid squares that only touch their zone at a corner', () => {
    // GeoConvert: 53.25, -180 is 01UBV9985904281; 81.05, 9 is 33XUL9597204171; 32VJH3227421798 is 56.00000, 3.10001.
    expect(run('1UBV')).toContain(' = MGRS 1U BV (100 km square');
    expect(run('33XUL')).toContain(' = MGRS 33X UL (100 km square');
    expect(run('32VJH3227421798')).toMatch(/^56\.00000, 3\.1000[01] = UTM 32V 132274 6221798 = MGRS 32V JH 32274 21798$/);
  });

  it('gives the grid reference in the zone the point is really in when a UTM easting runs past its zone', () => {
    // 18T 180735 4504695 is 100 km west of zone 18's edge: square "18T SL" does not exist, the place is in 17T PF.
    expect(run('18T 180735 4504695')).toMatch(/ = UTM 18T 180735 4504695 = MGRS 17T PF 8818\d 0022\d$/);
  });

  it('refuses a decimal comma instead of reading it as degrees and minutes', () => {
    expect(() => run('48,36 N 2,29 E')).toThrow(/decimal point/);
    expect(() => run('40,5 N 74,25 W')).toThrow(/decimal point/);
    expect(() => run('48°51,5\'N 2°17,7\'E')).toThrow(/decimal point/);
    // A comma BETWEEN the two values is fine, with or without a space or letters.
    expect(run('40.6892N,74.0445W')).toMatch(/^40\.68920, -74\.04450 = /);
    expect(run('48.8584,2.2945')).toMatch(/^48\.85840, 2\.29450 = /);
  });

  it('refuses degrees, minutes and seconds that are not well formed', () => {
    expect(() => run('48.5 30 N 2 E')).toThrow(/Could not read/); // a fraction of a degree, then minutes
    expect(() => run('40 41.5 21 N 74 W')).toThrow(/Could not read/); // a fraction of a minute, then seconds
    expect(() => run('40 61 N 74 W')).toThrow(/Could not read/); // 61 minutes
    expect(() => run('55.75-37.62')).toThrow(/Could not read/); // is that a dash or a minus?
  });

  it('refuses a grid reference that is not well formed', () => {
    expect(() => run('18TWL807350469')).toThrow(/even number of digits/);
    expect(() => run('18TIO1234')).toThrow(/Could not read/); // I and O are never used in MGRS
    expect(() => run('61T 500000 4427757')).toThrow(/Zone must be 1 to 60/);
    // Typed as two groups, the two halves must be the same length: re-splitting them evenly moves the point 46 km.
    expect(() => run('18T WL 80735 046')).toThrow(/same number of digits/);
    expect(() => run('18T WL 807 04695')).toThrow(/same number of digits/);
  });

  it('refuses a grid square that lies outside its zone, as a mistyped column letter does', () => {
    // Column S belongs to zone 18's set, but 18T SL is 100 km west of the zone's edge, in zone 17's ground.
    expect(() => run('18T SL 80735 04695')).toThrow(/outside zone 18/);
  });

  it('reads a position with the wrappers people and models put round it', () => {
    const liberty = '40.68920, -74.04450 = UTM 18T 580736 4504695 = MGRS 18T WL 80735 04695';
    const boulder = '40.00000, -105.00000 = UTM 13T 500000 4427757 = MGRS 13T EE 00000 27757';
    expect(run('(40.6892, -74.0445)')).toBe(liberty);
    expect(run('[40.6892, -74.0445]')).toBe(liberty);
    expect(run('40.6892, -74.0445.')).toBe(liberty);
    expect(run('Lat: 40.6892 Lon: -74.0445')).toBe(liberty);
    expect(run('latitude 40.6892, longitude -74.0445')).toBe(liberty);
    expect(run('MGRS 13TEE0000027757')).toBe(boulder);
    expect(run('USNG: 13T EE 00000 27757.')).toBe(boulder);
    expect(run('UTM 13T 500000 4427757')).toBe(boulder);
    expect(run('MGRS: (13TEE0000027757)')).toBe(boulder);
    expect(run('UTM zone 13T 500000 4427757')).toBe(boulder);
    expect(run('13T 0500000 4427757')).toBe(boulder); // receivers show the easting with a leading zero
    expect(run('13T 500000.4 4427757.2')).toBe(boulder); // and some show decimals
  });

  it('says what it can read when it cannot read the position', () => {
    expect(() => run('somewhere near the river')).toThrow(/Could not read "somewhere near the river".*40\.6892, -74\.0445.*18T 580736 4504695.*18TWL8073504695/);
    expect(() => run(undefined)).toThrow(/Missing required parameter: position/);
    expect(() => run('   ')).toThrow(/Missing required parameter: position/);
  });
});
