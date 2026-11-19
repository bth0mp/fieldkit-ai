/**
 * distance_bearing: how far and in which direction one position is from another.
 *
 * The expected distances and bearings are NOT this module's own output. They were read on 2026-11-18 from
 * GeographicLib's GeodSolve (inverse problem, WGS84). Its azi1 is the bearing at the first place; the bearing
 * back from the second place is its forward azimuth there plus 180 degrees.
 */
import { distanceBearing } from '../../../../src/services/tools/distanceTools';

const run = (from: unknown, to: unknown) => distanceBearing({ name: 'distance_bearing', arguments: { from, to } });

describe('distance_bearing', () => {
  // [from, to, distance as printed, bearing, bearing back] with GeodSolve's s12, azi1 and azi2 beside each.
  it.each([
    ['40.6892, -74.0445', '48.8584, 2.2945', '5853.1 km', '054° true (north-east)', '292° (west)'], // 5853103.677 m, 53.713, 111.790
    ['51.4778, -0.0015', '-33.8568, 151.2153', '16982.6 km', '061° true (north-east)', '319° (north-west)'], // 16982642.242, 60.560, 139.170
    ['40, -105', '40.01, -105.01', '1.40 km', '322° true (north-west)', '142° (south-east)'], // 1400.705, -37.558, -37.564
    ['0, 0', '0, 1', '111.3 km', '090° true (east)', '270° (west)'], // 111319.491, 90, 90
    ['0, 0', '1, 0', '110.6 km', '000° true (north)', '180° (south)'], // 110574.389, 0, 0
    ['-16.8, 179.9', '-16.8, -179.9', '21.32 km', '090° true (east)', '270° (west)'], // across the date line: 21319.625, 90.029, 89.971
    ['78, 15', '78.22, 15.65', '28.76 km', '031° true (north-east)', '212° (south-west)'], // 28756.955, 31.020, 31.656
    ['35.6586, 139.7454', '21.3069, -157.8583', '6210.5 km', '087° true (east)', '299° (north-west)'], // 6210473.711, 86.901, 119.373
    ['-54.8, -68.3', '-33.8568, 151.2153', '9482.0 km', '212° true (south-west)', '158° (south)'], // 9482029.321, -148.010, -21.603
    ['64.8378, -147.7164', '69.6492, 18.9553', '5045.0 km', '006° true (north)', '352° (north)'], // over the pole: 5045025.204, 6.489, 172.060
    ['10, 20', '-10, 20', '2211.7 km', '180° true (south)', '000° (north)'], // 2211709.666, 180, 180
    ['45, 0', '45, 90', '6690.2 km', '055° true (north-east)', '305° (north-west)'], // 6690232.933, 54.726, 125.274
  ])('%s to %s', (from, to, distance, bearing, back) => {
    const result = run(from, to);
    expect(result).toContain(`: ${distance} (`);
    expect(result).toContain(`, bearing ${bearing}. Bearing back: ${back}.`);
  });

  it('prints both places as it read them, and the distance in miles too', () => {
    // 111319.491 m is 69.17 statute miles.
    expect(run('0, 0', '0, 1')).toBe('From 0.00000, 0.00000 to 0.00000, 1.00000: 111.3 km (69.2 mi), bearing 090° true (east). Bearing back: 270° (west).');
  });

  it('gives short distances in metres and feet', () => {
    // On the equator the distance is the radius times the angle exactly: 6378137 m x 0.001 degrees = 111.32 m.
    expect(run('0, 0', '0, 0.001')).toBe('From 0.00000, 0.00000 to 0.00000, 0.00100: 111 m (365 ft), bearing 090° true (east). Bearing back: 270° (west).');
  });

  it('reads either place as a grid reference', () => {
    // 18T WL 80735 04695 is the first place of the first case, to the metre.
    const result = run('18T WL 80735 04695', '48.8584, 2.2945');
    expect(result).toContain(': 5853.1 km (');
    expect(result).toContain('bearing 054° true (north-east)');
  });

  it('says so when the two places are the same', () => {
    expect(run('51.4778, -0.0015', '51.4778, -0.0015')).toBe('51.47780, -0.00150 and 51.47780, -0.00150 are the same place.');
  });

  it('does not invent a direction between places on opposite sides of the Earth', () => {
    // GeodSolve: 19944127.421 m. The usual series does not settle this close to the far side, and nearly every
    // direction leads there, so the tool says that and gives no bearing.
    expect(() => run('0, 0', '0.5, 179.7')).toThrow(/almost exactly on opposite sides of the Earth/);
  });

  it('refuses what it cannot read, naming which place', () => {
    expect(() => run('somewhere', '48.8584, 2.2945')).toThrow(/from: Could not read "somewhere"/);
    expect(() => run('40.6892, -74.0445', 'over there')).toThrow(/to: Could not read "over there"/);
    expect(() => run(undefined, '48.8584, 2.2945')).toThrow(/Missing required parameter: from/);
    expect(() => run('40.6892, -74.0445', '  ')).toThrow(/Missing required parameter: to/);
  });
});
