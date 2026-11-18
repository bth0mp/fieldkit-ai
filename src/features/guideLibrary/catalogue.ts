import logger from '../../utils/logger';

export interface GuideCategory { id: string; name: string }

export interface GuideEntry {
  id: string;
  title: string;
  category: string;
  publisher: string;
  year: number;
  licence: string;
  licenceNote: string;
  url: string;
  bytes: number;
  sha256: string;
  pages: number;
  hasText: boolean;
}

export interface Catalogue {
  version: 1;
  updated: string;
  categories: GuideCategory[];
  guides: GuideEntry[];
}

export const CATALOGUE_URL = 'https://raw.githubusercontent.com/bth0mp/fieldkit-ai/main/catalog/guides.json';

// The id becomes part of a file name on the phone, so it must never contain a path separator or dot.
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
// https only, host is a dotted DNS name ending in an alphabetic TLD (no credentials, port, IP literal or localhost),
// then nothing or a "/" followed by non-whitespace. A regex, not URL: its getters are unreliable on Hermes.
const HTTPS_DNS_HOST_URL_PATTERN = /^https:\/\/(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}(?:\/\S*)?$/;
const MAX_GUIDE_BYTES = 60 * 1024 * 1024;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// An allowlist, not a list of bad characters: there are too many invisible ones to name them all, and the
// catalogue lists English-language guides. Widen it deliberately when a guide in another script is added.
const LATIN_TEXT_CODE_POINTS: readonly (readonly [number, number])[] = [
  [0x0020, 0x007e], // printable ASCII
  [0x00a1, 0x00ac], [0x00ae, 0x00ff], // Latin-1 letters and symbols, without the soft hyphen U+00AD
  [0x0100, 0x017f], // Latin Extended-A
  [0x2013, 0x2014], // en and em dash
  [0x2018, 0x2019], [0x201c, 0x201d], // curly quotes
  [0x2022, 0x2022], [0x2026, 0x2026], // bullet, ellipsis
];
/** Every code point is in LATIN_TEXT_CODE_POINTS. A code-point loop: Hermes has no Unicode property escapes. */
function isLatinText(s: string): boolean {
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (!LATIN_TEXT_CODE_POINTS.some(([lo, hi]) => cp >= lo && cp <= hi)) return false;
  }
  return true;
}
/**
 * A single line of at most `max` allowed characters with no surrounding whitespace. Titles and publishers end up
 * in the knowledge-base document name that is quoted to the model, so a fetched catalogue must not smuggle lines
 * or hidden text in.
 */
const isLine = (v: unknown, max: number): v is string =>
  isText(v) && v.length <= max && v.trim() === v && isLatinText(v);
/** True for a catalogue id: lowercase letters, digits and dashes, so it is safe as part of a file name. */
export const isCatalogueId =(v: unknown): v is string => typeof v === 'string' && ID_PATTERN.test(v);
const isPositiveInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

function parseCategory(raw: unknown): GuideCategory | null {
  if (!isObj(raw) || !isCatalogueId(raw.id) || !isLine(raw.name, 80)) return null;
  return { id: raw.id, name: raw.name };
}

function parseGuide(raw: unknown, categoryIds: Set<string>): GuideEntry | null {
  if (!isObj(raw)) return null;
  const { id, title, category, publisher, year, licence, licenceNote, url, bytes, sha256, pages, hasText } = raw;
  const valid =
    isCatalogueId(id) &&
    isLine(title, 200) && isLine(publisher, 80) && isLine(licence, 80) && isLine(licenceNote, 2000) &&
    typeof category === 'string' && categoryIds.has(category) &&
    Number.isInteger(year) &&
    typeof url === 'string' && HTTPS_DNS_HOST_URL_PATTERN.test(url) &&
    isPositiveInt(bytes) && bytes <= MAX_GUIDE_BYTES && isPositiveInt(pages) &&
    typeof sha256 === 'string' && SHA256_PATTERN.test(sha256) &&
    typeof hasText === 'boolean';
  if (!valid) return null;
  return { id, title, category, publisher, year: year as number, licence, licenceNote, url, bytes, sha256, pages, hasText };
}

/**
 * Checks a saved entry (the one a downloaded file was checked against) for structure only: an id that can name a
 * file, the fields the app reads, of the right types. Not the catalogue's text, length, URL or category rules: the
 * entry passed those when it was downloaded, and a later, stricter rule must never cost the user their guide.
 * Returns it (unknown fields dropped), or null when it is corrupt.
 */
export function parseSavedEntry(raw: unknown): GuideEntry | null {
  if (!isObj(raw)) return null;
  const { id, title, category, publisher, year, licence, licenceNote, url, bytes, sha256, pages, hasText } = raw;
  const valid =
    isCatalogueId(id) &&
    isText(title) && isText(publisher) && isText(licence) && isText(licenceNote) && isText(url) &&
    typeof category === 'string' && Number.isInteger(year) &&
    isPositiveInt(bytes) && isPositiveInt(pages) &&
    typeof sha256 === 'string' && SHA256_PATTERN.test(sha256) &&
    typeof hasText === 'boolean';
  if (!valid) return null;
  return { id, title, category, publisher, year: year as number, licence, licenceNote, url, bytes, sha256, pages, hasText };
}

function parseList<T>(raw: unknown, parseItem: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(raw)) return null;
  const out: T[] = [];
  for (const item of raw) {
    const parsed = parseItem(item);
    if (!parsed) return null;
    out.push(parsed);
  }
  return out;
}

const hasUniqueIds = (items: { id: string }[]) => new Set(items.map(i => i.id)).size === items.length;

/** Validates an untrusted catalogue. Returns it (unknown fields dropped) only if every check passes, else null. */
export function parseCatalogue(raw: unknown): Catalogue | null {
  if (!isObj(raw) || raw.version !== 1 || typeof raw.updated !== 'string' || !DATE_PATTERN.test(raw.updated)) return null;
  const categories = parseList(raw.categories, parseCategory);
  if (!categories || !hasUniqueIds(categories)) return null;
  const categoryIds = new Set(categories.map(c => c.id));
  const guides = parseList(raw.guides, g => parseGuide(g, categoryIds));
  if (!guides || !hasUniqueIds(guides)) return null;
  return { version: 1, updated: raw.updated, categories, guides };
}

/**
 * What the app runs on when the shipped catalogue is invalid: no guides, dated so that any real saved catalogue is
 * newer. The library is empty until a valid catalogue is fetched, but the app still starts.
 */
const EMPTY_CATALOGUE: Catalogue = { version: 1, updated: '1970-01-01', categories: [], guides: [] };

/**
 * The shipped catalogue. This module loads at app start, so a bad edit to the data file must not throw here; the
 * unit test that parses the shipped file, run by the pre-push hook when `catalog/` changes, catches it before
 * release.
 */
function loadBundled(): Catalogue {
  const parsed = parseCatalogue(require('../../../catalog/guides.json'));
  if (parsed) return parsed;
  logger.error('[GuideLibrary] catalog/guides.json is not a valid guide catalogue; the library starts empty');
  return EMPTY_CATALOGUE;
}

export const bundledCatalogue: Catalogue = loadBundled();
