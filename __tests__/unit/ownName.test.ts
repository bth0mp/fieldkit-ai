/**
 * The app stands on its own: no tracked file or file name may carry the name of the project it
 * grew from, that project's company, its short names, or its licence-server account.
 *
 * The patterns are built from parts so this file does not match itself. git reports every path
 * relative to the repository root, so a checkout whose own folder carries the old name still passes.
 */
import { execFileSync } from 'child_process';

const OLD_NAME = [
  `${'off'}[-_ ]?${'grid'}`,
  `\\b${'OG'}(${'AM'}|${'AD'})\\b`,
  `${'wednes'}${'day'}[-_. ]?(${'solu'}${'tions'}|ai\\b|\\.com)`,
  `${'key'}${'gen'}`,
  ['c23ac6be', '7ca9', '4ef2', 'b0a6', '06b751511bc1'].join('-'),
  ['1fa22f37', 'eb8f', '40fb', 'b37e', 'fcf82e342da1'].join('-'),
].join('|');

/**
 * Files that may carry an old name, with the reason.
 *  - earlierIds.ts: the one place that names the ids older versions saved under, so the data moves over.
 *  - RenamedWorkerFactory.kt: the class name of download jobs queued before the package rename.
 */
const ALLOWED_FILES = [
  'src/services/earlierIds.ts',
  'android/app/src/main/java/com/bth0mp/fieldkit/download/RenamedWorkerFactory.kt',
];

/** catalog/ lists guides and rejected sources; its prose uses the everyday phrase for living away from the mains. */
const ALLOWED_FOLDERS = ['catalog'];

function git(args: string[], okCodes: number[] = [0]): string {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: __dirname, encoding: 'utf8' }).trim();
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    const status = (error as { status?: number }).status;
    // git grep exits 1 when nothing matches.
    if (status !== undefined && okCodes.includes(status)) return '';
    throw error;
  }
}

describe('the app carries no earlier project name', () => {
  it('no tracked file mentions it', () => {
    const excluded = [...ALLOWED_FILES, ...ALLOWED_FOLDERS].map(path => `:(exclude)${path}`);
    const hits = git(['grep', '-nIiE', '-e', OLD_NAME, '--', '.', ...excluded], [1])
      .split('\n')
      .filter(Boolean)
      .map(line => line.slice(0, 160));
    expect(hits).toEqual([]);
  });

  it('no file or folder name carries it', () => {
    const pattern = new RegExp(OLD_NAME, 'i');
    const names = git(['ls-files'])
      .split('\n')
      .filter(path => path && pattern.test(path));
    expect(names).toEqual([]);
  });
});
