#!/usr/bin/env node
// Turns hand-written candidates (catalog/candidates.json) into measured entries in catalog/guides.json.
//   node scripts/check-guides.js           check candidates not yet in guides.json and add the ones that pass
//   node scripts/check-guides.js --verify  re-download every guide; exit 1 if a link is dead or size/hash differ
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
const PDFTOTEXT_TIMEOUT_MS = 60000;
const PDFTOTEXT_MAX_BUFFER = 64 * 1024 * 1024;
// Mirrors ID_PATTERN and HTTPS_DNS_HOST_URL_PATTERN in src/features/guideLibrary/catalogue.ts, the source of truth.
// If that validator changes, change these; the shipped-catalogue unit test catches drift.
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
function pdfText(file) {
  try {
    return execFileSync('pdftotext', [file, '-'], { encoding: 'utf8', maxBuffer: PDFTOTEXT_MAX_BUFFER, timeout: PDFTOTEXT_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (err) {
    if (err.code === 'ETIMEDOUT') throw new Error('pdftotext timed out');
    if (err.code === 'ENOBUFS') throw new Error('pdftotext output too large');
    throw new Error(`pdftotext failed: ${err.message.split('\n')[0]}`);
  }
}

/** Page count (form feeds in the text) and whether the first pages carry a real text layer. */
function readTextLayer(file) {
  const parts = pdfText(file).split('\f');
  const head = parts.slice(0, TEXT_PAGES).join('\f');
  const hasText = head.replace(/\s/g, '').length >= MIN_TEXT_CHARS;
  return { pages: parts.length - 1, hasText, head };
}

/** Why a candidate's "approved for public release" claim cannot be accepted, or null if it can (or none is made). */
function releaseStatementProblem(candidate, headText, hasText) {
  if (!hasReleaseStatement(candidate.licenceNote)) return null;
  if (!hasText) return candidate.statementSeen === true ? null : 'scanned, statement must be confirmed by eye';
  return hasReleaseStatement(headText) ? null : 'release statement not found in the document';
}

/** Strips helper fields, sorts by category order then title. */
function shapeEntries(guides, categoryIds) {
  return guides
    .map(g => Object.fromEntries(ENTRY_FIELDS.map(f => [f, g[f]])))
    .sort((a, b) => categoryIds.indexOf(a.category) - categoryIds.indexOf(b.category) || a.title.localeCompare(b.title));
}

const isText = v => typeof v === 'string' && v.length > 0;

function validateCandidate(candidate, categoryIds) {
  const missing = REQUIRED_CANDIDATE_FIELDS.filter(f => candidate[f] === undefined || candidate[f] === '');
  if (missing.length) throw new Error(`missing ${missing.join(', ')}`);
  if (typeof candidate.id !== 'string' || !ID_PATTERN.test(candidate.id)) throw new Error('bad id');
  const notText = ['title', 'publisher', 'licence', 'licenceNote'].filter(f => !isText(candidate[f]));
  if (notText.length) throw new Error(`${notText.join(', ')} must be non-empty text`);
  if (!categoryIds.includes(candidate.category)) throw new Error(`unknown category ${candidate.category}`);
  if (!Number.isInteger(candidate.year)) throw new Error('year must be an integer');
  if (typeof candidate.url !== 'string' || !HTTPS_DNS_HOST_URL_PATTERN.test(candidate.url)) {
    throw new Error('url must be https with a plain DNS host (no credentials, port, IP address or localhost)');
  }
}

function validateMeasured(measured, layer) {
  if (measured.bytes > MAX_GUIDE_BYTES) throw new Error('over the 60 MB limit');
  if (layer.pages < 1) throw new Error('no pages found in the document');
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

function checkCandidate(candidate, categoryIds) {
  validateCandidate(candidate, categoryIds);
  return withDownload(candidate.url, async file => {
    const measured = await describePdf(file);
    const layer = readTextLayer(file);
    validateMeasured(measured, layer);
    const problem = releaseStatementProblem(candidate, layer.head, layer.hasText);
    if (problem) throw new Error(problem);
    return { ...candidate, ...measured, pages: layer.pages, hasText: layer.hasText };
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

async function verifyGuide(guide) {
  const actual = await withDownload(guide.url, describePdf);
  if (actual.bytes !== guide.bytes) throw new Error(`size changed (${guide.bytes} -> ${actual.bytes})`);
  if (actual.sha256 !== guide.sha256) throw new Error('sha256 changed');
}

async function verifyCatalogue() {
  const { guides } = readJson(GUIDES_FILE);
  let failures = 0;
  for (const guide of guides) {
    try {
      await verifyGuide(guide);
      console.log(`ok ${guide.id}`);
    } catch (err) {
      failures++;
      console.log(`FAILED ${guide.id}: ${err.message}`);
    }
  }
  console.log(`${guides.length - failures} ok, ${failures} failed`);
  return failures ? 1 : 0;
}

if (require.main === module) {
  const run = process.argv.includes('--verify') ? verifyCatalogue : addCandidates;
  run().then(code => process.exit(code), err => { console.error(err.message); process.exit(2); });
}

module.exports = { hasReleaseStatement, describePdf, releaseStatementProblem, shapeEntries, nextHop };
