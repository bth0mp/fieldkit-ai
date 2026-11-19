/**
 * The ZIM reader over byte-range reads: metadata, title search (exact, prefix, a lower-case or many-word query,
 * non-English titles compared as UTF-8 bytes), redirects, article text, both namespace schemes and both
 * supported compressions, and the files it refuses. The files are built in memory (harness/zimFixture), the
 * device boundary's stand-in for files Kiwix downloaded.
 */
import { buildZim, rangeReader, WIKIMED } from '../../harness/zimFixture';
import { openZim } from '../../../src/services/kiwix/zimReader';

const open = (overrides: Partial<typeof WIKIMED> = {}) => openZim(rangeReader(buildZim({ ...WIKIMED, ...overrides })));

describe('ZIM reader', () => {
  it('reads the archive metadata', async () => {
    const zim = await open();
    expect(zim.metadata).toEqual({
      name: 'wikipedia_en_medicine', title: 'WikiMed test', description: 'Medical articles from Wikipedia',
      tags: 'wikipedia;_category:wikipedia;_pictures:no', language: 'eng',
    });
  });

  it('finds titles by exact match, prefix, lower case and a word of a longer question', async () => {
    const zim = await open();
    expect((await zim.findTitles('burn'))[0]).toBe('Burn');
    expect(await zim.findTitles('Bur')).toEqual(expect.arrayContaining(['Burn', 'Bursitis']));
    expect(await zim.findTitles('how to treat a burn')).toContain('Burn');
    expect(await zim.findTitles('café')).toEqual(['Café']);
    expect(await zim.findTitles('zebra')).toEqual([]);
  });

  it('follows a redirect and returns the article as plain text within the budget', async () => {
    const zim = await open();
    const article = await zim.readArticle('Burns', 200);
    expect(article?.title).toBe('Burn');
    expect(article?.text).toContain('Cool the burn under cool running water');
    expect(article?.text).not.toMatch(/<p>|tracker|p\{\}/);
    expect(article!.text.length).toBeLessThanOrEqual(200);
    expect((await zim.readArticle('Burn', 30))!.text.length).toBeLessThanOrEqual(30);
    expect(await zim.readArticle('Zebra', 200)).toBeNull();
  });

  it('reads older files that keep articles in namespace A with the header title list', async () => {
    const zim = await open({ scheme: 'old' });
    expect((await zim.findTitles('Burn'))[0]).toBe('Burn');
    expect((await zim.readArticle('Bursitis', 500))?.text).toContain('inflammation of a bursa');
  });

  it('reads uncompressed clusters', async () => {
    const zim = await open({ compression: 'none' });
    expect((await zim.readArticle('Burn', 500))?.text).toContain('Cool the burn');
  });

  it('refuses xz files, files that are not Kiwix files and files that cannot be read', async () => {
    await expect(open({ compression: 'xz' })).rejects.toMatchObject({ code: 'xz' });
    await expect(openZim(rangeReader(new Uint8Array(80)))).rejects.toMatchObject({ code: 'not-zim' });
    await expect(openZim(async () => { throw new Error('ENOENT'); })).rejects.toMatchObject({ code: 'unreadable', message: "This Kiwix file can't be opened any more." });
  });

  it('a read that fails after opening is reported as unreadable', async () => {
    const bytes = buildZim(WIKIMED);
    let broken = false;
    const zim = await openZim(async (offset, length) => {
      if (broken) throw new Error('ENOENT');
      return bytes.subarray(offset, offset + length);
    });
    broken = true;
    await expect(zim.readArticle('Burn', 100)).rejects.toMatchObject({ code: 'unreadable' });
  });
});
