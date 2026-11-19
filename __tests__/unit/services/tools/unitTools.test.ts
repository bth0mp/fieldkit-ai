/**
 * convert_units: the table and the arithmetic. Expected values come from the defined conversion factors
 * (international yard and pound, US customary volume, 1 atm = 101 325 Pa), worked out by hand, not from
 * this module's own output.
 */
import { convertUnits } from '../../../../src/services/tools/unitTools';

const run = (value: unknown, from: unknown, to: unknown) =>
  convertUnits({ name: 'convert_units', arguments: { value, from, to } });

describe('convert_units', () => {
  it.each([
    [1, 'mi', 'km', '1 mi = 1.60934 km'],
    [5, 'km', 'mi', '5 km = 3.10686 mi'],
    [1, 'nmi', 'm', '1 nmi = 1852 m'],
    [12, 'in', 'ft', '12 in = 1 ft'],
    [1, 'lb', 'kg', '1 lb = 0.453592 kg'],
    [16, 'oz', 'lb', '16 oz = 1 lb'],
    [14, 'st', 'lb', '14 st = 196 lb'],
    [1, 'gal', 'L', '1 US gal = 3.78541 L'],
    [1, 'imp gal', 'L', '1 imp gal = 4.54609 L'],
    [4, 'qt', 'gal', '4 US qt = 1 US gal'],
    [100, 'C', 'F', '100 °C = 212 °F'],
    [32, 'F', 'C', '32 °F = 0 °C'],
    [-40, 'F', 'C', '-40 °F = -40 °C'],
    [0, 'C', 'K', '0 °C = 273.15 K'],
    [98.6, 'F', 'C', '98.6 °F = 37 °C'],
    [10, 'kn', 'km/h', '10 kn = 18.52 km/h'],
    [60, 'mph', 'km/h', '60 mph = 96.5606 km/h'],
    [1, 'atm', 'psi', '1 atm = 14.6959 psi'],
    [1013.25, 'hPa', 'inHg', '1013.25 hPa = 29.9213 inHg'],
    [1, 'acre', 'm2', '1 acre = 4046.86 m2'],
    [1, 'ha', 'acre', '1 ha = 2.47105 acre'],
    [1, 'kWh', 'kJ', '1 kWh = 3600 kJ'],
    [1, 'kcal', 'kJ', '1 kcal = 4.184 kJ'],
    [100, 'Wh', 'BTU', '100 Wh = 341.214 BTU'],
  ])('%s %s to %s', (value, from, to, expected) => {
    expect(run(value, from, to)).toBe(expected);
  });

  it('reads the spellings a model actually sends', () => {
    expect(run(3, 'Miles', 'kilometers')).toBe('3 mi = 4.82803 km');
    expect(run(2, 'pounds', 'Kilograms')).toBe('2 lb = 0.907185 kg');
    expect(run(72, 'degrees Fahrenheit', 'celsius')).toBe('72 °F = 22.2222 °C');
    expect(run(72, '°F', '°C')).toBe('72 °F = 22.2222 °C');
    expect(run(1, 'US gallon', 'litres')).toBe('1 US gal = 3.78541 L');
    expect(run(30, 'lbs.', 'KG')).toBe('30 lb = 13.6078 kg');
    expect(run(15, 'knots', 'mph')).toBe('15 kn = 17.2617 mph');
    expect(run(2, 'cups', 'ml')).toBe('2 US cup = 473.176 mL');
  });

  it('takes the number as text, as models often send it', () => {
    expect(run('2.5', 'cm', 'in')).toBe('2.5 cm = 0.984252 in');
  });

  it('refuses a missing, empty or non-numeric value', () => {
    expect(() => run(undefined, 'm', 'ft')).toThrow('value must be a number');
    expect(() => run('', 'm', 'ft')).toThrow('value must be a number');
    expect(() => run('five', 'm', 'ft')).toThrow('value must be a number');
    expect(() => run(Infinity, 'm', 'ft')).toThrow('value must be a number');
  });

  it('names the unit it does not know and lists the ones it does', () => {
    expect(() => run(1, 'furlong', 'm')).toThrow(/Unknown unit "furlong"\. Known units: length: mm, cm, m, km/);
    expect(() => run(1, 'm', undefined)).toThrow(/Unknown unit ""/);
  });

  it('does not guess at "nm", which is a nanometre to some and a nautical mile to others', () => {
    expect(() => run(1, 'nm', 'm')).toThrow(/Unknown unit "nm"/);
  });

  it('refuses to convert between different kinds of quantity', () => {
    expect(() => run(1, 'mi', 'kg')).toThrow('Cannot convert length (mi) to mass (kg)');
  });

  it('refuses a temperature below absolute zero', () => {
    expect(() => run(-300, 'C', 'F')).toThrow('-300 °C is below absolute zero');
    expect(run(0, 'K', 'C')).toBe('0 K = -273.15 °C');
  });

  it('keeps very large and very small results readable', () => {
    expect(run(1, 'mm', 'km')).toBe('1 mm = 0.000001 km');
    expect(run(1, 'mg', 't')).toBe('1 mg = 1e-9 t');
    expect(run(0, 'F', 'F')).toBe('0 °F = 0 °F');
  });
});
