/**
 * Code points that draw nothing or change how what follows is drawn, as [first, last] pairs. Tab and the line
 * breaks are not here: they are white space and become a space. The joiners U+200C and U+200D and the
 * variation selectors U+FE00 to U+FE0F are not here either: scripts and emoji need them inside text.
 *
 * ponytail: a table, not /\p{Cf}/u. Nothing else in the app uses Unicode property classes, so the phone's
 * engine accepting them is unproven, and a pattern it rejected would stop the app at launch. Revisit the table
 * when Unicode adds format characters. Known cost: a flag built from tag characters (England, Scotland, Wales)
 * loses them and shows as a plain black flag, and direction marks go from mixed-direction text.
 */
const INVISIBLE: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], // C0 controls
  [0x7f, 0x84], [0x86, 0x9f], // delete and the C1 controls, but for the next-line control, a line break
  [0xad, 0xad], // soft hyphen
  [0x34f, 0x34f], // combining grapheme joiner
  [0x61c, 0x61c], // Arabic letter mark
  [0x115f, 0x1160], // Hangul fillers
  [0x17b4, 0x17b5], // Khmer inherent vowels, which draw nothing
  [0x180b, 0x180f], // Mongolian variation selectors and vowel separator
  [0x200b, 0x200b], // zero-width space
  [0x200e, 0x200f], // direction marks
  [0x202a, 0x202e], // bidirectional embeddings and overrides
  [0x2060, 0x206f], // word joiner, invisible operators, bidirectional isolates, deprecated format characters
  [0x3164, 0x3164], // Hangul filler
  [0xd800, 0xdfff], // half of a surrogate pair: one only ever arrives here without its other half
  [0xfeff, 0xfeff], // byte-order mark
  [0xffa0, 0xffa0], // half-width Hangul filler
  [0xfff0, 0xfffc], // specials: interlinear annotation marks, the object replacement character
  [0x13430, 0x1343f], // Egyptian hieroglyph format controls
  [0x1bca0, 0x1bca3], // shorthand format controls
  [0x1d173, 0x1d17a], // musical format controls
  [0xe0000, 0xe0fff], // tag characters, which can spell unseen text, and the variation selectors supplement
];

const codeOf = (char: string) => char.codePointAt(0) ?? 0;
const isInvisible = (code: number) => INVISIBLE.some(([first, last]) => code >= first && code <= last);
const isJoiner = (code: number) => code === 0x200c || code === 0x200d;
const isSelector = (code: number) => code >= 0xfe00 && code <= 0xfe0f;

/**
 * Two blanks the engine's own white-space class does not know, as the white space they stand for: the
 * next-line control is a line break and the braille blank a space. Every caller gets them this way, so none
 * can carry a blank it cannot see or split on.
 */
function asWhiteSpace(char: string): string {
  const code = codeOf(char);
  if (code === 0x85) return '\n';
  return code === 0x2800 ? ' ' : char;
}

/** The text without its invisible characters. White space is left as it is, in a form the engine knows. */
export function stripInvisible(text: string): string {
  return [...text].filter(char => !isInvisible(codeOf(char))).map(asWhiteSpace).join('');
}

/**
 * Text someone typed, or a file supplied, as one line of plain text: invisible characters go, runs of white
 * space become one space, and it is cut to `max` characters (code points, so never through a surrogate pair).
 * Used for names shown in rows and for file titles that go into the assistant's system prompt.
 */
export function oneLine(text: string, max: number): string {
  const chars = [...stripInvisible(text).replace(/\s+/g, ' ').trim()].slice(0, max);
  // Joiners and selectors mean something only beside what they join or select: text that is nothing else is
  // empty, and a joiner left at either end by the cut or the typist joins nothing.
  if (chars.every(char => char === ' ' || isJoiner(codeOf(char)) || isSelector(codeOf(char)))) return '';
  const dangling = (char: string) => char === ' ' || isJoiner(codeOf(char));
  while (dangling(chars[chars.length - 1])) chars.pop();
  while (dangling(chars[0])) chars.shift();
  return chars.join('');
}
