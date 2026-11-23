/**
 * The app stands on its own: no tracked file or file name may carry the name of the project it
 * grew from, that project's company, its short names, or its licence-server account.
 *
 * The patterns are built from parts so this file does not match itself. git reports every path
 * relative to the repository root, so a checkout whose own folder carries the old name still passes.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { OLD_NAME } from '../utils/ownNamePattern';

/**
 * Files that may carry an old name, with the reason.
 *  - earlierIds.ts: the one place that names the ids older versions saved under, so the data moves over.
 *    Any number of hits.
 *  - RenamedWorkerFactory.kt: the class name of download jobs queued before the package rename. One hit.
 *  - catalog/REJECTED.md: one line that uses the everyday phrase for living away from the mains. One hit.
 */
const ANY_HITS_FILE = 'src/services/earlierIds.ts';
const ONE_HIT_FILES = [
  'android/app/src/main/java/com/bth0mp/fieldkit/download/RenamedWorkerFactory.kt',
  'catalog/REJECTED.md',
];

// Git exports these to hooks; left in place they would point `git` at the wrong repository.
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  return env;
}

function gitIn(cwd: string, args: string[], okCodes: number[] = [1]): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv(), maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    const status = (error as { status?: number }).status;
    // git grep exits 1 when nothing matches.
    if (status !== undefined && okCodes.includes(status)) return '';
    throw error;
  }
}

function git(args: string[], okCodes: number[] = [0]): string {
  const root = gitIn(__dirname, ['rev-parse', '--show-toplevel'], []).trim();
  return gitIn(root, args, okCodes);
}

const off = 'off';
const grid = 'grid';
const company = ['wednes', 'day'].join('');
const nbsp = String.fromCharCode(0xa0);
const enDash = String.fromCharCode(0x2013);

const MATCHING = [
  `${off}${grid}`,
  `${off} ${grid}`,
  `${off}-${grid}`,
  `${off}_${grid}`,
  `${off}.${grid}`,
  `${off}\t${grid}`,
  `${off}  ${grid}`,
  `${off}${nbsp}${grid}`,
  `${off}${enDash}${grid}`,
  `${off}%20${grid}`,
  `${off}${grid}mobile`,
  'OG' + 'AM',
  'OG' + 'ADx',
  `${company} solutions`,
  `${company}-solutions`,
  `${company}${nbsp}solutions`,
  `${company} ai`,
  `${company}.com`,
  `${company}.is`,
  `https://${company}.is/page`,
  'api.' + 'key' + 'gen.sh',
  'key' + 'gen',
  'the ' + 'key' + 'gen account',
  'x.' + 'key' + 'gen',
  ['c23ac6be', '7ca9', '4ef2', 'b0a6', '06b751511bc1'].join('-'),
  ['1fa22f37', 'eb8f', '40fb', 'b37e', 'fcf82e342da1'].join('-'),
];

const NOT_MATCHING = [
  company,
  `${company} is a weekday`,
  `${off}set ${grid}`,
  'ogre',
  'an air gap',
  'ssh-' + 'key' + 'gen -t ed25519',
];

describe('the pattern', () => {
  const pattern = new RegExp(OLD_NAME, 'i');

  it.each(MATCHING.map(sample => [sample]))('matches %j', sample => {
    expect(pattern.test(sample)).toBe(true);
  });

  it.each(NOT_MATCHING.map(sample => [sample]))('does not match %j', sample => {
    expect(pattern.test(sample)).toBe(false);
  });

  // The guard searches with git's extended regex, not JavaScript's, so run the samples through git too.
  describe("in git's extended regex", () => {
    let dir: string;
    const gitLinesMatching = (samples: string[]): number[] => {
      writeFileSync(join(dir, 'samples.txt'), `${samples.join('\n')}\n`);
      const out = gitIn(dir, ['grep', '--no-index', '-nIiE', '-e', OLD_NAME, '--', 'samples.txt']);
      return out
        .split('\n')
        .filter(Boolean)
        .map(line => Number(line.split(':')[1]));
    };

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'own-name-'));
    });
    afterAll(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('matches every sample that should match', () => {
      expect(gitLinesMatching(MATCHING)).toEqual(MATCHING.map((_, i) => i + 1));
    });

    it('matches none of the others', () => {
      expect(gitLinesMatching(NOT_MATCHING)).toEqual([]);
    });
  });
});

describe('the app carries no earlier project name', () => {
  it('no tracked file mentions it', () => {
    // -z ends each path with a NUL byte, so odd file names come out whole.
    const lines = git(['grep', '-znIiE', '-e', OLD_NAME, '--', '.', `:(exclude)${ANY_HITS_FILE}`], [1])
      .split('\n')
      .filter(Boolean);
    // The path is the first NUL-separated field; compare it whole, so a file named like an allowed one plus a suffix fails.
    const pathOf = (line: string) => line.split('\0')[0];
    const hits = lines.filter(line => !ONE_HIT_FILES.includes(pathOf(line))).map(line => line.slice(0, 160));
    for (const path of ONE_HIT_FILES) {
      const count = lines.filter(line => pathOf(line) === path).length;
      if (count !== 1) hits.push(`${path}: expected exactly 1 hit, found ${count}`);
    }
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
