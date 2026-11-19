/* eslint-disable no-bitwise -- a binary file format: flag bits and little-endian integers */
/**
 * A reader for Kiwix .zim files, written from the ZIM format (no libzim code: it is GPL). Everything is read by
 * byte range through `read`, so a several-GB file is never loaded: the header, one pointer and one directory
 * entry per step of a binary search, then the one cluster that holds an article. Layout notes and the real file
 * it was checked against: docs/superpowers/specs/2026-11-18-kiwix-library-design.md. All integers little-endian.
 */
import { decompress } from 'fzstd';
import { parse } from 'node-html-parser';

export type ReadRange = (offset: number, length: number) => Promise<Uint8Array>;

export interface ZimMetadata { name: string; title: string; description: string; tags: string; language: string }

type ZimErrorCode = 'not-zim' | 'xz' | 'compression' | 'unreadable';
const MESSAGES: Record<ZimErrorCode, string> = {
  'not-zim': "This isn't a Kiwix file.",
  xz: "This Kiwix file uses an older compression Fieldkit can't read. Download a newer copy in Kiwix.",
  compression: "This Kiwix file uses a compression Fieldkit can't read.",
  unreadable: "This Kiwix file can't be opened any more.",
};

export class ZimError extends Error {
  constructor(readonly code: ZimErrorCode) {
    super(MESSAGES[code]);
    this.name = 'ZimError';
  }
}

export interface ZimArchive {
  metadata: ZimMetadata;
  /** Article titles for a query, best first: exact titles, then titles that start with the query or its words. */
  findTitles(query: string, limit?: number): Promise<string[]>;
  /** The article with this title (redirects followed) as plain text, cut to maxChars; null when there is none. */
  readArticle(title: string, maxChars: number): Promise<{ title: string; text: string } | null>;
}

const MAGIC = 0x044d495a;
const REDIRECT = 0xffff;
const NONE = 0xffffffff;
/** One read usually holds a whole directory entry; a longer one is read again at the larger size. */
const DIRENT_READ = 512;
const DIRENT_READ_LONG = 4096;
const MAX_REDIRECTS = 5;
/** Words too common to look up as a title on their own. */
const STOP_WORDS = new Set(['how', 'what', 'why', 'when', 'where', 'who', 'the', 'and', 'for', 'with', 'does', 'can', 'should', 'about', 'from', 'into', 'your', 'you']);

const utf8 = new TextDecoder();
const encoder = new TextEncoder();

interface Dirent { mime: number; ns: string; titleBytes: Uint8Array; title: string; path: string; redirect?: number; cluster?: number; blob?: number }

const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)) + b[at + 3] * 0x1000000;
const u64 = (b: Uint8Array, at: number) => u32(b, at) + u32(b, at + 4) * 0x100000000;

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}
const hasPrefix = (a: Uint8Array, prefix: Uint8Array) => a.length >= prefix.length && compareBytes(a.subarray(0, prefix.length), prefix) === 0;
const withNs = (ns: string, bytes: Uint8Array) => { const out = new Uint8Array(bytes.length + 1); out[0] = ns.charCodeAt(0); out.set(bytes, 1); return out; };
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Plain text of an article's HTML: no scripts or styles, blank lines collapsed, cut to maxChars. */
export function zimHtmlToText(html: string, maxChars: number): string {
  const root = parse(html);
  root.querySelectorAll('script, style').forEach(node => node.remove());
  const body = root.querySelector('body') ?? root;
  return body.structuredText.replace(/[ \t]+/g, ' ').replace(/^ | $/gm, '').replace(/\n\s*\n+/g, '\n\n').trim().slice(0, maxChars);
}

function parseDirent(b: Uint8Array): Dirent | null {
  if (b.length < 8) return null;
  const mime = u16(b, 0);
  const ns = String.fromCharCode(b[3]);
  const headLength = mime === REDIRECT ? 12 : mime >= 0xfffd ? 8 : 16;
  const pathEnd = b.indexOf(0, headLength);
  const titleEnd = pathEnd < 0 ? -1 : b.indexOf(0, pathEnd + 1);
  if (titleEnd < 0) return null;
  const pathBytes = b.subarray(headLength, pathEnd);
  // An empty title means the title is the path.
  const titleBytes = titleEnd > pathEnd + 1 ? b.subarray(pathEnd + 1, titleEnd) : pathBytes;
  const entry: Dirent = { mime, ns, titleBytes, title: utf8.decode(titleBytes), path: utf8.decode(pathBytes) };
  if (mime === REDIRECT) entry.redirect = u32(b, 8);
  else if (headLength === 16) { entry.cluster = u32(b, 8); entry.blob = u32(b, 12); }
  return entry;
}

export async function openZim(read: ReadRange): Promise<ZimArchive> {
  const bytes = async (offset: number, length: number): Promise<Uint8Array> => {
    try {
      return await read(offset, length);
    } catch {
      throw new ZimError('unreadable');
    }
  };

  const header = await bytes(0, 80);
  if (header.length < 80 || u32(header, 0) !== MAGIC) throw new ZimError('not-zim');
  const major = u16(header, 4);
  const minor = u16(header, 6);
  const entryCount = u32(header, 24);
  const clusterCount = u32(header, 28);
  const pathPtrPos = u64(header, 32);
  const noTitleList = u32(header, 40) === NONE && u32(header, 44) === NONE;
  const titlePtrPos = u64(header, 40);
  const clusterPtrPos = u64(header, 48);
  const mimeListPos = u64(header, 56);
  const mainPage = u32(header, 64);
  const checksumPos = u64(header, 72);
  const articleNs = major >= 6 && minor >= 1 ? 'C' : 'A';

  // ponytail: the MIME list is read in one 4 KB go; real files list a dozen types.
  const mimeBytes = await bytes(mimeListPos, 4096);
  const mimes: string[] = [];
  for (let at = 0; at < mimeBytes.length;) {
    const end = mimeBytes.indexOf(0, at);
    if (end <= at) break;
    mimes.push(utf8.decode(mimeBytes.subarray(at, end)));
    at = end + 1;
  }

  const u32At = async (pos: number) => u32(await bytes(pos, 4), 0);
  const u64At = async (pos: number) => u64(await bytes(pos, 8), 0);
  async function direntAt(index: number): Promise<Dirent> {
    const pos = await u64At(pathPtrPos + 8 * index);
    const entry = parseDirent(await bytes(pos, DIRENT_READ)) ?? parseDirent(await bytes(pos, DIRENT_READ_LONG));
    if (!entry) throw new ZimError('unreadable');
    return entry;
  }
  async function resolve(entry: Dirent): Promise<Dirent> {
    for (let hops = 0; entry.mime === REDIRECT && hops < MAX_REDIRECTS; hops++) entry = await direntAt(entry.redirect!);
    return entry;
  }

  async function lowerBound(count: number, keyAt: (k: number) => Promise<Uint8Array>, target: Uint8Array): Promise<number> {
    let lo = 0;
    let hi = count;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (compareBytes(await keyAt(mid), target) < 0) lo = mid + 1; else hi = mid;
    }
    return lo;
  }
  async function indexOfPath(ns: string, path: string): Promise<number | null> {
    const target = withNs(ns, encoder.encode(path));
    const keyAt = async (i: number) => { const e = await direntAt(i); return withNs(e.ns, encoder.encode(e.path)); };
    const at = await lowerBound(entryCount, keyAt, target);
    return at < entryCount && compareBytes(await keyAt(at), target) === 0 ? at : null;
  }

  // ponytail: the last decompressed cluster is kept, nothing more; an LRU if repeated searches are slow on the phone.
  let cached: { index: number; data: Uint8Array; offsetSize: number } | null = null;
  async function clusterBounds(index: number): Promise<[number, number]> {
    const start = await u64At(clusterPtrPos + 8 * index);
    const end = index + 1 < clusterCount ? await u64At(clusterPtrPos + 8 * (index + 1)) : checksumPos;
    return [start, end];
  }
  function refuse(compression: number): never {
    throw new ZimError(compression === 4 ? 'xz' : 'compression');
  }
  async function cluster(index: number): Promise<{ data: Uint8Array; offsetSize: number }> {
    if (cached?.index === index) return cached;
    const [start, end] = await clusterBounds(index);
    const raw = await bytes(start, end - start);
    const compression = raw[0] & 0x0f;
    let data: Uint8Array;
    if (compression <= 1) data = raw.subarray(1);
    else if (compression === 5) {
      try {
        data = decompress(raw.subarray(1));
      } catch {
        throw new ZimError('unreadable');
      }
    } else refuse(compression);
    cached = { index, data, offsetSize: raw[0] & 0x10 ? 8 : 4 };
    return cached;
  }
  async function blob(clusterIndex: number, blobIndex: number): Promise<Uint8Array> {
    const { data, offsetSize } = await cluster(clusterIndex);
    const offset = (i: number) => (offsetSize === 8 ? u64(data, i * 8) : u32(data, i * 4));
    return data.subarray(offset(blobIndex), offset(blobIndex + 1));
  }

  // Title order: newer files keep it in X/listing/titleOrdered/v1 (path-list indexes, articles and redirects,
  // stored uncompressed so one index is one small read); older files in the header's title pointer list,
  // which covers every namespace, so its keys carry the namespace.
  type TitleIndex = { count: number; indexAt: (k: number) => Promise<number>; keyOf: (e: Dirent) => Uint8Array; target: (title: string) => Uint8Array };
  async function titleIndex(): Promise<TitleIndex | null> {
    if (!noTitleList) {
      return {
        count: entryCount, indexAt: k => u32At(titlePtrPos + 4 * k),
        keyOf: e => withNs(e.ns, e.titleBytes), target: t => withNs(articleNs, encoder.encode(t)),
      };
    }
    const at = await indexOfPath('X', 'listing/titleOrdered/v1');
    if (at === null) return null;
    const listing = await direntAt(at);
    if (listing.cluster === undefined || listing.blob === undefined) return null;
    const [start] = await clusterBounds(listing.cluster);
    const info = (await bytes(start, 1))[0];
    const offsetSize = info & 0x10 ? 8 : 4;
    const keyOf = (e: Dirent) => e.titleBytes;
    const target = (t: string) => encoder.encode(t);
    if ((info & 0x0f) <= 1) {
      const offsets = await bytes(start + 1 + offsetSize * listing.blob, offsetSize * 2);
      const from = offsetSize === 8 ? u64(offsets, 0) : u32(offsets, 0);
      const to = offsetSize === 8 ? u64(offsets, 8) : u32(offsets, 4);
      return { count: (to - from) / 4, indexAt: k => u32At(start + 1 + from + 4 * k), keyOf, target };
    }
    const data = await blob(listing.cluster, listing.blob);
    return { count: data.length / 4, indexAt: async k => u32(data, 4 * k), keyOf, target };
  }

  async function metadata(name: string): Promise<string> {
    const at = await indexOfPath('M', name);
    if (at === null) return '';
    const entry = await direntAt(at);
    return entry.cluster === undefined ? '' : utf8.decode(await blob(entry.cluster, entry.blob!));
  }

  // Refuse at once a file whose articles cannot be decompressed: the main page's cluster says how they are stored.
  if (mainPage !== NONE && mainPage < entryCount) {
    const main = await resolve(await direntAt(mainPage));
    if (main.cluster !== undefined) {
      const [start] = await clusterBounds(main.cluster);
      const compression = (await bytes(start, 1))[0] & 0x0f;
      if (compression > 1 && compression !== 5) refuse(compression);
    }
  }

  const meta: ZimMetadata = {
    name: await metadata('Name'), title: await metadata('Title'), description: await metadata('Description'),
    tags: await metadata('Tags'), language: await metadata('Language'),
  };
  const titles = await titleIndex();
  const isArticle = (e: Dirent) => e.ns === articleNs && (e.mime === REDIRECT || mimes[e.mime] === 'text/html');

  async function findTitles(query: string, limit = 6): Promise<string[]> {
    const q = query.trim();
    if (!titles || !q) return [];
    const words = q.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w.toLowerCase()));
    const candidates = [...new Set([q, capitalise(q), capitalise(q.toLowerCase()), ...words.map(w => capitalise(w.toLowerCase()))])];
    const keyAt = async (k: number) => titles.keyOf(await direntAt(await titles.indexAt(k)));
    const found: string[] = [];
    const add = (title: string) => { if (found.length < limit && !found.includes(title)) found.push(title); };
    const starts: Array<{ at: number; target: Uint8Array }> = [];
    // ponytail: naive title heuristic (exact titles first, then prefixes); full-text search needs its own index.
    for (const candidate of candidates) {
      const target = titles.target(candidate);
      const at = await lowerBound(titles.count, keyAt, target);
      starts.push({ at, target });
      if (at < titles.count) {
        const entry = await direntAt(await titles.indexAt(at));
        if (isArticle(entry) && compareBytes(titles.keyOf(entry), target) === 0) add(entry.title);
      }
    }
    for (const { at, target } of starts) {
      for (let k = at, steps = 0; k < titles.count && found.length < limit && steps < limit * 4; k++, steps++) {
        const entry = await direntAt(await titles.indexAt(k));
        if (!hasPrefix(titles.keyOf(entry), target)) break;
        if (isArticle(entry)) add(entry.title);
      }
    }
    return found;
  }

  async function readArticle(title: string, maxChars: number): Promise<{ title: string; text: string } | null> {
    let index: number | null = null;
    if (titles) {
      const target = titles.target(title);
      const keyAt = async (k: number) => titles.keyOf(await direntAt(await titles.indexAt(k)));
      const at = await lowerBound(titles.count, keyAt, target);
      if (at < titles.count && compareBytes(await keyAt(at), target) === 0) index = await titles.indexAt(at);
    }
    index ??= await indexOfPath(articleNs, title.replace(/ /g, '_'));
    if (index === null) return null;
    const entry = await resolve(await direntAt(index));
    if (entry.cluster === undefined || mimes[entry.mime] !== 'text/html') return null;
    const html = utf8.decode(await blob(entry.cluster, entry.blob!));
    return { title: entry.title, text: zimHtmlToText(html, maxChars) };
  }

  return { metadata: meta, findTitles, readArticle };
}
