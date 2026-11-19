/**
 * Code points that draw nothing or change how what follows is drawn, as [first, last] pairs. Tab and the line
 * breaks are not here: they are white space and become a space. The joiners U+200C and U+200D and the emoji
 * presentation selectors (U+FE00 to U+FE0F) are not here either: scripts and emoji need them.
 *
 * ponytail: a table, not /\p{Cf}/u. Nothing else in the app uses Unicode property classes, so the phone's
 * engine accepting them is unproven, and a pattern it rejected would stop the app at launch. Revisit the table
 * when Unicode adds format characters.
 */
const INVISIBLE: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], // C0 controls
  [0x7f, 0x9f], // delete and the C1 controls
  [0xad, 0xad], // soft hyphen
  [0x61c, 0x61c], // Arabic letter mark
  [0x115f, 0x1160], // Hangul fillers
  [0x180b, 0x180f], // Mongolian variation selectors and vowel separator
  [0x200b, 0x200b], // zero-width space
  [0x200e, 0x200f], // direction marks
  [0x202a, 0x202e], // bidirectional embeddings and overrides
  [0x2060, 0x206f], // word joiner, invisible operators, bidirectional isolates, deprecated format characters
  [0x2800, 0x2800], // braille blank
  [0x3164, 0x3164], // Hangul filler
  [0xfeff, 0xfeff], // byte-order mark
  [0xffa0, 0xffa0], // half-width Hangul filler
  [0xfff9, 0xfffb], // interlinear annotation marks
  [0x13430, 0x1343f], // Egyptian hieroglyph format controls
  [0x1bca0, 0x1bca3], // shorthand format controls
  [0x1d173, 0x1d17a], // musical format controls
  [0xe0000, 0xe0fff], // tag characters, which can spell unseen text, and the variation selectors supplement
];

const isInvisible = (code: number) => INVISIBLE.some(([first, last]) => code >= first && code <= last);

/**
 * Text someone typed, or a file supplied, as one line of plain text: invisible characters go, runs of white
 * space become one space, and it is cut to `max` characters (code points, so never through a surrogate pair).
 * Used for names shown in rows and for file titles that go into the assistant's system prompt.
 */
export function oneLine(text: string, max: number): string {
  const plain = [...text].filter(c => !isInvisible(c.codePointAt(0) ?? 0)).join('').replace(/\s+/g, ' ').trim();
  return [...plain].slice(0, max).join('').trimEnd();
}
