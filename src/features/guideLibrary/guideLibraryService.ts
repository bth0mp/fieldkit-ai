import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { viewDocument } from '@react-native-documents/viewer';
import logger from '../../utils/logger';
import { bundledCatalogue, CATALOGUE_URL, parseCatalogue, type Catalogue, type GuideEntry } from './catalogue';
import { useGuideLibraryStore, type GuideState } from './guideLibraryStore';

export const GUIDE_LIBRARY_DIR = `${RNFS.DocumentDirectoryPath}/guide-library`;

const STORAGE_KEY = '@fieldkit/guide_library';
const CATALOGUE_FILE = `${GUIDE_LIBRARY_DIR}/catalogue.json`;
const MISMATCH = "This file doesn't match the checked copy";
const FAILED = "Couldn't download this guide. Try again.";
const OFFLINE = "No connection. Try again when you're online.";
const OPEN_FAILED = "Couldn't open this guide.";
const REMOVE_FAILED = "Couldn't remove this guide. Try again.";

/** The id is the only thing that names a file: catalogue ids never hold a path separator or dot. */
const guidePath = (id: string) => `${GUIDE_LIBRARY_DIR}/${id}.pdf`;

/** The catalogue entry each downloaded file was checked against, by id. */
let downloaded: Record<string, GuideEntry> = {};
let initPromise: Promise<void> | null = null;

const store = useGuideLibraryStore;
const setGuide = (id: string, state: GuideState | null) =>
  store.setState(s => {
    const guides = { ...s.guides };
    if (state) guides[id] = state; else delete guides[id];
    return { guides };
  });
const phaseOf = (id: string) => store.getState().guides[id]?.phase ?? 'none';

const saveDownloaded = () => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ downloaded }));

async function removeQuietly(path: string): Promise<void> {
  try {
    if (await RNFS.exists(path)) await RNFS.unlink(path);
  } catch (error) {
    logger.warn('[GuideLibrary] could not delete', path, error);
  }
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

async function runInit(): Promise<void> {
  await RNFS.mkdir(GUIDE_LIBRARY_DIR);
  const catalogue = await loadSavedCatalogue();
  const saved = await loadDownloaded();
  // A .part file is an unfinished download (or catalogue fetch) from an earlier run.
  for (const file of await RNFS.readDir(GUIDE_LIBRARY_DIR)) {
    if (file.isFile() && file.name.endsWith('.part')) await removeQuietly(file.path);
  }
  const kept: Record<string, GuideEntry> = {};
  for (const [id, entry] of Object.entries(saved)) {
    if (entry?.id === id && (await RNFS.exists(guidePath(id)))) kept[id] = entry;
  }
  downloaded = kept;
  if (Object.keys(kept).length !== Object.keys(saved).length) await saveDownloaded();
  const guides: Record<string, GuideState> = {};
  for (const id of Object.keys(kept)) guides[id] = { phase: 'downloaded' };
  // Anything already in the store was started this session and is newer than what was saved.
  store.setState(s => ({ catalogue, guides: { ...guides, ...s.guides } }));
}

/** Load saved state, delete unfinished downloads and forget guides whose file is gone. Safe to call again. */
function init(): Promise<void> {
  if (!initPromise) {
    initPromise = runInit().catch(error => {
      logger.error('[GuideLibrary] init failed', error);
      initPromise = null;
    });
  }
  return initPromise;
}

/** Fetch the catalogue from the repo. Anything that fails to download or validate is ignored. */
async function refresh(): Promise<void> {
  if (store.getState().refreshing) return;
  store.setState({ refreshing: true });
  const part = `${CATALOGUE_FILE}.part`;
  try {
    await init();
    const { promise } = RNFS.downloadFile({ fromUrl: CATALOGUE_URL, toFile: part });
    const { statusCode } = await promise;
    if (statusCode !== 200) throw new Error(`catalogue fetch returned ${statusCode}`);
    const parsed = parseCatalogue(JSON.parse(await RNFS.readFile(part, 'utf8')));
    if (!parsed) throw new Error('fetched catalogue failed validation');
    await RNFS.moveFile(part, CATALOGUE_FILE);
    store.setState({ catalogue: parsed });
  } catch (error) {
    logger.warn('[GuideLibrary] catalogue refresh failed, keeping the current one', error);
    await removeQuietly(part);
  } finally {
    store.setState({ refreshing: false });
  }
}

/** Download to `<id>.pdf.part`. Returns the user-facing error, or null once the file matches `entry`. */
async function fetchChecked(entry: GuideEntry, part: string): Promise<string | null> {
  let jobId: number | undefined;
  let tooBig = false;
  const job = RNFS.downloadFile({
    fromUrl: entry.url,
    toFile: part,
    progressDivider: 5,
    progress: ({ bytesWritten, contentLength }) => {
      if (contentLength > entry.bytes || bytesWritten > entry.bytes) {
        tooBig = true;
        if (jobId !== undefined) RNFS.stopDownload(jobId);
        return;
      }
      setGuide(entry.id, { phase: 'downloading', progress: Math.min(1, bytesWritten / entry.bytes) });
    },
  });
  jobId = job.jobId;
  if (tooBig) RNFS.stopDownload(jobId);
  let statusCode: number;
  try {
    ({ statusCode } = await job.promise);
  } catch {
    return tooBig ? MISMATCH : OFFLINE;
  }
  if (statusCode !== 200) return FAILED;
  if (tooBig || (await RNFS.stat(part)).size !== entry.bytes) return MISMATCH;
  if ((await RNFS.hash(part, 'sha256')) !== entry.sha256) return MISMATCH;
  return null;
}

/** Download a listed guide and keep it only if its size and SHA-256 match the catalogue entry. */
async function download(id: string): Promise<void> {
  if (phaseOf(id) !== 'none') return;
  const entry = store.getState().catalogue.guides.find(g => g.id === id);
  if (!entry) return;
  setGuide(id, { phase: 'downloading', progress: 0 });
  const part = `${guidePath(id)}.part`;
  let error: string | null;
  try {
    // init deletes stale .part files, so it must finish before this download writes one.
    await init();
    await RNFS.mkdir(GUIDE_LIBRARY_DIR);
    error = await fetchChecked(entry, part);
    if (!error) {
      await RNFS.moveFile(part, guidePath(id));
      downloaded = { ...downloaded, [id]: entry };
      await saveDownloaded();
    }
  } catch (e) {
    logger.error('[GuideLibrary] download failed', id, e);
    error = FAILED;
    // The file may have been moved in before saving failed: without a saved record it must not stay.
    const rest = { ...downloaded };
    delete rest[id];
    downloaded = rest;
    await removeQuietly(guidePath(id));
  }
  if (error) {
    await removeQuietly(part);
    setGuide(id, { phase: 'none', error });
  } else {
    setGuide(id, { phase: 'downloaded' });
  }
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

/** Delete a downloaded guide's file and forget it. */
async function remove(id: string): Promise<void> {
  if (phaseOf(id) !== 'downloaded') return;
  try {
    await RNFS.unlink(guidePath(id));
  } catch (error) {
    // A file that is already gone is what removing wanted.
    if (await RNFS.exists(guidePath(id)).catch(() => true)) {
      logger.error('[GuideLibrary] remove failed', id, error);
      setGuide(id, { phase: 'downloaded', error: REMOVE_FAILED });
      return;
    }
  }
  const rest = { ...downloaded };
  delete rest[id];
  downloaded = rest;
  // If saving fails, the next init drops the entry anyway because its file is gone.
  await saveDownloaded().catch(error => logger.warn('[GuideLibrary] could not save state', error));
  setGuide(id, null);
}

/** Owns the guide library: the catalogue, each guide's file on disk and its state in the store. */
export const guideLibraryService = { init, refresh, download, open, remove };
