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

  it('does not round a large result to a few digits and pad the rest with zeros', () => {
    // 1000 mi is 1 609 344 m exactly. Six digits padded with a zero read as an exact, and wrong, 1 609 340.
    expect(run(1000, 'mi', 'm')).toBe('1000 mi = 1609344 m');
    // 1 234 567 / 0.3048 = 4 050 416.67; the caller's own number comes back as it was sent.
    expect(run(1234567, 'm', 'ft')).toBe('1234567 m = 4050417 ft');
    // 123 456 789 km / 1.609344 = 76 712 492.17 mi.
    expect(run(123456789, 'km', 'mi')).toBe('123456789 km = 76712492 mi');
    expect(run(0.1 + 0.2, 'm', 'cm')).toBe('0.3 m = 30 cm');
  });

  it('gives absolute zero as exactly zero kelvin, whichever scale it came from', () => {
    expect(run(-459.67, 'F', 'K')).toBe('-459.67 °F = 0 K');
    expect(run(-273.15, 'C', 'K')).toBe('-273.15 °C = 0 K');
  });

  it('asks which calorie is meant, since the food Calorie is a thousand of the other', () => {
    const which = 'can mean the small calorie (cal, 4.184 J) or the food Calorie (kcal, 4184 J). Say cal or kcal.';
    expect(() => run(250, 'Calories', 'kJ')).toThrow(`"Calories" ${which}`);
    expect(() => run(2000, 'calories', 'kcal')).toThrow(`"calories" ${which}`);
    expect(() => run(1, 'kJ', 'calorie')).toThrow(`"calorie" ${which}`);
    expect(() => run(250, 'Cal', 'kJ')).toThrow(`"Cal" ${which}`);
    // Named exactly, each is taken as written.
    expect(run(250, 'cal', 'J')).toBe('250 cal = 1046 J');
    expect(run(250, 'kcal', 'kJ')).toBe('250 kcal = 1046 kJ');
    expect(run(250, 'food calories', 'kJ')).toBe('250 kcal = 1046 kJ');
    expect(run(1, 'kilocalorie', 'cal')).toBe('1 kcal = 1000 cal');
  });

  it('asks about "Mg", a milligram to a hurried typist and a tonne by the book', () => {
    expect(() => run(1, 'Mg', 'kg')).toThrow('"Mg" can mean a milligram (mg) or a megagram, which is a tonne (t). Say mg or t.');
    expect(run(1, 'mg', 'g')).toBe('1 mg = 0.001 g');
    expect(run(1, 'MG', 'g')).toBe('1 mg = 0.001 g');
  });

  it('does not make a unit out of a one-letter symbol and an s', () => {
    expect(() => run(20, 'cs', 'f')).toThrow(/Unknown unit "cs"/);
    expect(() => run(20, 'fs', 'c')).toThrow(/Unknown unit "fs"/);
  });

  it('reads rates and plurals as people write them', () => {
    expect(run(60, 'miles per hour', 'kilometers per hour')).toBe('60 mph = 96.5606 km/h');
    expect(run(10, 'metres per second', 'km/hr')).toBe('10 m/s = 36 km/h');
    expect(run(30, 'pounds per square inch', 'kPa')).toBe('30 psi = 206.843 kPa');
    expect(run(100, 'yds', 'm')).toBe('100 yd = 91.44 m');
    expect(run(2, 'BTUs', 'kJ')).toBe('2 BTU = 2.11011 kJ');
  });

  it('takes a number only as a plain decimal, not as hexadecimal or another base', () => {
    for (const odd of ['0x10', '0b11', '0o17', '1_000', '١٢']) {
      expect(() => run(odd, 'km', 'mi')).toThrow('value must be a number');
    }
    expect(run('1e3', 'm', 'km')).toBe('1000 m = 1 km');
    expect(run(' -2.5 ', 'C', 'K')).toBe('-2.5 °C = 270.65 K');
    expect(run('.5', 'km', 'm')).toBe('0.5 km = 500 m');
  });

  it('refuses a result too large to write, instead of printing Infinity', () => {
    expect(() => run(1e308, 'km', 'mm')).toThrow('That is too large to convert.');
  });
});
