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

interface CalculatorField {
  key: string;
  label: string;
  /** What to put in the box, in the words the tool's own definition uses. */
  hint: string;
  required: boolean;
}

export interface Calculator {
  id: string;
  title: string;
  fields: CalculatorField[];
}

/** "add_days" as "Add days": close to the name the tool uses when it refuses a value. */
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
    hint: parameter.enum ? `${parameter.description} (${parameter.enum.join(' or ')})` : parameter.description,
    required: parameter.required === true,
  }));
  return [{ id, title: tool.displayName, fields }];
});

/**
 * What the tool answers for the boxes as filled in, or why it has no answer, in the tool's own words. A needed
 * box left empty is named and the tool is not run; an optional one left empty is left out of the call.
 */
export async function workOut(id: string, typed: Record<string, string>): Promise<{ answer: string; problem: string }> {
  const calculator = CALCULATORS.find(candidate => candidate.id === id);
  if (!calculator) return { answer: '', problem: 'That calculator is not available.' };
  const filled = new Map(calculator.fields.map(field => [field.key, (typed[field.key] ?? '').trim()]));
  const missing = calculator.fields.find(field => field.required && filled.get(field.key) === '');
  if (missing) return { answer: '', problem: `Fill in "${missing.label}".` };
  const given = Object.fromEntries([...filled].filter(([, value]) => value !== ''));
  const result = await executeToolCall({ name: calculator.id, arguments: given });
  return result.error ? { answer: '', problem: result.error } : { answer: result.content, problem: '' };
}
