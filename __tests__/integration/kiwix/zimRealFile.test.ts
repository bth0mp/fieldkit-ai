/**
 * The reader against a real Kiwix file. Runs only when ZIM_SAMPLE names one (no multi-MB binary in git); the
 * design was checked with wikiciv_en_all_maxi_2025-11.zim from download.kiwix.org.
 */
import { closeSync, openSync, readSync } from 'fs';
import { openZim } from '../../../src/services/kiwix/zimReader';
import { categoryFor } from '../../../src/services/kiwix/kiwixCategory';

const sample = process.env.ZIM_SAMPLE;

(sample ? describe : describe.skip)('ZIM reader on a real Kiwix file', () => {
  it('reads WikiCiv: metadata, a title search and an article', async () => {
    const fd = openSync(sample!, 'r');
    try {
      const zim = await openZim(async (offset, length) => {
        const buf = Buffer.alloc(length);
        return new Uint8Array(buf.subarray(0, readSync(fd, buf, 0, length, offset)));
      });
      expect(zim.metadata.title).toBe('WikiCiv');
      expect(zim.metadata.tags).toContain('preppers');
      expect(categoryFor(zim.metadata)).toBe('fieldcraft');
      expect((await zim.findTitles('abacus'))[0]).toBe('Abacus');
      const article = await zim.readArticle('Abacus', 2000);
      expect(article!.text.length).toBeGreaterThan(200);
      expect(article!.text).not.toContain('<');
      expect(article!.text).not.toMatch(/^ /m); // no line starts with a space
    } finally {
      closeSync(fd);
    }
  });
});
