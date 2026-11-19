import { ToolCall } from './types';
import { oneLine, stripInvisible } from '../../utils/oneLine';

/**
 * phonetic_morse: text spelled in the radio (ICAO) alphabet and in International Morse code, and Morse read
 * back. A small model gets both wrong letter by letter; a table does not. The Morse set is ITU-R M.1677-1's
 * letters, digits and thirteen punctuation marks. Anything else is left out and named, never dropped silently.
 */
const MAX_CHARS = 200;
const MAX_MORSE_CHARS = 1200;
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const WORDS = 'Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu'.split(' ');
const DIGIT_WORDS = 'Zero One Two Three Four Five Six Seven Eight Nine'.split(' ');
const CODES = '.- -... -.-. -.. . ..-. --. .... .. .--- -.- .-.. -- -. --- .--. --.- .-. ... - ..- ...- .-- -..- -.-- --..'.split(' ');
const DIGIT_CODES = '----- .---- ..--- ...-- ....- ..... -.... --... ---.. ----.'.split(' ');
const MARK_CODES: Array<[string, string]> = [
  ['.', '.-.-.-'], [',', '--..--'], [':', '---...'], ['?', '..--..'], ["'", '.----.'], ['-', '-....-'], ['/', '-..-.'],
  ['(', '-.--.'], [')', '-.--.-'], ['"', '.-..-.'], ['=', '-...-'], ['+', '.-.-.'], ['@', '.--.-.'],
];

const pairs = (keys: string[], values: string[]) => keys.map((key, i): [string, string] => [key, values[i]]);
const DIGITS = DIGIT_WORDS.map((_, i) => String(i));
/** The two published tables, also shown as Quick reference cards: one copy of each. */
export const RADIO_WORDS: ReadonlyArray<[string, string]> = [...pairs(LETTERS, WORDS), ...pairs(DIGITS, DIGIT_WORDS)];
export const MORSE_CODES: ReadonlyArray<[string, string]> = [...pairs(LETTERS, CODES), ...pairs(DIGITS, DIGIT_CODES), ...MARK_CODES];
// Maps, not plain objects: the keys are characters the model passed.
const PHONETIC = new Map([...RADIO_WORDS, ['-', 'Dash'], ['/', 'Slash']]);
const MORSE = new Map(MORSE_CODES);
// The distress signal is sent as one run, with no gaps between its letters.
const FROM_MORSE = new Map([...[...MORSE].map(([char, code]): [string, string] => [code, char]), ['...---...', 'SOS']]);

/** Dots and dashes as people type them: the plain ones and the look-alikes a keyboard offers. */
const MARK = /[.\-·•∙–—−_]/g;
const ONLY_MORSE = /^[\s.\-·•∙–—−_/|]+$/;

type Lookup = (char: string, next: string | undefined) => string | undefined;
/** A point before a digit is a decimal point; any other full stop has no radio word. */
const radioWord: Lookup = (char, next) => (char === '.' ? (next && /\d/.test(next) ? 'Decimal' : undefined) : PHONETIC.get(char));
const morseCode: Lookup = char => MORSE.get(char);

/** Unicode normalisation where the engine has it; the text as it is where it does not. */
const normalized = (text: string, form: 'NFC' | 'NFD') => (typeof text.normalize === 'function' ? text.normalize(form) : text);
const isCombiningMark = (char: string) => { const code = char.codePointAt(0) ?? 0; return code >= 0x300 && code <= 0x36f; };

/**
 * An accented letter as its plain letter. Only a letter: Unicode also writes some signs as another sign plus a
 * mark ("not equal" as "equals" with a stroke), and those are not the sign they contain.
 */
function plainLetter(char: string): string {
  const [base, ...marks] = [...normalized(char, 'NFD')];
  return marks.length > 0 && /^[A-Za-z]$/.test(base) && marks.every(isCombiningMark) ? base : char;
}

/** The text spelled word by word, with a note naming every character the table has nothing for. */
function spell(text: string, lookup: Lookup): string {
  const leftOut = new Set<string>();
  const words = text.split(' ').map(word => {
    const chars = [...[...normalized(word, 'NFC')].map(plainLetter).join('').toUpperCase()];
    const spelled: string[] = [];
    chars.forEach((char, i) => {
      const found = lookup(char, chars[i + 1]);
      if (found) spelled.push(found);
      else leftOut.add(char);
    });
    return spelled.join(' ');
  });
  const note = leftOut.size > 0 ? `(left out: ${[...leftOut].join(' ')})` : '';
  return [words.filter(Boolean).join(' / '), note].filter(Boolean).join(' ');
}

const nothingSpelled = (line: string) => line === '' || line.startsWith('(left out');

function readChoice(raw: unknown): 'phonetic' | 'morse' | 'both' {
  const choice = typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
  if (choice === undefined || choice === null || choice === '' || choice === 'both') return 'both';
  if (choice === 'phonetic' || choice === 'morse') return choice;
  throw new Error('to must be "phonetic" or "morse", or left out for both.');
}

/** Plain text spelled the way that was asked for. */
function spellText(given: string, to: unknown): string {
  const choice = readChoice(to);
  const text = oneLine(given, MAX_CHARS + 1);
  if ([...text].length > MAX_CHARS) throw new Error(`That is too long to spell out: ${MAX_CHARS} characters at most.`);
  const radio = choice === 'morse' ? '' : spell(text, radioWord);
  const morse = choice === 'phonetic' ? '' : spell(text, morseCode);
  if (nothingSpelled(radio) && nothingSpelled(morse)) throw new Error('Nothing in that can be spelled: use letters and digits.');
  if (choice === 'both') return `${text} = ${radio}\nMorse: ${morse}`;
  return `${text} = ${radio || morse}`;
}

function readMorse(given: string): string {
  if (given.length > MAX_MORSE_CHARS) throw new Error(`That is too long to read: ${MAX_MORSE_CHARS} characters of Morse at most.`);
  // A slash, a bar, a new line or a wide gap ends a word; one space ends a letter.
  const words = given.replace(/[·•∙]/g, '.').replace(/[–—−_]/g, '-')
    .split(/\s*[/|\r\n]\s*|\s{2,}/)
    .map(word => word.trim().split(/\s/))
    .filter(codes => codes[0] !== '');
  let unknown = 0;
  const text = words.map(codes => codes.map(code => {
    const char = FROM_MORSE.get(code);
    if (!char) unknown++;
    return char ?? '?';
  }).join('')).join(' ');
  const note = unknown > 0 ? ` (${unknown} code${unknown === 1 ? '' : 's'} not recognised, shown as ?)` : '';
  return `${words.map(codes => codes.join(' ')).join(' / ')} = ${text}${note}`;
}

/**
 * What was sent, as Morse would be written: nothing invisible, the keyboard's one-character ellipsis as three
 * dots, and no label ("Morse:"), quotation marks or backticks around it.
 */
function asMorseCandidate(sent: string): string {
  return stripInvisible(sent).replaceAll('…', '...').trim()
    .replace(/^morse(\s+code)?\s*:\s*/i, '')
    .replace(/^["'`“”]+|["'`“”]+$/g, '')
    .trim();
}

/** Mostly dots and dashes, but not only: Morse someone typed with something else in it. */
function straysInMorse(candidate: string): string[] {
  const solid = [...candidate].filter(c => !/\s/.test(c));
  const marks = candidate.match(MARK)?.length ?? 0;
  if (marks < 3 || marks / solid.length < 0.6) return [];
  return [...new Set(solid.filter(c => !ONLY_MORSE.test(c)))].slice(0, 5);
}

/** The Morse reading, and for a lone "." or "-" the character's own spelling as well: either may be meant. */
function readMorseOrMark(candidate: string, to: unknown): string {
  const reading = readMorse(candidate);
  if ([...candidate].length !== 1) return reading;
  let itself: string;
  try {
    itself = spellText(candidate, to);
  } catch {
    return reading;
  }
  return `${candidate} can be read two ways.\nAs Morse: ${reading}\nAs the character itself: ${itself}`;
}

export function spellOut(call: ToolCall): string {
  const { text: raw, to } = call.arguments;
  const sent = typeof raw === 'number' ? String(raw) : raw;
  if (typeof sent !== 'string' || sent.trim() === '') throw new Error('Give the text to spell, or the Morse code to read.');

  // Morse is read back whatever spelling was asked for: "to" says how to spell text, and this is not text.
  const candidate = asMorseCandidate(sent);
  if (ONLY_MORSE.test(candidate) && candidate.match(MARK)) return readMorseOrMark(candidate, to);
  const strays = straysInMorse(candidate);
  if (strays.length > 0) {
    throw new Error(`That looks like Morse code with other characters in it (${strays.join(' ')}). Send only dots, dashes, spaces and / between words.`);
  }
  return spellText(sent, to);
}
