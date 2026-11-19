/**
 * Builds small, valid Kiwix .zim files in memory for tests: the device boundary's stand-in for the files Kiwix
 * downloads. Layout per the ZIM format (checked against a real Kiwix file; see the Kiwix design doc): header,
 * MIME list, path pointers, (old scheme) title pointers, directory entries, cluster pointers, clusters, checksum.
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
}

type Entry = { ns: string; path: string; title: string; mime: string; data?: Buffer; redirect?: string; cluster?: number; blob?: number };

const MIMES = ['application/octet-stream+zimlisting', 'text/html', 'text/plain'];
const key = (e: { ns: string; path: string }) => Buffer.from(`${e.ns}${e.path}`);
const titleKey = (e: Entry) => Buffer.from(`${e.ns}${e.title || e.path}`);

function u64(n: number): Buffer { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }
function u32(n: number): Buffer { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }

function cluster(blobs: Buffer[], compression: 'zstd' | 'none' | 'xz', zstdParams?: Record<number, number>): Buffer {
  const offsets: number[] = [];
  let at = 4 * (blobs.length + 1);
  for (const b of blobs) { offsets.push(at); at += b.length; }
  offsets.push(at);
  const body = Buffer.concat([...offsets.map(u32), ...blobs]);
  if (compression === 'xz') return Buffer.concat([Buffer.from([4]), Buffer.from('not really xz data')]);
  if (compression === 'zstd') return Buffer.concat([Buffer.from([5]), zstdCompressSync(body, { params: zstdParams })]);
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

  // Cluster 0: every blob but the listing, compressed as asked. Cluster 1: the listing, uncompressed.
  const blobs: Buffer[] = [];
  for (const e of entries) if (e.data) { e.cluster = 0; e.blob = blobs.length; blobs.push(e.data); }
  const clusters = [cluster(blobs, opts.compression ?? 'zstd', opts.zstdParams)];
  const front = entries.map((e, i) => ({ e, i })).filter(({ e }) => e.ns === ns).sort((a, b) => Buffer.compare(titleKey(a.e), titleKey(b.e)));
  if (scheme === 'new') {
    const listing = entries[indexOf('Xlisting/titleOrdered/v1')];
    listing.cluster = 1; listing.blob = 0;
    clusters.push(cluster([Buffer.concat(front.map(f => u32(f.i)))], 'none'));
  }

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

  const mimeList = Buffer.from(`${MIMES.join('\0')}\0\0`);
  const allTitles = entries.map((e, i) => ({ e, i })).sort((a, b) => Buffer.compare(titleKey(a.e), titleKey(b.e)));
  const mimeListPos = 80;
  const pathPtrPos = mimeListPos + mimeList.length;
  const titlePtrPos = pathPtrPos + 8 * entries.length;
  const titleList = scheme === 'old' ? Buffer.concat(allTitles.map(t => u32(t.i))) : Buffer.alloc(0);
  let at = titlePtrPos + titleList.length;
  const direntPos = dirents.map(d => { const p = at; at += d.length; return p; });
  const clusterPtrPos = at;
  at += 8 * clusters.length;
  const clusterPos = clusters.map(c => { const p = at; at += c.length; return p; });
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
    header, mimeList, ...direntPos.map(u64), titleList, ...dirents, ...clusterPos.map(u64), ...clusters, Buffer.alloc(16),
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
