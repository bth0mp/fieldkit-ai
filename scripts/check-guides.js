#!/usr/bin/env node
// Turns hand-written candidates (catalog/candidates.json) into measured entries in catalog/guides.json.
//   node scripts/check-guides.js           check candidates not yet in guides.json and add the ones that pass
//   node scripts/check-guides.js --verify  re-download every guide; exit 1 if a link is dead or size/hash differ
//   A candidate may carry "readOnly": true and a "readOnlyNote" (what is unreadable): it ships with hasText false.
// Needs pdftotext on the PATH (Git Bash: /mingw64/bin). Downloads are untrusted: each goes in its own temp dir.
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const GUIDES_FILE = path.join(ROOT, 'catalog/guides.json');
const CANDIDATES_FILE = path.join(ROOT, 'catalog/candidates.json');

const USER_AGENT = 'Dalvik/2.1.0 (Linux; U; Android 14)';
const MAX_GUIDE_BYTES = 60 * 1024 * 1024;
const MAX_REDIRECTS = 5;
// Hosts that serve a file unaltered by their own account of it; everything else needs an identical second copy.
const TRUSTED_HOSTS = ['digital.library.unt.edu', 'webarchive.library.unt.edu', 'fs-prod-nwcg.s3.us-gov-west-1.amazonaws.com'];
const PDFTOTEXT_TIMEOUT_MS = 60000;
const PDFTOTEXT_MAX_BUFFER = 64 * 1024 * 1024;
// Mirrors ID_PATTERN and HTTPS_DNS_HOST_URL_PATTERN in src/features/guideLibrary/catalogue.ts, the source of truth.
// If that validator changes, change these. Drift shows when the app's unit test of the shipped catalogue fails,
// which the pre-push hook runs whenever catalog/ changes.
const HTTPS_DNS_HOST_URL_PATTERN = /^https:\/\/(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}(?:\/\S*)?$/;
const HOST_GAP_MS = 2000;
const TRIES = 3;
const REQUEST_TIMEOUT_MS = 120000;
const TEXT_PAGES = 30;
const MIN_TEXT_CHARS = 2000;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ENTRY_FIELDS = ['id', 'title', 'category', 'publisher', 'year', 'licence', 'licenceNote', 'url', 'bytes', 'sha256', 'pages', 'hasText'];
const REQUIRED_CANDIDATE_FIELDS = ['id', 'title', 'category', 'publisher', 'year', 'licence', 'licenceNote', 'url'];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

/** True if the text contains the "approved for public release" distribution statement, however it wraps. */
function hasReleaseStatement(text) {
  return /approved\s+for\s+public\s+release/i.test(text);
}

/** Size and SHA-256 of a file that starts with the PDF magic bytes; rejects with "not a PDF" otherwise. */
async function describePdf(file) {
  const handle = await fs.promises.open(file, 'r');
  try {
    const head = Buffer.alloc(5);
    await handle.read(head, 0, 5, 0);
    if (head.toString('latin1') !== '%PDF-') throw new Error('not a PDF');
  } finally {
    await handle.close();
  }
  const data = await fs.promises.readFile(file);
  return { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
}

const lastRequestByHost = new Map();

async function waitForHost(host) {
  const wait = (lastRequestByHost.get(host) || 0) + HOST_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestByHost.set(host, Date.now());
}

/** The next URL for a redirect response, or null if the response is not a redirect. Refuses anything but https. */
function nextHop({ status, location }, currentUrl, hopsDone) {
  if (![301, 302, 303, 307, 308].includes(status) || !location) return null;
  if (hopsDone >= MAX_REDIRECTS) throw new Error('too many redirects');
  let next;
  try {
    next = new URL(location, currentUrl);
  } catch {
    throw new Error('redirected to an invalid address');
  }
  if (next.protocol !== 'https:') throw new Error('redirected to a non-https address');
  return next.href;
}

/** Fetches by hand so every redirect hop can be checked: the recorded hash must come from https content only. */
async function fetchFollowingHttps(url) {
  const seen = new Set();
  for (let hops = 0; ; hops++) {
    if (seen.has(url)) throw new Error('too many redirects');
    seen.add(url);
    await waitForHost(new URL(url).host);
    const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const next = nextHop({ status: res.status, location: res.headers.get('location') }, url, hops);
    if (!next) return res;
    await res.body?.cancel();
    url = next;
  }
}

async function downloadOnce(url, file) {
  const res = await fetchFollowingHttps(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get('content-length')) > MAX_GUIDE_BYTES) throw new Error('over the 60 MB limit');
  const chunks = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > MAX_GUIDE_BYTES) throw new Error('over the 60 MB limit');
    chunks.push(chunk);
  }
  await fs.promises.writeFile(file, Buffer.concat(chunks));
}

async function download(url, file) {
  let lastError;
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    try {
      return await downloadOnce(url, file);
    } catch (err) {
      lastError = err;
      if (attempt < TRIES) await sleep(attempt * 3000);
    }
  }
  throw new Error(`download failed after ${TRIES} tries: ${lastError.message}`);
}

function checkPdftotext() {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error('pdftotext not found on the PATH. Run this from Git Bash, which has it in /mingw64/bin.');
      process.exit(2);
    }
  }
}

/** One pdftotext pass over the whole file, with a timeout; a failure becomes a clear reason for this candidate. */
function pdfText(file, flags = []) {
  try {
    return execFileSync('pdftotext', [...flags, file, '-'], { encoding: 'utf8', maxBuffer: PDFTOTEXT_MAX_BUFFER, timeout: PDFTOTEXT_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (err) {
    if (err.code === 'ETIMEDOUT') throw new Error('pdftotext timed out');
    if (err.code === 'ENOBUFS') throw new Error('pdftotext output too large');
    throw new Error(`pdftotext failed: ${err.message.split('\n')[0]}`);
  }
}

/** Page count (form feeds in the text, so inflated when a font's encoding emits stray ones: see measureCandidate) and whether the first pages carry a real text layer. */
function readTextLayer(file) {
  const parts = pdfText(file).split('\f');
  const head = parts.slice(0, TEXT_PAGES).join('\f');
  const hasText = head.replace(/\s/g, '').length >= MIN_TEXT_CHARS;
  return { pages: parts.length - 1, hasText, head, text: parts.join('\f') };
}

/** Why a candidate's "approved for public release" claim fails, or null (also when none is made). statementSeen: true means it was read by eye, on a scan or where the text layer garbles it. */
function releaseStatementProblem(candidate, headText, hasText) {
  if (!hasReleaseStatement(candidate.licenceNote)) return null;
  if (!hasText) return candidate.statementSeen === true ? null : 'scanned, statement must be confirmed by eye';
  return hasReleaseStatement(headText) || candidate.statementSeen === true ? null : 'release statement not found in the document';
}

// A tripwire for review by eye: wide on purpose, since a miss is worse than a false alarm. Whole words only;
// pdftotext wraps lines mid-phrase, so words inside a phrase are joined with \s+.
const THIRD_PARTY_PATTERN = new RegExp([
  '\\bpermissions?\\b', '\\bcourtesy\\b', '\\bcopyright(?:s|ed)?\\b', '©', '\\ball\\s+rights\\s+reserved\\b',
  '\\b(?:reprinted|reproduced)\\s+(?:from|with|by)\\b', '^[ \\t\\r]*credits[ \\t\\r]*$',
  '\\backnowledg(?:e)?ments?\\b', '\\bgratefully\\s+acknowledged\\b',
].join('|'), 'gim');
const SNIPPET_RADIUS = 60;
const MAX_SNIPPETS = 5;

// pdftotext splits a word with a hyphen at a line end ("per-\nmission"), which the whole-word pattern misses in the
// text as printed. Joining the splits finds those, but glues real compounds too ("non-\ncopyrighted" ->
// "noncopyrighted"), which hides a hit the printed text has. So the scan reads both: every hit in the joined text,
// plus each hit in the printed text that sits against a split (the ones joining glued away).
const LINE_END_HYPHEN = /(\p{L})-[ \t]*\r?\n[ \t]*(\p{L})/gu;
const joinHyphenatedLineBreaks = text => text.replace(LINE_END_HYPHEN, '$1$2');
const SPLIT_BEFORE = /\p{L}-[ \t]*\r?\n[ \t]*$/u;
const SPLIT_AFTER = /^-[ \t]*\r?\n[ \t]*\p{L}/u;
const SPLIT_REACH = 40;

const matchesIn = text => [...text.matchAll(new RegExp(THIRD_PARTY_PATTERN.source, THIRD_PARTY_PATTERN.flags))];

/** True when joining split words glues `match` to its neighbour, so only the printed text shows it. */
function gluedByJoin(text, match) {
  const end = match.index + match[0].length;
  return SPLIT_BEFORE.test(text.slice(Math.max(0, match.index - SPLIT_REACH), match.index))
    || SPLIT_AFTER.test(text.slice(end, end + SPLIT_REACH));
}

/** Snippets for `matches` (in order) of `text`, skipping hits within a snippet's reach of the one before. */
function snippetsOf(text, matches, room) {
  const snippets = [];
  let next = 0;
  for (const match of matches) {
    if (snippets.length >= room) break;
    if (match.index < next) continue;
    const raw = text.slice(Math.max(0, match.index - SNIPPET_RADIUS), match.index + match[0].length + SNIPPET_RADIUS);
    snippets.push(raw.replace(/\s+/g, ' ').trim());
    next = match.index + match[0].length + SNIPPET_RADIUS;
  }
  return snippets;
}

/** Up to five short snippets around wording that suggests third-party material, plus the total number of matches. */
function scanThirdParty(printed) {
  const joined = joinHyphenatedLineBreaks(printed);
  const joinedHits = matchesIn(joined);
  const printedOnly = matchesIn(printed).filter(match => gluedByJoin(printed, match));
  const snippets = snippetsOf(joined, joinedHits, MAX_SNIPPETS);
  snippets.push(...snippetsOf(printed, printedOnly, MAX_SNIPPETS - snippets.length));
  return { snippets, total: joinedHits.length + printedOnly.length };
}

const thirdPartyMentions = text => scanThirdParty(text).snippets;

const quoted = s => `"${s}"`;

/** Why a document with third-party wording cannot be accepted without review, or null. */
function thirdPartyProblem(record, { text, hasText }) {
  if (record && record.creditsReviewed === true) return null;
  if (!hasText) return 'scanned, third-party credits must be confirmed by eye';
  const { snippets, total } = scanThirdParty(text);
  if (!snippets.length) return null;
  const more = total > snippets.length ? ` (${total} mentions in all, read the whole document)` : '';
  return `third-party material mentioned, review needed: ${snippets.map(quoted).join(' | ')}${more}`;
}

/** Strips helper fields, sorts by category order then title. */
function shapeEntries(guides, categoryIds) {
  return guides
    .map(g => Object.fromEntries(ENTRY_FIELDS.map(f => [f, g[f]])))
    .sort((a, b) => categoryIds.indexOf(a.category) - categoryIds.indexOf(b.category) || a.title.localeCompare(b.title));
}

// Mirrors LATIN_TEXT_CODE_POINTS, the caps and isLine in src/features/guideLibrary/catalogue.ts, the source of truth.
// One entry the app rejects blocks every phone from updating, so keep these in step with that file. The app's
// unit test of the shipped catalogue fails on such an entry.
const LATIN_TEXT_CODE_POINTS = [
  [0x0020, 0x007e],
  [0x00a1, 0x00ac], [0x00ae, 0x00ff],
  [0x0100, 0x017f],
  [0x2013, 0x2014],
  [0x2018, 0x2019], [0x201c, 0x201d],
  [0x2022, 0x2022], [0x2026, 0x2026],
];
const TEXT_FIELD_MAX = { title: 200, publisher: 80, licence: 80, licenceNote: 2000 };
const isText = v => typeof v === 'string' && v.length > 0;

/** The first character outside the allowlist, as "U+00A0", or null. A code-point loop, no \p escapes. */
function firstDisallowedChar(s) {
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (!LATIN_TEXT_CODE_POINTS.some(([lo, hi]) => cp >= lo && cp <= hi)) return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return null;
}

/** Why title, publisher, licence or licenceNote would be rejected by the app's validator, or null. */
function textFieldProblem(entry) {
  for (const [field, max] of Object.entries(TEXT_FIELD_MAX)) {
    const v = entry[field];
    if (!isText(v)) return `${field} must be non-empty text`;
    if (v.length > max) return `${field} is longer than ${max} characters`;
    if (v.trim() !== v) return `${field} has leading or trailing whitespace`;
    const bad = firstDisallowedChar(v);
    if (bad) return `${field} has a character outside the allowed set: ${bad}`;
  }
  return null;
}

/** Why a candidate's readOnly / readOnlyNote helper fields are unusable, or null. */
function readOnlyFieldProblem(candidate) {
  const { readOnly, readOnlyNote } = candidate;
  if (readOnly === undefined) return readOnlyNote === undefined ? null : 'readOnlyNote needs readOnly';
  if (readOnly !== true) return 'readOnly must be true when present';
  return isText(readOnlyNote) ? null : 'readOnly needs a readOnlyNote';
}

/** The hasText a guide ships with: the measured text layer, unless the candidate is marked read only. */
const teachable = (candidate, layerHasText) => layerHasText && candidate.readOnly !== true;

/** A guide listed with hasText true although its candidate record says read only, or null. */
function readOnlyMismatch(guide, record) {
  return record && record.readOnly === true && guide.hasText === true ? 'marked read only in candidates.json but hasText is true' : null;
}

function validateCandidate(candidate, categoryIds) {
  const missing = REQUIRED_CANDIDATE_FIELDS.filter(f => candidate[f] === undefined || candidate[f] === '');
  if (missing.length) throw new Error(`missing ${missing.join(', ')}`);
  if (typeof candidate.id !== 'string' || !ID_PATTERN.test(candidate.id)) throw new Error('bad id');
  const textProblem = textFieldProblem(candidate);
  if (textProblem) throw new Error(textProblem);
  if (!categoryIds.includes(candidate.category)) throw new Error(`unknown category ${candidate.category}`);
  if (!Number.isInteger(candidate.year)) throw new Error('year must be an integer');
  if (typeof candidate.url !== 'string' || !HTTPS_DNS_HOST_URL_PATTERN.test(candidate.url)) {
    throw new Error('url must be https with a plain DNS host (no credentials, port, IP address or localhost)');
  }
  const problem = readOnlyFieldProblem(candidate) || mirrorProblem(candidate);
  if (problem) throw new Error(problem);
}

const hostOf = url => new URL(url).hostname.toLowerCase();
// The last two labels, so www.example.org and example.org count as one site (not exact for co.uk-style suffixes).
const siteOf = url => hostOf(url).split('.').slice(-2).join('.');

/** True when a guide's host is not one we trust to serve the file unaltered, so an identical second copy is required. */
function needsMirror(url) {
  const host = hostOf(url);
  if (TRUSTED_HOSTS.includes(host) || host.endsWith('.mil') || host.endsWith('.gov')) return false;
  const rawCapture = host === 'web.archive.org' && /^\/web\/\d{14}id_\//.test(new URL(url).pathname);
  return !rawCapture;
}

/** Why a candidate's `mirrors` list is unusable, or null. Each mirror must be strict https on a host other than `url`. */
function mirrorProblem(candidate) {
  if (candidate.mirrors === undefined) return null;
  if (!Array.isArray(candidate.mirrors)) return 'mirrors must be an array of urls';
  const primarySite = siteOf(candidate.url);
  for (const mirror of candidate.mirrors) {
    if (typeof mirror !== 'string' || !HTTPS_DNS_HOST_URL_PATTERN.test(mirror)) return `mirror ${mirror} must be https with a plain DNS host`;
    if (siteOf(mirror) === primarySite) return `mirror ${mirror} is on the same host as url`;
  }
  return null;
}

/** Downloads each mirror and requires the SHA-256 the primary gave. Throws "mirror <host> differs" or "... failed: <reason>". */
async function checkMirrors(url, mirrors, sha256) {
  if (!mirrors.length) {
    if (needsMirror(url)) throw new Error('third-party host needs a second copy (mirrors)');
    return;
  }
  for (const mirror of mirrors) {
    const host = hostOf(mirror);
    let actual;
    try {
      actual = await withDownload(mirror, describePdf);
    } catch (err) {
      throw new Error(`mirror ${host} failed: ${err.message}`);
    }
    if (actual.sha256 !== sha256) throw new Error(`mirror ${host} differs`);
  }
}

/** Real page count: the form feeds of the normal output (one per page) less the stray ones, which are those pdftotext still emits with -nopgbrk. Refuses below 1. */
function exactPages(formFeeds, stray) {
  if (formFeeds - stray < 1) throw new Error('no pages found in the document');
  return formFeeds - stray;
}

function validateMeasured(measured) {
  if (measured.bytes > MAX_GUIDE_BYTES) throw new Error('over the 60 MB limit');
}

/** Downloads into a fresh temp directory, runs fn(file), and always removes the directory. */
async function withDownload(url, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-'));
  try {
    const file = path.join(dir, 'guide.pdf');
    await download(url, file);
    return await fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function checkCandidate(candidate, categoryIds) {
  validateCandidate(candidate, categoryIds);
  if (!candidate.mirrors?.length && needsMirror(candidate.url)) throw new Error('third-party host needs a second copy (mirrors)');
  const entry = await measureCandidate(candidate);
  await checkMirrors(candidate.url, candidate.mirrors || [], entry.sha256);
  return entry;
}

function measureCandidate(candidate) {
  return withDownload(candidate.url, async file => {
    const measured = await describePdf(file);
    const layer = readTextLayer(file);
    validateMeasured(measured);
    const problem = releaseStatementProblem(candidate, layer.head, layer.hasText);
    if (problem) throw new Error(problem);
    const creditsProblem = thirdPartyProblem(candidate, layer);
    if (creditsProblem) throw new Error(creditsProblem);
    const stray = pdfText(file, ['-nopgbrk']).split('\f').length - 1;
    return { ...candidate, ...measured, pages: exactPages(layer.pages, stray), hasText: teachable(candidate, layer.hasText) };
  });
}

/** Two-space JSON, with each category kept on one line as in the committed file. */
function serialise(catalogue) {
  return JSON.stringify(catalogue, null, 2).replace(/\{\s+("id": "[^"]*"),\s+("name": "[^"]*")\s+\}/g, '{ $1, $2 }');
}

async function addCandidates() {
  const catalogue = readJson(GUIDES_FILE);
  const known = new Set(catalogue.guides.map(g => g.id));
  const pending = readJson(CANDIDATES_FILE).filter(c => !known.has(c.id));
  console.log(`${pending.length} candidates`);
  if (!pending.length) return 0;
  checkPdftotext();
  const categoryIds = catalogue.categories.map(c => c.id);
  let added = 0;
  for (const candidate of pending) {
    try {
      if (known.has(candidate.id)) throw new Error('duplicate id in candidates');
      const entry = await checkCandidate(candidate, categoryIds);
      // Saved after every candidate so a crash later in a long run loses nothing.
      catalogue.guides = shapeEntries([...catalogue.guides, entry], categoryIds);
      catalogue.updated = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(GUIDES_FILE, `${serialise(catalogue)}\n`);
      known.add(candidate.id);
      added++;
      console.log(`added ${candidate.id}`);
    } catch (err) {
      console.log(`FAILED ${candidate.id}: ${err.message}`);
    }
  }
  console.log(`${added} added, ${pending.length - added} failed`);
  return 0;
}

/** Re-downloads the primary: size, hash and the third-party scan. Returns the problems found (empty if none). */
function verifyPrimary(guide, record) {
  return withDownload(guide.url, async file => {
    const problems = [];
    const actual = await describePdf(file);
    if (actual.bytes !== guide.bytes) problems.push(`size changed (${guide.bytes} -> ${actual.bytes})`);
    if (actual.sha256 !== guide.sha256) problems.push('sha256 changed');
    const mismatch = readOnlyMismatch(guide, record);
    if (mismatch) problems.push(mismatch);
    try {
      const problem = thirdPartyProblem(record, readTextLayer(file));
      if (problem) problems.push(problem);
    } catch (err) {
      problems.push(err.message);
    }
    return problems;
  });
}

/** Parses `--only a,b` and checks every id exists in the catalogue. Returns null when not given. */
function onlyIds(argv, guides) {
  const at = argv.indexOf('--only');
  if (at < 0) return null;
  const ids = (argv[at + 1] || '').split(',').filter(Boolean);
  if (!ids.length) throw new Error('--only needs a comma-separated list of ids');
  const unknown = ids.filter(id => !guides.some(g => g.id === id));
  if (unknown.length) throw new Error(`unknown id in --only: ${unknown.join(', ')}`);
  return ids;
}

/** Mirrors come from the guide's record in candidates.json; a guide that needs one and has none fails. */
function verifyMirrors(guide, candidates) {
  const record = candidates.find(c => c.id === guide.id);
  if (!record && needsMirror(guide.url)) return Promise.reject(new Error('third-party host needs a second copy (no candidate record)'));
  const problem = record && mirrorProblem({ ...record, url: guide.url });
  if (problem) return Promise.reject(new Error(problem));
  return checkMirrors(guide.url, (record && record.mirrors) || [], guide.sha256);
}

async function verifyGuide(guide, candidates, mirrorsOnly) {
  const record = candidates.find(c => c.id === guide.id);
  const textProblem = mirrorsOnly ? null : textFieldProblem(guide);
  const problems = mirrorsOnly ? [] : await verifyPrimary(guide, record);
  if (textProblem) problems.unshift(textProblem);
  try {
    await verifyMirrors(guide, candidates);
  } catch (err) {
    problems.push(err.message);
  }
  return problems;
}

async function verifyCatalogue(mirrorsOnly) {
  const { guides } = readJson(GUIDES_FILE);
  const candidates = readJson(CANDIDATES_FILE);
  const ids = onlyIds(process.argv, guides);
  let checked = mirrorsOnly ? guides.filter(g => needsMirror(g.url) || candidates.some(c => c.id === g.id && c.mirrors?.length)) : guides;
  if (ids) checked = guides.filter(g => ids.includes(g.id) && (!mirrorsOnly || checked.includes(g)));
  if (!mirrorsOnly) checkPdftotext();
  let failures = 0;
  for (const guide of checked) {
    try {
      const problems = await verifyGuide(guide, candidates, mirrorsOnly);
      if (problems.length) throw new Error(problems.join('; '));
      console.log(`ok ${guide.id}`);
    } catch (err) {
      failures++;
      console.log(`FAILED ${guide.id}: ${err.message}`);
    }
  }
  console.log(`${checked.length - failures} ok, ${failures} failed`);
  return failures ? 1 : 0;
}

if (require.main === module) {
  const run = process.argv.includes('--verify-mirrors') ? () => verifyCatalogue(true)
    : process.argv.includes('--verify') ? () => verifyCatalogue(false) : addCandidates;
  run().then(code => process.exit(code), err => { console.error(err.message); process.exit(2); });
}

module.exports = { hasReleaseStatement, describePdf, releaseStatementProblem, shapeEntries, nextHop, needsMirror, mirrorProblem, scanThirdParty, thirdPartyMentions, thirdPartyProblem, textFieldProblem, validateCandidate, teachable, readOnlyMismatch, exactPages };
