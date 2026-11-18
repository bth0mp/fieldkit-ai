import fs from 'fs';
import os from 'os';
import path from 'path';

const { hasReleaseStatement, describePdf } = require('../../../scripts/check-guides.js');

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
