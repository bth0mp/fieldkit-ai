import fs from 'fs';
import os from 'os';
import path from 'path';

const { hasReleaseStatement, describePdf, releaseStatementProblem, shapeEntries, nextHop, needsMirror, mirrorProblem, scanThirdParty, thirdPartyMentions, thirdPartyProblem, textFieldProblem, validateCandidate, teachable, readOnlyMismatch } = require('../../../scripts/check-guides.js');

describe('thirdPartyMentions across wrapped lines', () => {
  it.each([
    ['permission to\nreproduce'], ['Permission  to   reproduce'], ['Courtesy\nof Tektronix'], ['courtesy  of'],
    ['all rights\nreserved'], ['All  Rights  Reserved'], ['by\npermission'], ['by  permission'],
    ['reprinted\nfrom Acme'], ['Reprinted  from'], ['reproduced\nwith'], ['reproduced  with'],
    ['  CREDITS  '], ['Permission to\nuse these illustrations'], ['is gratefully\nacknowledged'],
  ])('finds %j', phrase => {
    expect(thirdPartyMentions(`some text before\n${phrase}\nafter`)).toHaveLength(1);
  });
});

describe('textFieldProblem', () => {
  const ok = { title: 'T', publisher: 'P', licence: 'L', licenceNote: 'N' };

  it('names the code point of a character outside the allowed set', () => {
    expect(textFieldProblem({ ...ok, title: 'Field guide' })).toBe('title has a character outside the allowed set: U+00A0');
    expect(textFieldProblem({ ...ok, publisher: 'Acme™' })).toBe('publisher has a character outside the allowed set: U+2122');
  });

  it('accepts ampersand, apostrophe, accented letters and an en dash', () => {
    expect(textFieldProblem({ ...ok, title: "Smith & Wesson's café guide – part 1" })).toBeNull();
  });

  it('enforces the length caps', () => {
    expect(textFieldProblem({ ...ok, title: 'a'.repeat(200) })).toBeNull();
    expect(textFieldProblem({ ...ok, title: 'a'.repeat(201) })).toBe('title is longer than 200 characters');
    expect(textFieldProblem({ ...ok, licenceNote: 'a'.repeat(2001) })).toBe('licenceNote is longer than 2000 characters');
  });

  it('refuses line breaks, surrounding whitespace and empty text', () => {
    expect(textFieldProblem({ ...ok, licenceNote: 'line one\nline two' })).toBe('licenceNote has a character outside the allowed set: U+000A');
    expect(textFieldProblem({ ...ok, title: ' padded' })).toBe('title has leading or trailing whitespace');
    expect(textFieldProblem({ ...ok, licence: '' })).toBe('licence must be non-empty text');
  });
});

describe('thirdPartyProblem', () => {
  const text = 'x'.repeat(10);
  it('fails a document with no text layer unless credits were reviewed', () => {
    expect(thirdPartyProblem({}, { text: '', hasText: false })).toBe('scanned, third-party credits must be confirmed by eye');
    expect(thirdPartyProblem(undefined, { text: '', hasText: false })).toBe('scanned, third-party credits must be confirmed by eye');
    expect(thirdPartyProblem({ creditsReviewed: true }, { text: '', hasText: false })).toBeNull();
  });
  it('passes clean text, fails mentions unless reviewed', () => {
    expect(thirdPartyProblem({}, { text, hasText: true })).toBeNull();
    expect(thirdPartyProblem({}, { text: 'Courtesy of Acme', hasText: true })).toMatch('review needed');
    expect(thirdPartyProblem({ creditsReviewed: true }, { text: 'Courtesy of Acme', hasText: true })).toBeNull();
  });
});

describe('mirror independence', () => {
  it('refuses a mirror on the same site under another host name', () => {
    expect(mirrorProblem({ url: 'https://www.militarynewbie.com/x.pdf', mirrors: ['https://militarynewbie.com/x.pdf'] })).toMatch('same host');
    expect(mirrorProblem({ url: 'https://archive.org/download/a/x.pdf', mirrors: ['https://web.archive.org/web/1/x.pdf'] })).toMatch('same host');
  });
  it('accepts a mirror on a different site', () => {
    expect(mirrorProblem({ url: 'https://legacy.maritime.org/x.pdf', mirrors: ['https://archive.org/download/a/x.pdf'] })).toBeNull();
  });
});

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

  it('flags any permission, however worded, but not permit or permitted', () => {
    expect(thirdPartyMentions('with the permission of the commanding officer')).toHaveLength(1);
    expect(thirdPartyMentions('Permissions are listed here')).toHaveLength(1);
    expect(thirdPartyMentions('Copyrighted material')).toHaveLength(1);
    expect(thirdPartyMentions('Some copyrights apply')).toHaveLength(1);
    expect(thirdPartyMentions('Entry is permitted. You may permit it. Make a copy.')).toEqual([]);
  });

  it('finds a flagged word that pdftotext split with a hyphen at a line end', () => {
    expect(thirdPartyMentions('Figures 2-1 to 2-4 are used by per-\nmission to reproduce them here.')).toHaveLength(1);
    expect(thirdPartyMentions('This chart is copy-\nright 1998 by a private firm.')).toHaveLength(1);
    expect(thirdPartyMentions('Photographs cour-  \r\n  tesy of the maker.')).toHaveLength(1);
  });

  it('a flagged word that joining would glue to the word before it is still found', () => {
    expect(thirdPartyMentions('This is non-\ncopyrighted material.')).toHaveLength(1);
    expect(thirdPartyMentions('Free of copyright-\nfree claims.')).toHaveLength(1);
  });

  it('a hit outside any split is counted once, though it is in both the printed and the joined text', () => {
    expect(thirdPartyMentions('Used by permission of the owner. A water-\nproof bag.')).toHaveLength(1);
    const { total } = scanThirdParty('Used by permission. Later, per-\nmission again, and non-\ncopyrighted too.');
    expect(total).toBe(3);
  });

  it('an ordinary compound split at a line end matches nothing', () => {
    expect(thirdPartyMentions('Keep a first-\naid kit and a water-\nproof bag; check the self-\npermitted route.')).toEqual([]);
  });

  const many = Array.from({ length: 12 }, (_, i) => `${'x'.repeat(200)} courtesy of party ${i}`).join('\n');

  it('returns at most five snippets', () => {
    expect(thirdPartyMentions(many)).toHaveLength(5);
  });

  it('reports the total in the failure text when there are more than five mentions', () => {
    expect(thirdPartyProblem({}, { text: many, hasText: true })).toMatch('(12 mentions in all');
    expect(thirdPartyProblem({}, { text: 'Courtesy of Acme', hasText: true })).not.toMatch('mentions in all');
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
    bytes: 1, sha256: 'a'.repeat(64), pages: 1, hasText: true, statementSeen: true, evidence: 'e', approxBytes: 5, mirrors: ['https://b.org/x.pdf'], creditsReviewed: true, creditsNote: 'n', readOnly: true, readOnlyNote: 'n',
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
      expect(g).not.toHaveProperty('readOnly');
      expect(g).not.toHaveProperty('readOnlyNote');
      expect(Object.keys(g)).toHaveLength(12);
    }
  });
});

describe('read only candidates', () => {
  const base = {
    id: 'a', title: 'T', category: 'water', publisher: 'P', year: 2020, licence: 'L', licenceNote: 'N',
    url: 'https://a.gov/x.pdf',
  };
  const check = (extra: object) => () => validateCandidate({ ...base, ...extra }, ['water']);

  it('accepts a candidate marked read only with a note, or not marked at all', () => {
    expect(check({})).not.toThrow();
    expect(check({ readOnly: true, readOnlyNote: 'maps are images' })).not.toThrow();
  });

  it('rejects a readOnly that is not true, a missing note and a note without readOnly', () => {
    expect(check({ readOnly: false, readOnlyNote: 'x' })).toThrow('readOnly must be true when present');
    expect(check({ readOnly: 'yes', readOnlyNote: 'x' })).toThrow('readOnly must be true when present');
    expect(check({ readOnly: true })).toThrow('readOnly needs a readOnlyNote');
    expect(check({ readOnly: true, readOnlyNote: '' })).toThrow('readOnly needs a readOnlyNote');
    expect(check({ readOnlyNote: 'x' })).toThrow('readOnlyNote needs readOnly');
  });

  it('ships hasText only for a guide with a text layer that is not read only', () => {
    expect(teachable({}, true)).toBe(true);
    expect(teachable({ readOnly: true }, true)).toBe(false);
    expect(teachable({}, false)).toBe(false);
    expect(teachable({ readOnly: true }, false)).toBe(false);
  });

  it('reports a guide marked read only that still says hasText', () => {
    expect(readOnlyMismatch({ hasText: true }, { readOnly: true })).toBe('marked read only in candidates.json but hasText is true');
    expect(readOnlyMismatch({ hasText: false }, { readOnly: true })).toBeNull();
    expect(readOnlyMismatch({ hasText: true }, {})).toBeNull();
    expect(readOnlyMismatch({ hasText: true }, undefined)).toBeNull();
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
