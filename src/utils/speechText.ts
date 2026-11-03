/**
 * Pure text shaping for speech. Splits a prepared reply into sentences and cuts them to the size the
 * engine accepts, so each piece can be queued as its own utterance.
 */

/**
 * Split after `.`, `!` or `?` that is followed by whitespace, and at newlines. Pieces are trimmed and
 * empty pieces dropped; a final piece without end punctuation is kept.
 */
export function splitIntoSentences(text: string): string[] {
  const pieces: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    let start = 0;
    for (const match of line.matchAll(/[.!?]\s+/g)) {
      pieces.push(line.slice(start, match.index + 1));
      start = match.index + match[0].length;
    }
    pieces.push(line.slice(start));
  }
  return pieces.map(piece => piece.trim()).filter(piece => piece.length > 0);
}

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;

/** Where to cut `text` (longer than maxLen): the last whitespace at or before maxLen, else a hard cut. */
function cutPoint(text: string, maxLen: number): number {
  for (let i = maxLen; i > 0; i--) {
    if (/\s/.test(text[i])) return i;
  }
  // Hard cut; never split a surrogate pair.
  return maxLen > 1 && isHighSurrogate(text.charCodeAt(maxLen - 1)) ? maxLen - 1 : maxLen;
}

/**
 * Cut sentences to at most `maxLen` characters. Sentences are never merged: each one yields one or more
 * chunks. An over-long sentence is cut at the last whitespace at or before `maxLen` (hard-cut if there
 * is none) and the rest is processed the same way. Chunks are trimmed, non-empty and in order.
 */
export function chunkForEngine(input: { sentences: string[]; maxLen: number }): string[] {
  const maxLen = Math.max(1, Math.floor(input.maxLen));
  const chunks: string[] = [];
  for (const sentence of input.sentences) {
    let rest = sentence.trim();
    while (rest.length > maxLen) {
      const cut = cutPoint(rest, maxLen);
      const head = rest.slice(0, cut).trim();
      if (head) chunks.push(head);
      rest = rest.slice(cut).trim();
    }
    if (rest) chunks.push(rest);
  }
  return chunks;
}

/**
 * Where the last `marker` in `text` starts when there is an odd number of them (it opened something nothing has
 * closed yet), else -1. Matches `isLiteral` accepts are plain text, not markup, and are not counted.
 */
function unclosedMarkerAt(text: string, marker: RegExp, isLiteral?: (at: number) => boolean): number {
  const matches = [...text.matchAll(marker)].filter(match => !isLiteral?.(match.index));
  return matches.length % 2 === 1 ? matches[matches.length - 1].index : -1;
}

/** Replace each match with spaces of the same length, so positions in the text stay valid. */
const blank = (text: string, pattern: RegExp): string => text.replace(pattern, found => ' '.repeat(found.length));

/** True when the two characters around a two-character marker at `at` both match `flank`. */
const flankedBy = (text: string, flank: RegExp) => (at: number): boolean => flank.test(text.charAt(at - 1)) && flank.test(text.charAt(at + 2));

/**
 * The part of a still-streaming reply that is safe to read: the text up to the first construct that is not
 * closed yet (a code fence, `**`, `__` or an inline backtick), because what follows may turn out to be code
 * or markup. Code (closed fences, and closed inline spans for `**` and `__`) is skipped when counting inline
 * markers, so it does not unbalance the rest; so are an intraword `__` (snake__case) and a `**` between
 * digits (2**3), which are not emphasis.
 */
export function stableSpeakablePrefix(text: string): string {
  const fence = unclosedMarkerAt(text, /```/g);
  let cut = fence === -1 ? text.length : fence;
  const outsideFences = blank(text.slice(0, cut), /```[\s\S]*?```/g);
  const outsideCode = blank(outsideFences, /`[^`]*`/g);
  const open = [
    unclosedMarkerAt(outsideFences, /`/g),
    unclosedMarkerAt(outsideCode, /\*\*/g, flankedBy(outsideCode, /\d/)),
    unclosedMarkerAt(outsideCode, /__/g, flankedBy(outsideCode, /\w/)),
  ];
  for (const at of open) if (at !== -1) cut = Math.min(cut, at);
  return text.slice(0, cut);
}

/**
 * What of a finished reply was not read while it streamed. `spokenCount` sentences were handed on, the last
 * of them `lastSpoken`. `aligned` is false when the finished text no longer has that sentence in that
 * place; the rest then continues after the last occurrence of it, or is empty when it is gone.
 */
export function unreadSentences(input: { sentences: string[]; spokenCount: number; lastSpoken: string | null }): { rest: string[]; aligned: boolean } {
  const { sentences, spokenCount, lastSpoken } = input;
  if (spokenCount === 0 || sentences[spokenCount - 1] === lastSpoken) return { rest: sentences.slice(spokenCount), aligned: true };
  const at = lastSpoken === null ? -1 : sentences.lastIndexOf(lastSpoken);
  return { rest: at === -1 ? [] : sentences.slice(at + 1), aligned: false };
}
