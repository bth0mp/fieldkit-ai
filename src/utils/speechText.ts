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
