import fs from 'fs';
import os from 'os';
import path from 'path';

const { hasReleaseStatement, describePdf, releaseStatementProblem, shapeEntries, nextHop, needsMirror, mirrorProblem, thirdPartyMentions } = require('../../../scripts/check-guides.js');

describe('thirdPartyMentions', () => {
  it('finds a permission notice for supplied figures', () => {
    const out = thirdPartyMentions('Figures 5-22 through 5-38 were provided by Huntron Instruments, Inc. Permission to reproduce these illustrations must be obtained from the source.');
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('Permission to reproduce');
  });

  it('finds courtesy, copyright sign and a bare CREDITS heading', () => {
    expect(thirdPartyMentions('Figure 3. Courtesy of Tektronix')).toHaveLength(1);
    expect(thirdPartyMentions('page text\n© 2004 Someone\nmore')).toHaveLength(1);
    expect(thirdPartyMentions('intro text\nCREDITS\nHuntron')).toHaveLength(1);
  });

  it('finds acknowledgments in either spelling', () => {
    expect(thirdPartyMentions('Acknowledgements')).toHaveLength(1);
    expect(thirdPartyMentions('Acknowledgment')).toHaveLength(1);
  });

  it('finds nothing in a release statement or ordinary prose', () => {
    expect(thirdPartyMentions('Approved for public release; distribution is unlimited.')).toEqual([]);
    expect(thirdPartyMentions('The card is preprinted with your name.')).toEqual([]);
    expect(thirdPartyMentions('You may permit the copy to dry. The credits of the course are listed in a table; do not copy it.')).toEqual([]);
  });

  it('returns at most five snippets', () => {
    const text = Array.from({ length: 9 }, (_, i) => `${'x'.repeat(200)} courtesy of party ${i}`).join('\n');
    expect(thirdPartyMentions(text)).toHaveLength(5);
  });
});

describe('needsMirror', () => {
  it.each([
    'https://armypubs.army.mil/x.pdf',
    'https://www.fema.gov/x.pdf',
    'https://fs-prod-nwcg.s3.us-gov-west-1.amazonaws.com/x.pdf',
    'https://digital.library.unt.edu/ark:/67531/x/x.pdf',
    'https://webarchive.library.unt.edu/x.pdf',
    'https://web.archive.org/web/20200101123456id_/https://example.com/x.pdf',
  ])('trusts %s', url => {
    expect(needsMirror(url)).toBe(false);
  });

  it.each([
    'https://web.archive.org/web/20200101123456/https://example.com/x.pdf',
    'https://web.archive.org/web/2020id_/https://example.com/x.pdf',
    'https://archive.org/download/item/x.pdf',
    'https://legacy.maritime.org/x.pdf',
    'https://evil-gov.example/x.pdf',
    'https://army.mil.example.com/x.pdf',
  ])('wants a second copy for %s', url => {
    expect(needsMirror(url)).toBe(true);
  });
});

describe('mirror validation', () => {
  const base = { url: 'https://legacy.maritime.org/x.pdf' };

  it('accepts a strict https mirror on another host, or none', () => {
    expect(mirrorProblem(base)).toBeNull();
    expect(mirrorProblem({ ...base, mirrors: ['https://archive.org/download/a/x.pdf'] })).toBeNull();
  });

  it('refuses a mirror on the same host as url', () => {
    expect(mirrorProblem({ ...base, mirrors: ['https://legacy.maritime.org/y.pdf'] })).toMatch('same host');
  });

  it('refuses a non-https or malformed mirror', () => {
    expect(mirrorProblem({ ...base, mirrors: ['http://archive.org/x.pdf'] })).toMatch('must be https');
    expect(mirrorProblem({ ...base, mirrors: ['https://localhost/x.pdf'] })).toMatch('must be https');
    expect(mirrorProblem({ ...base, mirrors: 'https://archive.org/x.pdf' })).toMatch('array');
  });
});

const CLAIM = 'Approved for public release; distribution is unlimited.';
const WITH_STATEMENT = 'DISTRIBUTION RESTRICTION: Approved for public\nrelease; distribution is unlimited.';

describe('licence claim guard', () => {
  it('fails when the note claims the statement but the text lacks it', () => {
    expect(releaseStatementProblem({ licenceNote: CLAIM }, 'Some other text', true)).toBe('release statement not found in the document');
  });

  it('treats a claim split across a line break or double space as a claim', () => {
    expect(releaseStatementProblem({ licenceNote: 'approved for public\nrelease' }, 'x', true)).toBe('release statement not found in the document');
    expect(releaseStatementProblem({ licenceNote: 'Approved for  public release' }, 'x', true)).toBe('release statement not found in the document');
  });

  it('accepts a claim the text confirms, and notes that make no claim', () => {
    expect(releaseStatementProblem({ licenceNote: CLAIM }, WITH_STATEMENT, true)).toBeNull();
    expect(releaseStatementProblem({ licenceNote: 'US federal work' }, 'x', true)).toBeNull();
  });

  it('fails a scanned document unless statementSeen is true', () => {
    expect(releaseStatementProblem({ licenceNote: CLAIM }, '', false)).toBe('scanned, statement must be confirmed by eye');
    expect(releaseStatementProblem({ licenceNote: CLAIM, statementSeen: false }, '', false)).toBe('scanned, statement must be confirmed by eye');
    expect(releaseStatementProblem({ licenceNote: CLAIM, statementSeen: true }, '', false)).toBeNull();
  });
});

describe('redirect hops', () => {
  const here = 'https://a.gov/dir/x.pdf';

  it('resolves a relative or absolute https Location', () => {
    expect(nextHop({ status: 302, location: '/y.pdf' }, here, 0)).toBe('https://a.gov/y.pdf');
    expect(nextHop({ status: 301, location: 'https://b.gov/z.pdf' }, here, 4)).toBe('https://b.gov/z.pdf');
  });

  it('returns null for a response that is not a redirect', () => {
    expect(nextHop({ status: 200, location: null }, here, 0)).toBeNull();
  });

  it('refuses a hop to plain http', () => {
    expect(() => nextHop({ status: 302, location: 'http://a.gov/y.pdf' }, here, 0)).toThrow('redirected to a non-https address');
  });

  it('refuses a sixth hop', () => {
    expect(() => nextHop({ status: 302, location: '/y.pdf' }, here, 5)).toThrow('too many redirects');
  });
});

describe('shapeEntries', () => {
  const entry = (id: string, category: string, title: string) => ({
    id, title, category, publisher: 'p', year: 2020, licence: 'l', licenceNote: 'n', url: 'https://a.gov/x.pdf',
    bytes: 1, sha256: 'a'.repeat(64), pages: 1, hasText: true, statementSeen: true, evidence: 'e', approxBytes: 5, mirrors: ['https://b.org/x.pdf'], creditsReviewed: true, creditsNote: 'n',
  });

  it('strips helper fields and sorts by category order, then title', () => {
    const out = shapeEntries([entry('c', 'water', 'B'), entry('b', 'water', 'A'), entry('a', 'medical', 'Z')], ['medical', 'water']);
    expect(out.map((g: { id: string }) => g.id)).toEqual(['a', 'b', 'c']);
    for (const g of out) {
      expect(g).not.toHaveProperty('statementSeen');
      expect(g).not.toHaveProperty('evidence');
      expect(g).not.toHaveProperty('approxBytes');
      expect(g).not.toHaveProperty('mirrors');
      expect(g).not.toHaveProperty('creditsReviewed');
      expect(g).not.toHaveProperty('creditsNote');
      expect(Object.keys(g)).toHaveLength(12);
    }
  });
});

describe('check-guides script', () => {
  it('recognises the public-release statement across line breaks and case', () => {
    expect(hasReleaseStatement('DISTRIBUTION RESTRICTION: Approved for public\nrelease; distribution is unlimited.')).toBe(true);
    expect(hasReleaseStatement('Distribution authorized to U.S. Government agencies only')).toBe(false);
  });

  it('describes a file by size and sha256 and refuses a non-PDF', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-guides-test-'));
    try {
      const pdfPath = path.join(dir, 'a.pdf');
      const htmlPath = path.join(dir, 'b.pdf');
      fs.writeFileSync(pdfPath, '%PDF-1.4 test');
      fs.writeFileSync(htmlPath, '<html>blocked</html>');
      await expect(describePdf(pdfPath)).resolves.toMatchObject({ bytes: 13, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
      await expect(describePdf(htmlPath)).rejects.toThrow('not a PDF');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
