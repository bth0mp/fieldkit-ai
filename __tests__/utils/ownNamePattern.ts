/**
 * The earlier project's name in every spelling we guard against, as extended-regex source.
 * Built from parts so no file that imports it (or this one) matches it. Used by the guard test
 * over tracked files and by the rendered screen checks over what the user sees.
 */
export const OLD_PROJECT_NAME = `${'off'}[-_ \t.]*${'grid'}|\b${'OG'}(${'AM'}|${'AD'})`;

export const OLD_NAME = [
  OLD_PROJECT_NAME,
  `${'wednes'}${'day'}[-_. \t]*(${'solu'}${'tions'}|ai\b|\.com)`,
  `${'key'}${'gen'}`,
  ['c23ac6be', '7ca9', '4ef2', 'b0a6', '06b751511bc1'].join('-'),
  ['1fa22f37', 'eb8f', '40fb', 'b37e', 'fcf82e342da1'].join('-'),
].join('|');
