/**
 * Characters that draw nothing or change how what follows is drawn: C0 and C1 controls (tab and line breaks
 * are white space and become a space), the zero-width space and byte-order mark, and the bidirectional
 * overrides and isolates. Joiners stay: some scripts and emoji need them.
 */
function isInvisible(code: number): boolean {
  if (code === 9 || code === 10 || code === 13) return false;
  return code < 32 || (code >= 127 && code <= 159) || code === 0x200b || code === 0xfeff
    || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
}

/**
 * Text someone typed, or a file supplied, as one line of plain text: invisible characters go, runs of white
 * space become one space, and it is cut to `max` characters (code points, so never through a surrogate pair).
 */
export function oneLine(text: string, max: number): string {
  const plain = [...text].filter(c => !isInvisible(c.codePointAt(0) ?? 0)).join('').replace(/\s+/g, ' ').trim();
  return [...plain].slice(0, max).join('').trimEnd();
}
