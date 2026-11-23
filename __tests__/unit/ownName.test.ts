/**
 * The app stands on its own: no tracked file or file name may carry the name of the project it
 * grew from, that project's company, its short names, or its licence-server account.
 *
 * The patterns are built from parts so this file does not match itself. git reports every path
 * relative to the repository root, so a checkout whose own folder carries the old name still passes.
 */
import { execFileSync } from 'child_process';
import { OLD_NAME } from '../utils/ownNamePattern';

/**
 * Files that may carry an old name, with the reason.
 *  - earlierIds.ts: the one place that names the ids older versions saved under, so the data moves over.
 *  - RenamedWorkerFactory.kt: the class name of download jobs queued before the package rename.
 *  - catalog/REJECTED.md: one line that uses the everyday phrase for living away from the mains.
 */
const ALLOWED_FILES = [
  'src/services/earlierIds.ts',
  'android/app/src/main/java/com/bth0mp/fieldkit/download/RenamedWorkerFactory.kt',
  'catalog/REJECTED.md',
];

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

describe('the pattern', () => {
  const pattern = new RegExp(OLD_NAME, 'i');
  const off = 'off';
  const grid = 'grid';
  const company = ['wednes', 'day'].join('');

  it.each([
    [`${off}${grid}`],
    [`${off} ${grid}`],
    [`${off}-${grid}`],
    [`${off}_${grid}`],
    [`${off}.${grid}`],
    [`${off}\t${grid}`],
    [`${off}  ${grid}`],
    [`${off}${grid}mobile`],
    ['OG' + 'AM'],
    ['OG' + 'ADx'],
    [`${company} solutions`],
    [`${company}-solutions`],
    [`${company} ai`],
    [`${company}.com`],
    ['key' + 'gen'],
    ['api.' + 'key' + 'gen.sh'],
    [['c23ac6be', '7ca9', '4ef2', 'b0a6', '06b751511bc1'].join('-')],
    [['1fa22f37', 'eb8f', '40fb', 'b37e', 'fcf82e342da1'].join('-')],
  ])('matches %j', sample => {
    expect(pattern.test(sample)).toBe(true);
  });

  it.each([[company], [`${company} is a weekday`], [`${off}set ${grid}`], ['ogre'], ['an air gap']])(
    'does not match %j',
    sample => {
      expect(pattern.test(sample)).toBe(false);
    },
  );
});

describe('the app carries no earlier project name', () => {
  it('no tracked file mentions it', () => {
    const excluded = ALLOWED_FILES.map(path => `:(exclude)${path}`);
    // -z ends each path with a NUL byte, so odd file names come out whole.
    const hits = git(['grep', '-znIiE', '-e', OLD_NAME, '--', '.', ...excluded], [1])
      .replace(/\0/g, ':')
      .split('\n')
      .filter(Boolean)
      .map(line => line.slice(0, 160));
    expect(hits).toEqual([]);
  });

  it('no file or folder name carries it', () => {
    const pattern = new RegExp(OLD_NAME, 'i');
    const names = git(['ls-files', '-z'])
      .split('\0')
      .filter(path => path && pattern.test(path));
    expect(names).toEqual([]);
  });
});
