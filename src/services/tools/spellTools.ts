import { ToolCall } from './types';

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
// Maps, not plain objects: the keys are characters the model passed.
const PHONETIC = new Map([...pairs(LETTERS, WORDS), ...pairs(DIGITS, DIGIT_WORDS), ['-', 'Dash'], ['/', 'Slash']]);
const MORSE = new Map([...pairs(LETTERS, CODES), ...pairs(DIGITS, DIGIT_CODES), ...MARK_CODES]);
// The distress signal is sent as one run, with no gaps between its letters.
const FROM_MORSE = new Map([...[...MORSE].map(([char, code]): [string, string] => [code, char]), ['...---...', 'SOS']]);

const LOOKS_LIKE_MORSE = /^[\s.\-·•∙–—−_/|]+$/;
const HAS_A_SIGNAL = /[.\-·•∙–—−_]/;

type Lookup = (char: string, next: string | undefined) => string | undefined;
/** A point before a digit is a decimal point; any other full stop has no radio word. */
const radioWord: Lookup = (char, next) => (char === '.' ? (next && /\d/.test(next) ? 'Decimal' : undefined) : PHONETIC.get(char));
const morseCode: Lookup = char => MORSE.get(char);

/** One line with no control characters: the answer repeats it. */
function clean(text: string): string {
  return [...text.replace(/\s+/g, ' ')].filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127).join('').replace(/ +/g, ' ').trim();
}

/** The text spelled word by word, with a note naming every character the table has nothing for. */
function spell(text: string, lookup: Lookup): string {
  const leftOut = new Set<string>();
  const words = text.split(' ').map(word => {
    // An accented letter is spelled as its plain letter.
    const chars = [...word.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()];
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

function readChoice(raw: unknown): 'phonetic' | 'morse' | 'both' {
  const choice = typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
  if (choice === undefined || choice === null || choice === '') return 'both';
  if (choice === 'phonetic' || choice === 'morse') return choice;
  throw new Error('to must be "phonetic" or "morse", or left out for both.');
}

export function spellOut(call: ToolCall): string {
  const { text: raw, to } = call.arguments;
  const given = typeof raw === 'number' ? String(raw) : raw;
  if (typeof given !== 'string' || given.trim() === '') throw new Error('Give the text to spell, or the Morse code to read.');
  const choice = readChoice(to);
  // Morse is read back whichever spelling was asked for: the answer is the same text either way.
  if (LOOKS_LIKE_MORSE.test(given) && HAS_A_SIGNAL.test(given)) return readMorse(given);

  const text = clean(given);
  if ([...text].length > MAX_CHARS) throw new Error(`That is too long to spell out: ${MAX_CHARS} characters at most.`);
  const radio = choice === 'morse' ? '' : spell(text, radioWord);
  const morse = choice === 'phonetic' ? '' : spell(text, morseCode);
  if (nothingSpelled(radio) && nothingSpelled(morse)) throw new Error('Nothing in that can be spelled: use letters and digits.');
  if (choice === 'both') return `${text} = ${radio}\nMorse: ${morse}`;
  return `${text} = ${radio || morse}`;
}
