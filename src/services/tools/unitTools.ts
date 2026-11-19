import { ToolCall } from './types';

/**
 * convert_units: exact, table-driven unit conversion, so the model never does unit arithmetic itself.
 * Each unit is a factor to its dimension's base unit (temperature also has an offset, in kelvin). Factors
 * are the defined values (1 in = 0.0254 m, 1 lb = 0.45359237 kg, 1 US gal = 3.785411784 L), not rounded ones.
 * Cooking and liquid measures are US customary and say so in the answer; imperial ones are named as such.
 */
type Unit = { dimension: string; symbol: string; factor: number; offset: number; names: string[] };

const unitsOf = (dimension: string) => (symbol: string, factor: number, names: string[]): Unit =>
  ({ dimension, symbol, factor, offset: 0, names });
const length = unitsOf('length');
const mass = unitsOf('mass');
const volume = unitsOf('volume');
const temperature = unitsOf('temperature');
const speed = unitsOf('speed');
const pressure = unitsOf('pressure');
const area = unitsOf('area');
const energy = unitsOf('energy');

const UNITS: Unit[] = [
  // length, base metre
  length('mm', 0.001, ['millimeter', 'millimetre']),
  length('cm', 0.01, ['centimeter', 'centimetre']),
  length('m', 1, ['meter', 'metre']),
  length('km', 1000, ['kilometer', 'kilometre', 'klick']),
  length('in', 0.0254, ['inch', 'inches']),
  length('ft', 0.3048, ['foot', 'feet']),
  length('yd', 0.9144, ['yard', 'yds']),
  length('fathom', 1.8288, ['fathom']),
  length('mi', 1609.344, ['mile', 'statute mile']),
  length('nmi', 1852, ['nautical mile']),
  // mass, base kilogram
  mass('mg', 1e-6, ['milligram']),
  mass('g', 0.001, ['gram', 'gramme']),
  mass('kg', 1, ['kilogram', 'kilo']),
  mass('t', 1000, ['tonne', 'metric ton']),
  mass('oz', 0.028349523125, ['ounce']),
  mass('lb', 0.45359237, ['pound', 'lbs']),
  mass('st', 6.35029318, ['stone']),
  mass('short ton', 907.18474, ['ton', 'us ton']),
  // volume, base litre
  volume('mL', 0.001, ['milliliter', 'millilitre', 'cc']),
  volume('L', 1, ['liter', 'litre']),
  volume('m3', 1000, ['cubic meter', 'cubic metre', 'm^3', 'm³']),
  volume('US tsp', 0.00492892159375, ['tsp', 'teaspoon']),
  volume('US tbsp', 0.01478676478125, ['tbsp', 'tablespoon']),
  volume('US fl oz', 0.0295735295625, ['fl oz', 'floz', 'fluid ounce']),
  volume('US cup', 0.2365882365, ['cup']),
  volume('US pt', 0.473176473, ['pt', 'pint']),
  volume('US qt', 0.946352946, ['qt', 'quart']),
  volume('US gal', 3.785411784, ['gal', 'gallon', 'us gallon']),
  volume('imp gal', 4.54609, ['imperial gallon', 'uk gallon']),
  // temperature, base kelvin
  { ...temperature('°C', 1, ['c', 'celsius', 'centigrade', 'degc', 'deg c']), offset: 273.15 },
  { ...temperature('°F', 5 / 9, ['f', 'fahrenheit', 'degf', 'deg f']), offset: 459.67 * 5 / 9 },
  temperature('K', 1, ['kelvin']),
  // speed, base metre per second
  speed('m/s', 1, ['mps', 'meter per second', 'metre per second']),
  speed('km/h', 1000 / 3600, ['kph', 'kmh', 'kmph', 'km/hr', 'kilometer per hour', 'kilometre per hour']),
  speed('mph', 1609.344 / 3600, ['mile per hour', 'mi/h']),
  speed('kn', 1852 / 3600, ['knot', 'kt']),
  // pressure, base pascal
  pressure('Pa', 1, ['pascal']),
  pressure('hPa', 100, ['hectopascal', 'mbar', 'mb', 'millibar']),
  pressure('kPa', 1000, ['kilopascal']),
  pressure('bar', 100000, ['bar']),
  pressure('psi', 6894.757293168, ['pound per square inch', 'lb/in2']),
  pressure('atm', 101325, ['atmosphere']),
  pressure('mmHg', 133.322387415, ['torr']),
  pressure('inHg', 3386.389, ['inch of mercury', 'inches of mercury']),
  // area, base square metre
  area('m2', 1, ['square meter', 'square metre', 'sq m', 'm^2', 'm²']),
  area('km2', 1e6, ['square kilometer', 'square kilometre', 'sq km', 'km^2', 'km²']),
  area('ha', 10000, ['hectare']),
  area('ft2', 0.09290304, ['square foot', 'square feet', 'sq ft', 'ft^2', 'ft²']),
  area('acre', 4046.8564224, ['acre']),
  area('mi2', 2589988.110336, ['square mile', 'sq mi', 'mi^2', 'mi²']),
  // energy, base joule
  energy('J', 1, ['joule']),
  energy('kJ', 1000, ['kilojoule']),
  energy('Wh', 3600, ['watt hour', 'watt-hour']),
  energy('kWh', 3.6e6, ['kilowatt hour', 'kilowatt-hour']),
  // "calorie" is not a name of either: see refuseAmbiguous.
  energy('cal', 4.184, ['small calorie', 'gram calorie']),
  energy('kcal', 4184, ['kilocalorie', 'food calorie']),
  energy('BTU', 1055.05585262, ['btu', 'british thermal unit']),
];

/** One spelling of a name: lower case, no dots, no leading "degrees", single spaces. */
function normalize(raw: string): string {
  return raw.toLowerCase().replaceAll('.', '').replace(/^degrees?\s+/, '').replaceAll(/\s+/g, ' ').trim();
}

/** Every spelling a unit answers to. Symbols go in first so an alias can never take a symbol's place. */
const BY_NAME = new Map<string, Unit>();
const register = (name: string, u: Unit) => {
  const key = normalize(name);
  if (!BY_NAME.has(key)) BY_NAME.set(key, u);
};
for (const u of UNITS) register(u.symbol, u);
for (const u of UNITS) {
  for (const name of u.names) {
    register(name, u);
    // Plurals of names only ("miles", "knots"); a plural of a symbol or of a one-letter name ("ms", "cs")
    // means nothing. A rate is made plural in its first word: "miles per hour".
    if (name.length > 1 && !name.endsWith('s')) register(`${name}s`, u);
    if (name.includes(' per ')) register(name.replace(' per ', 's per '), u);
  }
}

const WHICH_CALORIE = 'can mean the small calorie (cal, 4.184 J) or the food Calorie (kcal, 4184 J). Say cal or kcal.';

/**
 * Two spellings mean units a thousand, or a thousand million, apart, and the wrong one would be a confident
 * wrong answer: the caller is asked which. "cal" and "mg" written exactly are taken as written.
 */
function refuseAmbiguous(raw: unknown): void {
  if (typeof raw !== 'string') return;
  const written = raw.trim();
  const key = normalize(written);
  const isCalorieWord = key === 'calorie' || key === 'calories';
  if (isCalorieWord || (key === 'cal' && written.replaceAll('.', '') !== 'cal')) throw new Error(`"${written}" ${WHICH_CALORIE}`);
  if (written === 'Mg') throw new Error('"Mg" can mean a milligram (mg) or a megagram, which is a tonne (t). Say mg or t.');
}

/** Case-blind on purpose: models send "KM", "Kg" and "f". The two cases where case matters are refused first. */
function findUnit(raw: unknown): Unit | null {
  refuseAmbiguous(raw);
  return typeof raw === 'string' ? BY_NAME.get(normalize(raw)) ?? null : null;
}

function knownUnits(): string {
  const byDimension = new Map<string, string[]>();
  for (const u of UNITS) byDimension.set(u.dimension, [...(byDimension.get(u.dimension) ?? []), u.symbol]);
  return [...byDimension].map(([dimension, symbols]) => `${dimension}: ${symbols.join(', ')}`).join('; ');
}

/**
 * Six significant digits, or as many as the whole-number part has: a rounded result is never padded with
 * zeros that read as exact. No trailing zeros; an exponent only for sizes nobody writes out.
 */
function formatNumber(n: number, digits = 6): string {
  const whole = Math.abs(n) >= 1 ? Math.floor(Math.log10(Math.abs(n))) + 1 : 0;
  const rounded = Number(n.toPrecision(Math.min(15, Math.max(digits, whole))));
  const abs = Math.abs(rounded);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) return rounded.toExponential().replace('e+', 'e');
  return String(rounded);
}

const PLAIN_DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

export function convertUnits(call: ToolCall): string {
  const { value: rawValue, from: rawFrom, to: rawTo } = call.arguments;
  // Models often send the number as text ("5"). Only a plain decimal is read: an empty string must not be 0,
  // nor "0x10" sixteen.
  const value = typeof rawValue === 'string' && PLAIN_DECIMAL.test(rawValue.trim()) ? Number(rawValue) : rawValue;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Missing or invalid parameter: value must be a number');
  }

  const from = findUnit(rawFrom);
  const to = findUnit(rawTo);
  if (!from || !to) {
    const unknown = from ? rawTo : rawFrom;
    throw new Error(`Unknown unit "${typeof unknown === 'string' ? unknown : ''}". Known units: ${knownUnits()}`);
  }
  if (from.dimension !== to.dimension) {
    throw new Error(`Cannot convert ${from.dimension} (${from.symbol}) to ${to.dimension} (${to.symbol})`);
  }

  // The caller's own number is echoed as sent, not rounded to six digits.
  const sent = formatNumber(value, 15);
  let base = value * from.factor + from.offset;
  if (from.dimension === 'temperature') {
    if (base < -1e-9) throw new Error(`${sent} ${from.symbol} is below absolute zero`);
    // Adding an offset leaves float dust at absolute zero itself (-459.67 °F is 0 K, not -2.8e-14 K).
    if (Math.abs(base) < 1e-9) base = 0;
  }
  let result = (base - to.offset) / to.factor;
  // Subtracting two offsets leaves float dust where the true answer is zero (32 °F is 0 °C, not 5.7e-14).
  if (to.offset !== 0 && Math.abs(result) < Math.abs(base / to.factor) * 1e-12) result = 0;
  if (!Number.isFinite(result)) throw new Error('That is too large to convert.');
  return `${sent} ${from.symbol} = ${formatNumber(result)} ${to.symbol}`;
}
