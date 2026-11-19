/**
 * Searching the Quick reference cards. What is typed is looked for at the start of a word in a row's sign or
 * meaning, never across two words or in the middle of one: "sun" is not in "signals under". The screen shows
 * every result with its card's notes and source, because a row without its card's warning, or a warning without
 * the row it is about, can mislead (the ground-to-air X, which the Army's code reads differently).
 */
import { QUICK_REFERENCE_CARDS, type ReferenceCard } from './cards';

type Row = ReferenceCard['rows'][number];

/** Lower case, one space between words. */
const words = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();
/** The same with hyphens read as spaces, so "pan pan" finds Pan-pan. */
const spaced = (text: string) => words(text.replace(/-/g, ' '));
/** With no spaces or hyphens at all, for a sign or a one-word meaning: "frs1" finds FRS 1, "xray" finds X-ray. */
const joined = (text: string) => text.toLowerCase().replace(/[\s-]+/g, '');
const isLetterOrDigit = (char: string | undefined) => char !== undefined && /[a-z0-9]/.test(char);

/** Small words that are in most notes and sources: finding a card by one of them finds every card. */
const COMMON = new Set(['and', 'the', 'for', 'not', 'are', 'but', 'use', 'may', 'any', 'all', 'can', 'has', 'its',
  'one', 'two', 'out', 'with', 'from', 'that', 'this', 'they', 'then', 'than', 'here', 'each', 'only', 'used', 'also']);

/**
 * Whether `text` holds `typed` starting at the start of a word; with `whole`, ending at the end of one too. A
 * number is not found inside a longer one: "8" is not in "18", nor "5625" in "462.5625".
 */
function holds(text: string, typed: string, whole = false): boolean {
  for (let at = text.indexOf(typed); at !== -1; at = text.indexOf(typed, at + 1)) {
    const before = text[at - 1];
    const insideNumber = /\d/.test(typed[0]) && before === '.' && /\d/.test(text[at - 2] ?? '');
    const after = text[at + typed.length];
    if (!isLetterOrDigit(before) && !insideNumber && !(whole && isLetterOrDigit(after))) return true;
  }
  return false;
}

/** A row for dots and dashes typed in: a code that contains them, or a sentence that quotes them as typed. */
function holdsMarks(row: Row, marks: string): boolean {
  const meaning = row.meaning.trim();
  return /\s/.test(meaning) ? words(meaning).includes(marks) : meaning.includes(marks.replace(/ /g, ''));
}

/**
 * A row for words typed in: its sign or meaning as written; or run together where it is a single word; or a
 * sign that has every word typed as a whole word ("cb 9" is CB channel 9).
 */
function holdsWords(row: Row, typed: string): boolean {
  const run = joined(typed);
  const oneWord = !/\s/.test(row.meaning.trim());
  const sign = spaced(row.sign);
  const parts = typed.split(' ');
  return holds(sign, typed) || holds(spaced(row.meaning), typed)
    || holds(joined(row.sign), run) || (oneWord && holds(joined(row.meaning), run))
    || (parts.length > 1 && parts.every(part => holds(sign, part, true)));
}

/** 0 for the row that is exactly what was typed, 1 for one whose sign has it as a word, 2 for the rest. */
function rank(row: Row, typed: string): number {
  if (joined(row.sign) === joined(typed) || words(row.meaning) === typed) return 0;
  return holds(spaced(row.sign), typed, true) ? 1 : 2;
}

/**
 * What a search finds, card by card: the matching rows, the exact one first. A card with no matching row that is
 * found by its name, or by a whole word of its notes or source, gives all its rows (three characters or more,
 * and not for words like "and").
 *
 * One character finds a sign that is it or has it as a word, and a Morse code that is exactly it: "s" is S in
 * the radio alphabet and in Morse, not every row with an s in it.
 */
export function searchCards(query: string): { card: ReferenceCard; rows: ReferenceCard['rows'] }[] {
  const typed = spaced(query);
  const marks = words(query);
  if (!marks) return [];
  const onlyMarks = /^[.\- ]+$/.test(marks);
  let matches: (row: Row) => boolean;
  if (marks.length === 1) matches = row => row.sign.toLowerCase().split(' ').includes(marks) || row.meaning === marks;
  else if (onlyMarks) matches = row => holdsMarks(row, marks);
  else matches = row => holdsWords(row, typed);
  const byCard = !onlyMarks && typed.length > 2 && !COMMON.has(typed);
  return QUICK_REFERENCE_CARDS.flatMap(card => {
    const matched = card.rows.filter(matches);
    if (matched.length > 0) {
      const key = onlyMarks ? marks : typed;
      return [{ card, rows: [0, 1, 2].flatMap(wanted => matched.filter(row => rank(row, key) === wanted)) }];
    }
    const named = byCard && (holds(spaced(card.title), typed)
      || [card.source, ...card.notes].some(text => holds(spaced(text), typed, true)));
    return named ? [{ card, rows: card.rows }] : [];
  });
}
