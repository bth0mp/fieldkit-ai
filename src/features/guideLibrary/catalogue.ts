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
const isPositiveInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

function parseCategory(raw: unknown): GuideCategory | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id) || !isText(raw.name)) return null;
  return { id: raw.id, name: raw.name };
}

function parseGuide(raw: unknown, categoryIds: Set<string>): GuideEntry | null {
  if (!isObj(raw)) return null;
  const { id, title, category, publisher, year, licence, licenceNote, url, bytes, sha256, pages, hasText } = raw;
  const valid =
    typeof id === 'string' && ID_PATTERN.test(id) &&
    isText(title) && isText(publisher) && isText(licence) && isText(licenceNote) &&
    typeof category === 'string' && categoryIds.has(category) &&
    Number.isInteger(year) &&
    typeof url === 'string' && HTTPS_DNS_HOST_URL_PATTERN.test(url) &&
    isPositiveInt(bytes) && bytes <= MAX_GUIDE_BYTES && isPositiveInt(pages) &&
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
  if (!isObj(raw) || raw.version !== 1 || !isText(raw.updated)) return null;
  const categories = parseList(raw.categories, parseCategory);
  if (!categories || !hasUniqueIds(categories)) return null;
  const categoryIds = new Set(categories.map(c => c.id));
  const guides = parseList(raw.guides, g => parseGuide(g, categoryIds));
  if (!guides || !hasUniqueIds(guides)) return null;
  return { version: 1, updated: raw.updated, categories, guides };
}

function loadBundled(): Catalogue {
  const parsed = parseCatalogue(require('../../../catalog/guides.json'));
  if (!parsed) throw new Error('catalog/guides.json is not a valid guide catalogue');
  return parsed;
}

export const bundledCatalogue: Catalogue = loadBundled();
