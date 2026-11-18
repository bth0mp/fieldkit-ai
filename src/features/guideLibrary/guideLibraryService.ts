import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { viewDocument } from '@react-native-documents/viewer';
import logger from '../../utils/logger';
import { ragService } from '../../services/rag';
import { ensureFieldGuidesProject, FIELD_GUIDES_PROJECT_ID } from '../fieldGuides/fieldGuides';
import { bundledCatalogue, CATALOGUE_URL, isCatalogueId, parseCatalogue, type Catalogue, type GuideEntry } from './catalogue';
import { useGuideLibraryStore, type GuidePhase, type GuideState } from './guideLibraryStore';

export const GUIDE_LIBRARY_DIR = `${RNFS.DocumentDirectoryPath}/guide-library`;

const STORAGE_KEY = '@fieldkit/guide_library';
const CATALOGUE_FILE = `${GUIDE_LIBRARY_DIR}/catalogue.json`;
const CATALOGUE_PART = 'catalogue.json.part';
/** A fetched catalogue is untrusted and read whole into memory, so anything larger is refused. */
const MAX_CATALOGUE_BYTES = 2 * 1024 * 1024;
const MISMATCH = "This file doesn't match the checked copy";
const FAILED = "Couldn't download this guide. Try again.";
const OFFLINE = "No connection. Try again when you're online.";
const OPEN_FAILED = "Couldn't open this guide.";
const REMOVE_FAILED = "Couldn't remove this guide. Try again.";
const TEACH_FAILED = "Couldn't teach this guide to the assistant. Try again.";
const UNTEACH_FAILED = "Couldn't take this guide out of the assistant's knowledge. Try again.";
const NAME_CLASH = 'A document with this name is already in Field guides. Remove it there first.';
/** What ragService.indexDocument says, for the user, when a file has no text it can index. Shown as is. */
const EXPLAINED_RAG_ERRORS = new Set([
  'This looks like a scanned PDF with no text layer, so there was no text to extract (OCR is not available).',
  'Document produced no indexable content',
]);

/** Taught guides at which the screen warns that answers get slower. Tune after measuring on the phone. */
export const SLOW_SEARCH_TAUGHT_GUIDES = 10;

/** The id is the only thing that names a file: catalogue ids never hold a path separator or dot. */
const guidePath = (id: string) => `${GUIDE_LIBRARY_DIR}/${id}.pdf`;
/** The knowledge-base name of a taught guide, which answers cite. */
const documentName = (entry: GuideEntry) => `${entry.title} (${entry.publisher}).pdf`;

/** The catalogue entry each downloaded file was checked against, by id. */
let downloaded: Record<string, GuideEntry> = {};
let initPromise: Promise<boolean> | null = null;
/** Guides are taught one at a time: each teach waits for the one before it. */
let teachQueue: Promise<void> = Promise.resolve();
/** Names of .part files being written right now. init's sweep leaves these alone. */
const inFlightParts = new Set<string>();

const store = useGuideLibraryStore;
const withGuide = (guides: Record<string, GuideState>, id: string, state: GuideState | null) => {
  const next = { ...guides };
  if (state) next[id] = state; else delete next[id];
  return next;
};
const setGuide = (id: string, state: GuideState | null) => store.setState(s => ({ guides: withGuide(s.guides, id, state) }));
const phaseOf = (id: string): GuidePhase => store.getState().guides[id]?.phase ?? 'none';

/** Downloaded guides `catalogue` does not list, by title. Their saved entries keep them usable. */
function delistedFrom(catalogue: Catalogue): GuideEntry[] {
  const listed = new Set(catalogue.guides.map(g => g.id));
  return Object.values(downloaded).filter(e => !listed.has(e.id)).sort((a, b) => a.title.localeCompare(b.title));
}
/** Set one guide's state after `downloaded` changed, and in the same update which guides are no longer listed. */
const setGuideAndDelisted = (id: string, state: GuideState | null) =>
  store.setState(s => ({ guides: withGuide(s.guides, id, state), delisted: delistedFrom(s.catalogue) }));
const isListed = (id: string) => store.getState().catalogue.guides.some(g => g.id === id);

const saveDownloaded = () => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ downloaded }));
const forget = (id: string) => {
  const rest = { ...downloaded };
  delete rest[id];
  downloaded = rest;
};

async function removeQuietly(path: string): Promise<void> {
  try {
    if (await RNFS.exists(path)) await RNFS.unlink(path);
  } catch (error) {
    logger.warn('[GuideLibrary] could not delete', path, error);
  }
}

/** moveFile fails on iOS when the destination exists, so clear it first. */
async function replaceFile(from: string, to: string): Promise<void> {
  if (await RNFS.exists(to)) await RNFS.unlink(to);
  await RNFS.moveFile(from, to);
}

async function loadSavedCatalogue(): Promise<Catalogue> {
  try {
    if (await RNFS.exists(CATALOGUE_FILE)) {
      const parsed = parseCatalogue(JSON.parse(await RNFS.readFile(CATALOGUE_FILE, 'utf8')));
      if (parsed) return parsed;
    }
  } catch (error) {
    logger.warn('[GuideLibrary] saved catalogue unreadable, using the bundled one', error);
  }
  return bundledCatalogue;
}

async function loadDownloaded(): Promise<Record<string, GuideEntry>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw)?.downloaded : null;
    return saved && typeof saved === 'object' ? saved : {};
  } catch (error) {
    logger.warn('[GuideLibrary] saved state unreadable', error);
    return {};
  }
}

async function runInit(): Promise<boolean> {
  await RNFS.mkdir(GUIDE_LIBRARY_DIR);
  const catalogue = await loadSavedCatalogue();
  const saved = await loadDownloaded();
  // A .part file is an unfinished download (or catalogue fetch) from an earlier run.
  for (const file of await RNFS.readDir(GUIDE_LIBRARY_DIR)) {
    if (file.isFile() && file.name.endsWith('.part') && !inFlightParts.has(file.name)) await removeQuietly(file.path);
  }
  const kept: Record<string, GuideEntry> = {};
  for (const [id, entry] of Object.entries(saved)) {
    // The id names a file, so a saved record must pass the same id check as the catalogue.
    if (isCatalogueId(id) && entry?.id === id && (await RNFS.exists(guidePath(id)))) kept[id] = entry;
  }
  downloaded = kept;
  if (Object.keys(kept).length !== Object.keys(saved).length) await saveDownloaded();
  store.setState(s => {
    const guides: Record<string, GuideState> = {};
    for (const id of Object.keys(kept)) guides[id] = { phase: 'downloaded' };
    // A download running now, or a failure for a guide with no file, is newer than the disk. Anything else in
    // the store (such as a download that failed only because an earlier init did) gives way to the disk.
    for (const [id, g] of Object.entries(s.guides)) {
      if (g.phase === 'downloading' || (g.phase === 'none' && !kept[id])) guides[id] = g;
    }
    return { catalogue, guides, delisted: delistedFrom(catalogue) };
  });
  await applyKnowledgeBase();
  return true;
}

/** Paths of the documents in the Field guides knowledge base. */
async function taughtPaths(): Promise<Set<string>> {
  return new Set((await ragService.getDocumentsByProject(FIELD_GUIDES_PROJECT_ID)).map(d => d.path));
}

/** Mark each downloaded guide taught or not by whether the knowledge base holds a document with its path. */
async function applyKnowledgeBase(): Promise<void> {
  // A teach, un-teach or remove that ends while the knowledge base is read is newer than what was read.
  const before = store.getState().guides;
  let paths: Set<string>;
  try {
    paths = await taughtPaths();
  } catch (error) {
    logger.warn('[GuideLibrary] knowledge base unreadable, keeping what is shown', error);
    return;
  }
  for (const id of Object.keys(downloaded)) {
    const now = store.getState().guides[id];
    if (now !== before[id]) continue;
    // A guide waiting to be taught (or still downloading) is settled by that work, not here.
    if (now?.phase !== 'downloaded' && now?.phase !== 'taught') continue;
    const phase: GuidePhase = paths.has(guidePath(id)) ? 'taught' : 'downloaded';
    if (phase !== now.phase) setGuide(id, { phase });
  }
}

/**
 * Load saved state, delete unfinished downloads and forget guides whose file is gone. Resolves false when
 * that failed; nothing that writes files or saved state may run then. A failed init runs again next call.
 */
function init(): Promise<boolean> {
  if (!initPromise) {
    initPromise = runInit().catch(error => {
      logger.error('[GuideLibrary] init failed', error);
      initPromise = null;
      return false;
    });
  }
  return initPromise;
}

/** Re-read which guides are taught: the user may have deleted a document or the project elsewhere. No network. */
async function reconcile(): Promise<void> {
  if (await init()) await applyKnowledgeBase();
}

type GuardedResult = { statusCode: number } | 'too-big' | 'failed';
interface GuardedDownload { fromUrl: string; toFile: string; maxBytes: number; onProgress?: (bytesWritten: number) => void }

/**
 * Download `fromUrl` to `toFile`, stopping as soon as the server declares (begin) or sends (progress) more
 * than `maxBytes`. Callbacks that arrive after the job settled are ignored.
 */
async function guardedDownload({ fromUrl, toFile, maxBytes, onProgress }: GuardedDownload): Promise<GuardedResult> {
  let jobId: number | undefined;
  let tooBig = false;
  let settled = false;
  const stop = () => {
    tooBig = true;
    if (jobId !== undefined) RNFS.stopDownload(jobId);
  };
  const job = RNFS.downloadFile({
    fromUrl,
    toFile,
    progressDivider: 5,
    begin: ({ contentLength }) => { if (!settled && !tooBig && contentLength > maxBytes) stop(); },
    progress: ({ bytesWritten, contentLength }) => {
      if (settled || tooBig) return;
      if (contentLength > maxBytes || bytesWritten > maxBytes) stop();
      else onProgress?.(bytesWritten);
    },
  });
  jobId = job.jobId;
  // A callback that ran before the job id was known could not stop the job itself.
  if (tooBig) RNFS.stopDownload(jobId);
  try {
    const { statusCode } = await job.promise;
    return tooBig ? 'too-big' : { statusCode };
  } catch {
    return tooBig ? 'too-big' : 'failed';
  } finally {
    settled = true;
  }
}

/** Fetch the catalogue from the repo. Anything that fails to download or validate is ignored. */
async function refresh(): Promise<void> {
  if (store.getState().refreshing) return;
  store.setState({ refreshing: true });
  const part = `${GUIDE_LIBRARY_DIR}/${CATALOGUE_PART}`;
  try {
    if (!(await init())) return;
    inFlightParts.add(CATALOGUE_PART);
    const result = await guardedDownload({ fromUrl: CATALOGUE_URL, toFile: part, maxBytes: MAX_CATALOGUE_BYTES });
    if (typeof result === 'string') throw new Error(`catalogue fetch ${result}`);
    if (result.statusCode !== 200) throw new Error(`catalogue fetch returned ${result.statusCode}`);
    if ((await RNFS.stat(part)).size > MAX_CATALOGUE_BYTES) throw new Error('catalogue too big');
    const parsed = parseCatalogue(JSON.parse(await RNFS.readFile(part, 'utf8')));
    if (!parsed) throw new Error('fetched catalogue failed validation');
    await replaceFile(part, CATALOGUE_FILE);
    store.setState({ catalogue: parsed, delisted: delistedFrom(parsed) });
  } catch (error) {
    logger.warn('[GuideLibrary] catalogue refresh failed, keeping the current one', error);
  } finally {
    await removeQuietly(part);
    inFlightParts.delete(CATALOGUE_PART);
    store.setState({ refreshing: false });
  }
}

/** Download to `<id>.pdf.part`. Returns the user-facing error, or null once the file matches `entry`. */
async function fetchChecked(entry: GuideEntry, part: string): Promise<string | null> {
  const result = await guardedDownload({
    fromUrl: entry.url, toFile: part, maxBytes: entry.bytes,
    onProgress: bytesWritten => setGuide(entry.id, { phase: 'downloading', progress: Math.min(1, bytesWritten / entry.bytes) }),
  });
  if (result === 'too-big') return MISMATCH;
  if (result === 'failed') return OFFLINE;
  if (result.statusCode !== 200) return FAILED;
  if ((await RNFS.stat(part)).size !== entry.bytes) return MISMATCH;
  if ((await RNFS.hash(part, 'sha256')) !== entry.sha256) return MISMATCH;
  return null;
}

/** Download a listed guide and keep it only if its size and SHA-256 match the catalogue entry. */
async function download(id: string): Promise<void> {
  if (phaseOf(id) !== 'none') return;
  const entry = store.getState().catalogue.guides.find(g => g.id === id);
  if (!entry) return;
  setGuide(id, { phase: 'downloading', progress: 0 });
  const partName = `${id}.pdf.part`;
  const part = `${GUIDE_LIBRARY_DIR}/${partName}`;
  let error: string | null = FAILED;
  // Without a finished init the saved records are not loaded, and saving now would overwrite them.
  if (await init()) {
    inFlightParts.add(partName);
    try {
      error = await fetchChecked(entry, part);
      if (!error) {
        await replaceFile(part, guidePath(id));
        downloaded = { ...downloaded, [id]: entry };
        await saveDownloaded();
      }
    } catch (e) {
      logger.error('[GuideLibrary] download failed', id, e);
      error = FAILED;
      // The file may have been moved in before saving failed: without a saved record it must not stay.
      forget(id);
      await removeQuietly(guidePath(id));
    } finally {
      if (error) await removeQuietly(part);
      inFlightParts.delete(partName);
    }
  }
  // A refresh while downloading may have dropped the guide from the catalogue.
  setGuideAndDelisted(id, error ? { phase: 'none', error } : { phase: 'downloaded' });
}

/** Open a downloaded guide in the phone's PDF viewer. */
async function open(id: string): Promise<void> {
  const phase = phaseOf(id);
  if (phase === 'none' || phase === 'downloading') return;
  let error: string | undefined;
  try {
    await viewDocument({ uri: `file://${guidePath(id)}`, mimeType: 'application/pdf', grantPermissions: 'read' });
  } catch (e) {
    logger.warn('[GuideLibrary] could not open', id, e);
    error = OPEN_FAILED;
  }
  // The guide may have been removed while the viewer was open.
  const now = store.getState().guides[id];
  if (now && now.phase !== 'none' && now.error !== error) setGuide(id, { phase: now.phase, error });
}

async function teachNow(id: string, entry: GuideEntry): Promise<void> {
  // The guide may have been removed while it waited its turn.
  if (phaseOf(id) !== 'teaching') return;
  try {
    await ensureFieldGuidesProject();
    await ragService.indexDocument({
      projectId: FIELD_GUIDES_PROJECT_ID, filePath: guidePath(id), fileName: documentName(entry), fileSize: entry.bytes, bundled: true,
    });
    setGuide(id, { phase: 'taught' });
  } catch (e) {
    logger.warn('[GuideLibrary] teach failed', id, e);
    const error = await teachFailure(id, e);
    setGuide(id, error ? { phase: 'downloaded', error } : { phase: 'taught' });
  }
}

/**
 * The words for the user when indexing a guide threw, or null when the guide is in fact taught. Only messages
 * written for the user reach the row; anything else is the fixed failure text (the raw error is logged).
 */
async function teachFailure(id: string, e: unknown): Promise<string | null> {
  const message = e instanceof Error ? e.message : '';
  if (EXPLAINED_RAG_ERRORS.has(message)) return message;
  if (!message.endsWith('is already in the knowledge base')) return TEACH_FAILED;
  // indexDocument refuses a clash on path or on name: only this guide's own path means it is taught.
  try {
    return (await taughtPaths()).has(guidePath(id)) ? null : NAME_CLASH;
  } catch (error) {
    logger.warn('[GuideLibrary] knowledge base unreadable after a teach', id, error);
    return TEACH_FAILED;
  }
}

/**
 * Index a downloaded guide into the Field guides knowledge base, after any guide already being taught. A guide
 * the catalogue no longer lists is not taught anew (one already taught stays taught until switched off).
 */
function teach(id: string): Promise<void> {
  const entry = downloaded[id];
  if (phaseOf(id) !== 'downloaded' || !entry?.hasText || !isListed(id)) return Promise.resolve();
  setGuide(id, { phase: 'teaching' });
  // teachNow never rejects, so one failure cannot stop the guides queued after it.
  teachQueue = teachQueue.then(() => teachNow(id, entry));
  return teachQueue;
}

/** Delete every knowledge-base document for this guide. Returns false when that failed. */
async function deleteFromKnowledgeBase(id: string): Promise<boolean> {
  try {
    const docs = await ragService.getDocumentsByProject(FIELD_GUIDES_PROJECT_ID);
    for (const doc of docs.filter(d => d.path === guidePath(id))) await ragService.deleteDocument(doc.id);
    return true;
  } catch (error) {
    logger.error('[GuideLibrary] could not delete from the knowledge base', id, error);
    return false;
  }
}

/** Take a taught guide out of the knowledge base. The file stays. */
async function unteach(id: string): Promise<void> {
  if (phaseOf(id) !== 'taught') return;
  const ok = await deleteFromKnowledgeBase(id);
  // A remove may have run meanwhile: a guide whose file is gone must not come back as downloaded.
  if (phaseOf(id) !== 'taught' || !downloaded[id]) return;
  setGuide(id, ok ? { phase: 'downloaded' } : { phase: 'taught', error: UNTEACH_FAILED });
}

/** Delete a downloaded guide's file and forget it. A taught guide leaves the knowledge base first. */
async function remove(id: string): Promise<void> {
  const phase = phaseOf(id);
  if (phase !== 'downloaded' && phase !== 'taught') return;
  if (phase === 'taught' && !(await deleteFromKnowledgeBase(id))) {
    setGuide(id, { phase: 'taught', error: REMOVE_FAILED });
    return;
  }
  try {
    await RNFS.unlink(guidePath(id));
  } catch (error) {
    // A file that is already gone is what removing wanted.
    if (await RNFS.exists(guidePath(id)).catch(() => true)) {
      logger.error('[GuideLibrary] remove failed', id, error);
      // It is out of the knowledge base by now, so it shows as downloaded.
      setGuide(id, { phase: 'downloaded', error: REMOVE_FAILED });
      return;
    }
  }
  forget(id);
  // If saving fails, the next init drops the entry anyway because its file is gone.
  await saveDownloaded().catch(error => logger.warn('[GuideLibrary] could not save state', error));
  setGuideAndDelisted(id, null);
}

/** Owns the guide library: the catalogue, each guide's file on disk and its state in the store. */
export const guideLibraryService = { init, reconcile, refresh, download, open, remove, teach, unteach };
