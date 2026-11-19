/**
 * Builds small, valid Kiwix .zim files in memory for tests: the device boundary's stand-in for the files Kiwix
 * downloads. Layout as libzim 7+ writes it (checked against a real Kiwix file; see the Kiwix design doc): header,
 * MIME list, clusters, directory entries, path pointers, (old scheme) title pointers, cluster pointers, checksum.
 * The articles' cluster is the last one, so nothing in the file says where it ends.
 * New scheme: articles in C, metadata in M, W/mainPage, the title index in X/listing/titleOrdered/v1. Old scheme:
 * articles in A and the header's title pointer list.
 */
import { zstdCompressSync } from 'zlib';

interface Article { path: string; title: string; html: string }
interface Redirect { path: string; title: string; to: string }
export interface ZimFixture {
  name: string;
  title: string;
  description?: string;
  tags?: string;
  articles: Article[];
  redirects?: Redirect[];
  compression?: 'zstd' | 'none' | 'xz';
  scheme?: 'new' | 'old';
  /** zstd parameters for the article cluster, e.g. no content size in the frame header. */
  zstdParams?: Record<number, number>;
  /** Bytes appended to the article cluster after its zstd frame, e.g. a second frame. */
  zstdTrailer?: Buffer;
  /** Bytes between the last cluster and the directory entries: a big file's directory, in a test-sized file. */
  directoryPadding?: number;
  /** How the file's type list spells the article type; some writers add a character set ("text/html; charset=utf-8"). */
  htmlMime?: string;
}

type Entry = { ns: string; path: string; title: string; mime: string; data?: Buffer; redirect?: string; cluster?: number; blob?: number };

const MIMES = ['application/octet-stream+zimlisting', 'text/html', 'text/plain'];
const key = (e: { ns: string; path: string }) => Buffer.from(`${e.ns}${e.path}`);
const titleKey = (e: Entry) => Buffer.from(`${e.ns}${e.title || e.path}`);

function u64(n: number): Buffer { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }
function u32(n: number): Buffer { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }

function cluster(blobs: Buffer[], compression: 'zstd' | 'none' | 'xz', zstdParams?: Record<number, number>, zstdTrailer: Buffer = Buffer.alloc(0)): Buffer {
  const offsets: number[] = [];
  let at = 4 * (blobs.length + 1);
  for (const b of blobs) { offsets.push(at); at += b.length; }
  offsets.push(at);
  const body = Buffer.concat([...offsets.map(u32), ...blobs]);
  if (compression === 'xz') return Buffer.concat([Buffer.from([4]), Buffer.from('not really xz data')]);
  if (compression === 'zstd') return Buffer.concat([Buffer.from([5]), zstdCompressSync(body, { params: zstdParams }), zstdTrailer]);
  return Buffer.concat([Buffer.from([1]), body]);
}

export function buildZim(opts: ZimFixture): Uint8Array {
  const scheme = opts.scheme ?? 'new';
  const ns = scheme === 'new' ? 'C' : 'A';
  const meta: Record<string, string> = {
    Name: opts.name, Title: opts.title, Description: opts.description ?? '', Tags: opts.tags ?? '', Language: 'eng',
  };
  const entries: Entry[] = [
    ...opts.articles.map(a => ({ ns, path: a.path, title: a.title === a.path ? '' : a.title, mime: 'text/html', data: Buffer.from(a.html) })),
    ...(opts.redirects ?? []).map(r => ({ ns, path: r.path, title: r.title === r.path ? '' : r.title, mime: '', redirect: `${ns}${r.to}` })),
    ...Object.entries(meta).map(([path, value]) => ({ ns: 'M', path, title: '', mime: 'text/plain', data: Buffer.from(value) })),
  ];
  if (scheme === 'new') {
    entries.push({ ns: 'W', path: 'mainPage', title: '', mime: '', redirect: `${ns}${opts.articles[0].path}` });
    entries.push({ ns: 'X', path: 'listing/titleOrdered/v1', title: '', mime: 'application/octet-stream+zimlisting' });
  }
  entries.sort((a, b) => Buffer.compare(key(a), key(b)));
  const indexOf = (k: string) => entries.findIndex(e => `${e.ns}${e.path}` === k);

  // In the new scheme cluster 0 is the title listing, uncompressed; the last cluster holds every other blob,
  // compressed as asked.
  const front = entries.map((e, i) => ({ e, i })).filter(({ e }) => e.ns === ns).sort((a, b) => Buffer.compare(titleKey(a.e), titleKey(b.e)));
  const clusters: Buffer[] = [];
  if (scheme === 'new') {
    const listing = entries[indexOf('Xlisting/titleOrdered/v1')];
    listing.cluster = 0; listing.blob = 0;
    clusters.push(cluster([Buffer.concat(front.map(f => u32(f.i)))], 'none'));
  }
  const blobs: Buffer[] = [];
  for (const e of entries) if (e.data) { e.cluster = clusters.length; e.blob = blobs.length; blobs.push(e.data); }
  clusters.push(cluster(blobs, opts.compression ?? 'zstd', opts.zstdParams, opts.zstdTrailer));

  const dirents = entries.map(e => {
    const head = Buffer.alloc(e.redirect ? 12 : 16);
    head.writeUInt16LE(e.redirect ? 0xffff : MIMES.indexOf(e.mime), 0);
    head.writeUInt8(0, 2);
    head.write(e.ns, 3, 'ascii');
    head.writeUInt32LE(0, 4);
    if (e.redirect) head.writeUInt32LE(indexOf(e.redirect), 8);
    else { head.writeUInt32LE(e.cluster!, 8); head.writeUInt32LE(e.blob!, 12); }
    return Buffer.concat([head, Buffer.from(`${e.path}\0${e.title}\0`)]);
  });

  const mimeList = Buffer.from(`${MIMES.map(m => (m === 'text/html' ? opts.htmlMime ?? m : m)).join('\0')}\0\0`);
  const allTitles = entries.map((e, i) => ({ e, i })).sort((a, b) => Buffer.compare(titleKey(a.e), titleKey(b.e)));
  const mimeListPos = 80;
  let at = mimeListPos + mimeList.length;
  const clusterPos = clusters.map(c => { const p = at; at += c.length; return p; });
  const padding = Buffer.alloc(opts.directoryPadding ?? 0);
  at += padding.length;
  const direntPos = dirents.map(d => { const p = at; at += d.length; return p; });
  const pathPtrPos = at;
  at += 8 * entries.length;
  const titlePtrPos = at;
  const titleList = scheme === 'old' ? Buffer.concat(allTitles.map(t => u32(t.i))) : Buffer.alloc(0);
  at += titleList.length;
  const clusterPtrPos = at;
  at += 8 * clusters.length;
  const checksumPos = at;

  const header = Buffer.alloc(80);
  header.writeUInt32LE(0x044d495a, 0);
  header.writeUInt16LE(scheme === 'new' ? 6 : 5, 4);
  header.writeUInt16LE(scheme === 'new' ? 3 : 0, 6);
  header.writeUInt32LE(entries.length, 24);
  header.writeUInt32LE(clusters.length, 28);
  header.writeBigUInt64LE(BigInt(pathPtrPos), 32);
  header.writeBigUInt64LE(scheme === 'old' ? BigInt(titlePtrPos) : 0xffffffffffffffffn, 40);
  header.writeBigUInt64LE(BigInt(clusterPtrPos), 48);
  header.writeBigUInt64LE(BigInt(mimeListPos), 56);
  header.writeUInt32LE(scheme === 'new' ? indexOf('WmainPage') : indexOf(`${ns}${opts.articles[0].path}`), 64);
  header.writeUInt32LE(0xffffffff, 68);
  header.writeBigUInt64LE(BigInt(checksumPos), 72);

  return new Uint8Array(Buffer.concat([
    header, mimeList, ...clusters, padding, ...dirents, ...direntPos.map(u64), titleList, ...clusterPos.map(u64), Buffer.alloc(16),
  ]));
}

/** A byte-range reader over an in-memory file, like RNFS.read over a content:// uri. */
export const rangeReader = (bytes: Uint8Array) => async (offset: number, length: number) =>
  bytes.subarray(offset, Math.min(offset + length, bytes.length));

/** The WikiMed-like fixture most Kiwix tests use. */
export const WIKIMED: ZimFixture = {
  name: 'wikipedia_en_medicine',
  title: 'WikiMed test',
  description: 'Medical articles from Wikipedia',
  tags: 'wikipedia;_category:wikipedia;_pictures:no',
  articles: [
    { path: 'Burn', title: 'Burn', html: '<html><head><style>p{}</style><script>var tracker=1;</script></head><body><h1>Burn</h1><p>Cool the burn under cool running water for twenty minutes.</p><p>Cover it loosely with cling film.</p></body></html>' },
    { path: 'Bursitis', title: 'Bursitis', html: '<html><body><p>Bursitis is inflammation of a bursa.</p></body></html>' },
    { path: 'Café', title: 'Café', html: '<html><body><p>A café serves coffee.</p></body></html>' },
  ],
  redirects: [{ path: 'Burns', title: 'Burns', to: 'Burn' }],
};
