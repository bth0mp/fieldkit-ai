import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import logger from '../../utils/logger';
import { ragService } from '../../services/rag';
import { libraryProjectIds } from '../library/libraryProjects';
import { isCatalogueId, parseSavedEntry, type GuideEntry } from './catalogue';
import { ownEntry } from './guideLibraryStore';

/** Where downloaded guides, their unfinished downloads and the last fetched catalogue live. */
export const GUIDE_LIBRARY_DIR = `${RNFS.DocumentDirectoryPath}/guide-library`;

const STORAGE_KEY = '@fieldkit/guide_library';

/** The id is the only thing that names a file: catalogue ids never hold a path separator or dot. */
export const guidePath = (id: string) => `${GUIDE_LIBRARY_DIR}/${id}.pdf`;

/** Save the catalogue entry each downloaded file was checked against, by id. */
export const saveRecords = (downloaded: Record<string, GuideEntry>) =>
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ downloaded }));

export async function removeQuietly(path: string): Promise<void> {
  try {
    if (await RNFS.exists(path)) await RNFS.unlink(path);
  } catch (error) {
    logger.warn('[GuideLibrary] could not delete', path, error);
  }
}

/** Delete every knowledge-base document for this guide. Returns false when that failed (and logs why). */
export async function deleteFromKnowledgeBase(id: string): Promise<boolean> {
  try {
    for (const projectId of libraryProjectIds()) {
      const docs = await ragService.getDocumentsByProject(projectId);
      for (const doc of docs.filter(d => d.path === guidePath(id))) await ragService.deleteDocument(doc.id);
    }
    return true;
  } catch (error) {
    logger.error('[GuideLibrary] could not delete from the knowledge base', id, error);
    return false;
  }
}

/**
 * The saved records as stored. Nothing saved yet is an empty record; anything that cannot be read or parsed
 * throws, because acting on a guess would delete the files of guides that may never be downloadable again.
 */
async function readRecords(): Promise<Record<string, unknown>> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw === null) return {};
  const saved = JSON.parse(raw)?.downloaded;
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('saved guide records are not an object');
  return saved;
}

/**
 * Line the saved records up with the files on disk at launch. Keeps each record that is structurally sound and whose
 * file is there; drops the rest (and, best effort, their knowledge-base documents, which would otherwise answer for
 * a guide the library no longer shows). Deletes .part files (unfinished downloads or catalogue fetches) and guide
 * files with no kept record (moved in by a run killed before it saved, or whose record was dropped). Throws, having
 * deleted and saved nothing, when the saved records cannot be read. Returns the kept records.
 *
 * Only safe before anything writes into the folder: the service runs it until it first succeeds, and downloads and
 * refreshes wait for that.
 */
export async function reconcileDisk(): Promise<Record<string, GuideEntry>> {
  const saved = await readRecords();
  const kept: Record<string, GuideEntry> = {};
  const dropped: string[] = [];
  for (const [id, raw] of Object.entries(saved)) {
    const entry = parseSavedEntry(raw);
    if (entry?.id === id && (await RNFS.exists(guidePath(id)))) kept[id] = entry; else dropped.push(id);
  }
  for (const file of await RNFS.readDir(GUIDE_LIBRARY_DIR)) {
    const unrecorded = file.name.endsWith('.pdf') && !ownEntry(kept, file.name.slice(0, -'.pdf'.length));
    if (file.isFile() && (file.name.endsWith('.part') || unrecorded)) await removeQuietly(file.path);
  }
  if (dropped.length) {
    await saveRecords(kept);
    // A key that is not a catalogue id never named a file, so it has no document to delete.
    for (const id of dropped.filter(isCatalogueId)) await deleteFromKnowledgeBase(id);
  }
  return kept;
}
