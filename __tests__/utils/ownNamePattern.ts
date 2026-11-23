/**
 * The earlier project's name in every spelling we guard against, as extended-regex source.
 * Built from parts so no file that imports it (or this one) matches it. Used by the guard test
 * over tracked files and by the rendered screen checks over what the user sees.
 *
 * String.raw keeps `\b` and `\.` as regex escapes (a plain template literal would turn `\b` into a
 * backspace character). The tab is spliced in as a real character because git's extended regex has no `\t`.
 */
const TAB = '\t';
// Written as alternatives, not bracket members, so git's regex matches the same bytes in any locale.
const NBSP = String.fromCharCode(0xa0);
const EN_DASH = String.fromCharCode(0x2013);
const SEP = `(%20|[-_ ${TAB}.]|${NBSP}|${EN_DASH})*`;

export const OLD_PROJECT_NAME = String.raw`${'off'}${SEP}${'grid'}|\b${'OG'}(${'AM'}|${'AD'})`;

export const OLD_NAME = [
  OLD_PROJECT_NAME,
  String.raw`${'wednes'}${'day'}(${SEP}(${'solu'}${'tions'}|ai\b|\.com)|\.is\b)`,
  // The licence service: any use of its name except inside the ssh tool's (git's regex has no lookbehind),
  // and the two account ids below.
  String.raw`(^|[^-])${'key'}${'gen'}`,
  ['c23ac6be', '7ca9', '4ef2', 'b0a6', '06b751511bc1'].join('-'),
  ['1fa22f37', 'eb8f', '40fb', 'b37e', 'fcf82e342da1'].join('-'),
].join('|');
