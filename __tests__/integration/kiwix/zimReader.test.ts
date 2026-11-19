/**
 * The ZIM reader over byte-range reads: metadata, title search (exact, prefix, a lower-case or many-word query,
 * non-English titles compared as UTF-8 bytes), redirects, article text, both namespace schemes and both
 * supported compressions, and the files it refuses. The files are built in memory (harness/zimFixture), the
 * device boundary's stand-in for files Kiwix downloaded.
 */
import { constants } from 'zlib';
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

  it('reads a file whose type list gives the article type with a character set', async () => {
    // Some ZIM writers list "text/html; charset=utf-8". Matched exactly against "text/html", such a file opens
    // and then seems to hold no articles at all.
    const zim = await open({ htmlMime: 'text/html; charset=utf-8' });
    expect((await zim.findTitles('burn'))[0]).toBe('Burn');
    expect((await zim.readArticle('Burn', 200))?.text).toContain('Cool the burn under cool running water');
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

  it('says a file cut short is damaged, not that it has gone', async () => {
    const whole = buildZim(WIKIMED);
    // A download that stopped part way: the header is there and the file runs out somewhere after it.
    const outcome = async (bytes: Uint8Array) => {
      try {
        const zim = await openZim(rangeReader(bytes));
        await zim.findTitles('burn');
        await zim.readArticle('Burn', 100);
        return 'read';
      } catch (e) {
        const { code, message } = e as { code?: string; message?: string };
        return `${code}: ${message}`;
      }
    };
    for (const kept of [0.9, 0.6, 0.3]) {
      expect(await outcome(whole.subarray(0, Math.floor(whole.length * kept))))
        .toBe('damaged: This Kiwix file is damaged or incomplete. Download it again in Kiwix.');
    }
    expect(await outcome(whole)).toBe('read');
  });

  it('refuses a damaged file whose cluster pointer runs far past the end, without asking for a huge read', async () => {
    const bytes = buildZim(WIKIMED);
    const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
    const clusterPtrPos = Number(view.readBigUInt64LE(48));
    view.writeBigUInt64LE(2n ** 40n, clusterPtrPos + 8); // the articles' cluster "starts" a terabyte in
    let longest = 0;
    const read = async (offset: number, length: number) => { longest = Math.max(longest, length); return rangeReader(bytes)(offset, length); };
    await expect(openZim(read)).rejects.toMatchObject({ code: 'damaged' });
    expect(longest).toBeLessThanOrEqual(16 * 1024 * 1024);
  });

  it('refuses a cluster that would decompress to more than 16 MB, declared or not', async () => {
    const articles = [...WIKIMED.articles, { path: 'Huge', title: 'Huge', html: 'a'.repeat(17 * 1024 * 1024) }];
    // Real files use clusters of about 2 MB, so one this size is read as damage.
    await expect(open({ articles })).rejects.toMatchObject({ code: 'damaged' });
    await expect(open({ articles, zstdParams: { [constants.ZSTD_c_contentSizeFlag]: 0 } })).rejects.toMatchObject({ code: 'damaged' });
  }, 30000);

  it('reads the last cluster of a big file, whose directory after it runs past 16 MB', async () => {
    for (const compression of ['zstd', 'none'] as const) {
      const zim = await open({ compression, directoryPadding: 17 * 1024 * 1024 });
      expect((await zim.readArticle('Burn', 500))?.text).toContain('Cool the burn');
    }
  }, 30000);

  it('works without TextDecoder, which the phone engine (Hermes) does not have', async () => {
    const saved = globalThis.TextDecoder;
    // @ts-expect-error -- remove it the way Hermes lacks it
    delete globalThis.TextDecoder;
    try {
      let reader!: typeof import('../../../src/services/kiwix/zimReader');
      jest.isolateModules(() => { reader = require('../../../src/services/kiwix/zimReader'); });
      const zim = await reader.openZim(rangeReader(buildZim(WIKIMED)));
      expect(zim.metadata.title).toBe('WikiMed test');
      expect(await zim.findTitles('café')).toEqual(['Café']);
      expect((await zim.readArticle('Café', 500))?.title).toBe('Café');
      expect((await zim.readArticle('Burns', 500))?.text).toContain('Cool the burn');
    } finally {
      globalThis.TextDecoder = saved;
    }
  });

  it("decompresses only the cluster's own zstd frame, never a second one asking for a 128 MB window", async () => {
    // Frame magic, no single segment, window descriptor 2^27, then one empty last raw block.
    const frame = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00, 0x88, 0x01, 0x00, 0x00]);
    const zim = await open({ zstdTrailer: frame });
    expect((await zim.readArticle('Burn', 500))?.text).toContain('Cool the burn');
  });
});
