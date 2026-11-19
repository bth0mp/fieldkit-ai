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
  length('yd', 0.9144, ['yard']),
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
  speed('km/h', 1000 / 3600, ['kph', 'kmh', 'kilometer per hour', 'kilometre per hour']),
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
  energy('cal', 4.184, ['calorie']),
  energy('kcal', 4184, ['kilocalorie', 'food calorie']),
  energy('BTU', 1055.05585262, ['british thermal unit']),
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
    // Plurals of names only ("miles", "knots"); a plural of a symbol ("ms", "gs") means nothing.
    if (!name.endsWith('s')) register(`${name}s`, u);
  }
}

/** Case-blind on purpose: no two units here differ only by case, and models send "KM", "Kg" and "f". */
function findUnit(raw: unknown): Unit | null {
  return typeof raw === 'string' ? BY_NAME.get(normalize(raw)) ?? null : null;
}

function knownUnits(): string {
  const byDimension = new Map<string, string[]>();
  for (const u of UNITS) byDimension.set(u.dimension, [...(byDimension.get(u.dimension) ?? []), u.symbol]);
  return [...byDimension].map(([dimension, symbols]) => `${dimension}: ${symbols.join(', ')}`).join('; ');
}

/** Up to 6 significant digits, no trailing zeros; an exponent only for sizes nobody writes out. */
function formatNumber(n: number): string {
  const rounded = Number(n.toPrecision(6));
  const abs = Math.abs(rounded);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) return rounded.toExponential().replace('e+', 'e');
  return String(rounded);
}

export function convertUnits(call: ToolCall): string {
  const { value: rawValue, from: rawFrom, to: rawTo } = call.arguments;
  // Models often send the number as text ("5"). An empty string must not read as 0.
  const value = typeof rawValue === 'string' && rawValue.trim() !== '' ? Number(rawValue) : rawValue;
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

  const base = value * from.factor + from.offset;
  if (from.dimension === 'temperature' && base < -1e-9) {
    throw new Error(`${formatNumber(value)} ${from.symbol} is below absolute zero`);
  }
  let result = (base - to.offset) / to.factor;
  // Subtracting two offsets leaves float dust where the true answer is zero (32 °F is 0 °C, not 5.7e-14).
  if (to.offset !== 0 && Math.abs(result) < Math.abs(base / to.factor) * 1e-12) result = 0;
  return `${formatNumber(value)} ${from.symbol} = ${formatNumber(result)} ${to.symbol}`;
}
