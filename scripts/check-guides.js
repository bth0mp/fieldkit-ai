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
const MAX_BYTES = 60 * 1024 * 1024;
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

async function downloadOnce(url, file) {
  await waitForHost(new URL(url).host);
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('over the 60 MB limit');
  const chunks = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > MAX_BYTES) throw new Error('over the 60 MB limit');
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

function pdfText(file, lastPage) {
  const args = lastPage ? ['-l', String(lastPage), file, '-'] : [file, '-'];
  return execFileSync('pdftotext', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

/** Page count (form feeds in the full text) and whether the first pages carry a real text layer. */
function readTextLayer(file) {
  const pages = pdfText(file).split('\f').length - 1;
  const head = pdfText(file, TEXT_PAGES);
  const hasText = head.replace(/\s/g, '').length >= MIN_TEXT_CHARS;
  return { pages, hasText, head };
}

function checkReleaseStatement(candidate, layer) {
  if (!/approved for public release/i.test(candidate.licenceNote)) return;
  if (!layer.hasText) {
    if (candidate.statementSeen === true) return;
    throw new Error('scanned, statement must be confirmed by eye');
  }
  if (!hasReleaseStatement(layer.head)) throw new Error('release statement not found in the document');
}

function validateCandidate(candidate, categoryIds) {
  const missing = REQUIRED_CANDIDATE_FIELDS.filter(f => candidate[f] === undefined || candidate[f] === '');
  if (missing.length) throw new Error(`missing ${missing.join(', ')}`);
  if (!ID_PATTERN.test(candidate.id)) throw new Error('bad id');
  if (!categoryIds.includes(candidate.category)) throw new Error(`unknown category ${candidate.category}`);
  if (!Number.isInteger(candidate.year)) throw new Error('year must be an integer');
  if (!candidate.url.startsWith('https://')) throw new Error('url must be https');
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
    checkReleaseStatement(candidate, layer);
    const entry = { ...candidate, ...measured, pages: layer.pages, hasText: layer.hasText };
    return Object.fromEntries(ENTRY_FIELDS.map(f => [f, entry[f]]));
  });
}

function sortGuides(guides, categoryIds) {
  return [...guides].sort((a, b) => categoryIds.indexOf(a.category) - categoryIds.indexOf(b.category) || a.title.localeCompare(b.title));
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
  const added = [];
  for (const candidate of pending) {
    try {
      if (known.has(candidate.id)) throw new Error('duplicate id in candidates');
      added.push(await checkCandidate(candidate, categoryIds));
      known.add(candidate.id);
      console.log(`added ${candidate.id}`);
    } catch (err) {
      console.log(`FAILED ${candidate.id}: ${err.message}`);
    }
  }
  if (added.length) {
    catalogue.guides = sortGuides([...catalogue.guides, ...added], categoryIds);
    catalogue.updated = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(GUIDES_FILE, `${serialise(catalogue)}\n`);
  }
  console.log(`${added.length} added, ${pending.length - added.length} failed`);
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

module.exports = { hasReleaseStatement, describePdf };
