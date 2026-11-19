/**
 * Calculators: the assistant's tools that work an answer out on the phone from what is typed, offered to the
 * user as boxes to fill in. The answer is the tool's own, from the same code the assistant calls, so nothing is
 * worked out twice. No model is involved.
 *
 * Only the tools named here can be run from the screen: none of them uses the network, the phone's location, a
 * permission or anyone's private data, and none sends or writes anything.
 */
import { AVAILABLE_TOOLS, executeToolCall } from '../../services/tools';

const IDS = ['calculator', 'convert_units', 'convert_coordinates', 'sun_times', 'distance_bearing', 'date_math', 'phonetic_morse'];

/** Where a tool's own words for a box, written for a model, do not tell a person enough. */
const HINTS = new Map([
  ['calculator.expression', 'Numbers with + - * / ^ and brackets, for example (3+4)*2. % gives the remainder, not a percentage.'],
]);

/** What every tool takes for a number: digits, a sign, a decimal point, an exponent. Each may be stricter. */
const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

interface CalculatorField {
  key: string;
  label: string;
  /** What to put in the box. */
  hint: string;
  required: boolean;
  numeric: boolean;
}

export interface Calculator {
  id: string;
  title: string;
  fields: CalculatorField[];
}

/** "add_days" as "Add days": the box's name on the screen. */
function labelOf(key: string): string {
  if (key === 'utc_offset') return 'UTC offset';
  const words = key.replace(/_/g, ' ');
  return words[0].toUpperCase() + words.slice(1);
}

export const CALCULATORS: Calculator[] = IDS.flatMap(id => {
  const tool = AVAILABLE_TOOLS.find(candidate => candidate.id === id);
  if (!tool) return [];
  const fields = Object.entries(tool.parameters).map(([key, parameter]) => ({
    key,
    label: labelOf(key),
    hint: HINTS.get(`${id}.${key}`)
      ?? (parameter.enum ? `${parameter.description} (${parameter.enum.join(' or ')})` : parameter.description),
    required: parameter.required === true,
    numeric: parameter.type === 'number',
  }));
  return [{ id, title: tool.displayName, fields }];
});

/**
 * A tool's words with its boxes called what the screen calls them. The tools speak to a model and name their
 * parameters: "add_days must be a whole number", "Give utc_offset for the place".
 */
function inScreenWords(text: string, calculator: Calculator, refusal: boolean): string {
  // What to do with the answer is said to the model; the person who typed the question needs no telling.
  let said = text.replace(' Ask which is meant before using either.', '');
  for (const field of calculator.fields) {
    if (field.key.includes('_')) said = said.replaceAll(field.key, field.label);
  }
  // An answer repeats what was typed, which may look like a box's name ("to: bob"): only a refusal is reworded
  // where the name is an ordinary word.
  if (!refusal) return said;
  for (const field of calculator.fields) {
    // "Give either end (to count ...)": a box named in passing, followed by what it is for.
    said = said.replaceAll(` ${field.key} (`, ` ${field.label} (`);
  }
  const first = calculator.fields.find(field => said.startsWith(`${field.key} must`) || said.startsWith(`${field.key}: `));
  return first ? first.label + said.slice(first.key.length) : said;
}

/**
 * What the tool answers for the boxes as filled in, or why it has no answer. A needed box left empty is named
 * and the tool is not run; an optional one left empty is left out of the call; a number box must hold a plain
 * number (the unit, the "UTC+", the comma belong elsewhere or nowhere).
 */
export async function workOut(id: string, typed: Record<string, string>): Promise<{ answer: string; problem: string }> {
  const calculator = CALCULATORS.find(candidate => candidate.id === id);
  if (!calculator) return { answer: '', problem: 'That calculator is not available.' };
  const filled = new Map(calculator.fields.map(field => [field.key, (typed[field.key] ?? '').trim()]));
  const missing = calculator.fields.find(field => field.required && filled.get(field.key) === '');
  if (missing) return { answer: '', problem: `Fill in "${missing.label}".` };
  const isNumber = (text: string) => PLAIN_NUMBER.test(text) && Number.isFinite(Number(text));
  const notNumber = calculator.fields.find(field => field.numeric && filled.get(field.key) !== '' && !isNumber(filled.get(field.key) ?? ''));
  if (notNumber) return { answer: '', problem: `"${notNumber.label}" must be a plain number, for example 5.5 or -5.` };
  // A number goes to the tool written one way ("5." and "+5" as 5, ".5" as 0.5): the tools' own patterns differ.
  for (const field of calculator.fields) {
    const value = filled.get(field.key) ?? '';
    if (field.numeric && value !== '') filled.set(field.key, String(Number(value)));
  }
  const given = Object.fromEntries([...filled].filter(([, value]) => value !== ''));
  const result = await executeToolCall({ name: calculator.id, arguments: given });
  return result.error
    ? { answer: '', problem: inScreenWords(result.error, calculator, true) }
    : { answer: inScreenWords(result.content, calculator, false), problem: '' };
}
