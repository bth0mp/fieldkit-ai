/**
 * Kiwix files the user granted (a folder or single files): adds them, sorts each into its library category
 * project, and looks things up in a project's files for the chat. Owns every reader; kiwixStore is the screen's
 * read-only copy. Files are read by byte range through react-native-fs (content:// uris), never whole.
 */
import { NativeModules } from 'react-native';
import RNFS from 'react-native-fs';
import { errorCodes, isErrorWithCode, pick, pickDirectory, releaseLongTermAccess, types } from '@react-native-documents/picker';
import { ensureCategoryProject, isLibraryProject, libraryProjectId, libraryProjectIds, projectStoreHydrated } from '../../features/library/libraryProjects';
import { useProjectStore } from '../../stores/projectStore';
import { generateId } from '../../utils/generateId';
import logger from '../../utils/logger';
import { categoryFor } from './kiwixCategory';
import { type KiwixFile, useKiwixStore } from './kiwixStore';
import { openZim, type ZimArchive, ZimError } from './zimReader';

interface TreeDocument { uri: string; name: string; size: number }
interface DocumentTreeModule { listFiles(treeUri: string): Promise<TreeDocument[]> }

export interface KiwixHit {
  file: KiwixFile;
  article: { title: string; text: string } | null;
  otherTitles: string[];
  error?: string;
}

const UNREADABLE = new ZimError('unreadable').message;
const FOLDER_GONE = "This folder can't be opened any more. Add it again.";
// ponytail: the 8 most recently used readers stay open (each keeps one decompressed cluster of about 2 MB).
const MAX_OPEN_READERS = 8;
/** Kiwix files named in a project chat's system prompt; the rest are counted. */
const PROMPT_FILES = 20;

const tree = (): DocumentTreeModule | undefined => NativeModules.FieldkitDocumentTree;
const store = useKiwixStore;
const readers = new Map<string, Promise<ZimArchive>>();
// ponytail: least recently searched files go first, so a search cut short by time reaches every file over a few
// searches; in memory only, a restart starts over.
const lastSearched = new Map<string, number>();
let searches = 0;

function hydrated(): Promise<void> {
  if (store.persist.hasHydrated()) return Promise.resolve();
  return new Promise(resolve => { const off = store.persist.onFinishHydration(() => { off(); resolve(); }); });
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const openUri = (uri: string) => openZim(async (offset, length) => base64ToBytes(await RNFS.read(uri, length, offset, 'base64')));

function readerFor(file: KiwixFile): Promise<ZimArchive> {
  let reader = readers.get(file.id);
  if (reader) readers.delete(file.id);
  else reader = openUri(file.uri);
  readers.set(file.id, reader);
  if (readers.size > MAX_OPEN_READERS) readers.delete(readers.keys().next().value!);
  return reader;
}

/** File metadata is shown on screen and named in the system prompt: one line, no control characters, cut short. */
const oneLine = (text: string, max: number) =>
  [...text.replace(/\s+/g, ' ')].filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127).join('').trim().slice(0, max);

/** How well a file's best title answers the query: the whole query (3), a phrase in it (2), a prefix (1). */
function rank(title: string | undefined, query: string): number {
  if (!title) return 0;
  const t = title.toLowerCase();
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (t === q) return 3;
  return ` ${q} `.includes(` ${t} `) ? 2 : 1;
}

const errorOf = (e: unknown) => (e instanceof ZimError ? e.message : UNREADABLE);

const isCancel = (e: unknown) => isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED;
const isKnown = (uri: string) => Object.values(store.getState().files).some(f => f.uri === uri);
const nameOf = (uri: string) => decodeURIComponent(uri.slice(uri.lastIndexOf('/') + 1)).replace(/^.*[:/]/, '');

function refuse(fileName: string, reason: string) {
  store.setState(s => ({ refused: [...s.refused.filter(r => r.fileName !== fileName), { fileName, reason }] }));
}

/** Adds each document in turn, saving it at once, so a long add cut short keeps every file already added. */
async function addDocuments(docs: TreeDocument[]): Promise<void> {
  if (docs.length === 0) return;
  store.setState({ adding: { done: 0, total: docs.length } });
  try {
    for (const [done, doc] of docs.entries()) {
      store.setState({ adding: { done, total: docs.length } });
      if (isKnown(doc.uri)) continue;
      try {
        const zim = await openUri(doc.uri);
        const category = categoryFor(zim.metadata);
        await ensureCategoryProject(category);
        const file: KiwixFile = {
          id: generateId(), uri: doc.uri, fileName: oneLine(doc.name, 120), title: oneLine(zim.metadata.title, 80) || oneLine(doc.name, 80),
          description: oneLine(zim.metadata.description, 200), bytes: doc.size, category,
        };
        store.setState(s => ({
          files: { ...s.files, [file.id]: file },
          refused: s.refused.filter(r => r.fileName !== doc.name),
          removed: s.removed.filter(uri => uri !== doc.uri),
        }));
      } catch (e) {
        refuse(doc.name, errorOf(e));
      }
    }
  } finally {
    store.setState({ adding: null });
  }
}

// One add or check at a time, claimed before the first await: a second tap while one is picking or listing
// waits for it instead of adding the same files again.
let running: Promise<void> | null = null;
function oneAtATime(work: () => Promise<void>): Promise<void> {
  running ??= work().finally(() => { running = null; });
  return running;
}

async function checkFolders(): Promise<void> {
  await hydrated();
  const module = tree();
  if (!module) return;
  const { folders, removed } = store.getState();
  const found: TreeDocument[] = [];
  for (const folder of folders) {
    try {
      found.push(...await module.listFiles(folder));
    } catch {
      refuse(nameOf(folder), FOLDER_GONE);
    }
  }
  await addDocuments(found.filter(d => d.name.toLowerCase().endsWith('.zim') && !isKnown(d.uri) && !removed.includes(d.uri)));
}

async function dropFile(id: string): Promise<void> {
  const file = store.getState().files[id];
  if (!file) return;
  readers.delete(id);
  store.setState(s => {
    const { [id]: _gone, ...files } = s.files;
    return { files, removed: [...s.removed.filter(uri => uri !== file.uri), file.uri] };
  });
  // A file from a granted folder has no grant of its own; releasing it is a no-op there.
  await releaseLongTermAccess([file.uri]).catch(e => logger.warn('[Kiwix] release failed', e));
}

export const kiwixService = {
  canAddFolder: (): boolean => !!tree(),

  addFolder: (): Promise<void> => oneAtATime(async () => {
    await hydrated();
    let uri: string;
    try {
      ({ uri } = await pickDirectory({ requestLongTermAccess: true }));
    } catch (e) {
      if (isCancel(e)) return;
      throw e;
    }
    if (!store.getState().folders.includes(uri)) store.setState(s => ({ folders: [...s.folders, uri] }));
    await checkFolders();
  }),

  checkForNewFiles: (): Promise<void> => oneAtATime(checkFolders),

  addFiles: (): Promise<void> => oneAtATime(async () => {
    await hydrated();
    let picked;
    try {
      picked = await pick({ mode: 'open', requestLongTermAccess: true, allowMultiSelection: true, type: [types.allFiles] });
    } catch (e) {
      if (isCancel(e)) return;
      throw e;
    }
    await addDocuments(picked.map(p => ({ uri: p.uri, name: p.name ?? nameOf(p.uri), size: p.size ?? 0 })));
  }),

  async move(id: string, categoryId: string): Promise<void> {
    if (!store.getState().files[id]) return;
    await ensureCategoryProject(categoryId);
    store.setState(s => ({ files: { ...s.files, [id]: { ...s.files[id], category: categoryId } } }));
  },

  remove: (id: string): Promise<void> => dropFile(id),

  filesInProject: (projectId: string): KiwixFile[] =>
    Object.values(store.getState().files)
      .filter(f => libraryProjectId(f.category) === projectId)
      .sort((a, b) => a.title.localeCompare(b.title)),

  /** The system prompt's lines naming the project's Kiwix files (at most 20), or '' when it has none. */
  promptListing(projectId: string): string {
    const titles = kiwixService.filesInProject(projectId).map(f => f.title);
    if (titles.length === 0) return '';
    const more = titles.length > PROMPT_FILES ? ` and ${titles.length - PROMPT_FILES} more` : '';
    return `Kiwix files: ${titles.slice(0, PROMPT_FILES).join(', ')}${more}.\nUse the search_knowledge_base tool to look up articles in them.`;
  },

  /**
   * The project's files that have matching titles, best match first, with the best article of each. The best one
   * gets most of budgetChars and the others share the rest. At least one file is searched; files left when
   * timeBudgetMs runs out are notSearched, and go first next time. A file that can't be read is a hit with an
   * error, not a failure.
   */
  async search(projectId: string, query: string, opts: { budgetChars: number; timeBudgetMs: number }): Promise<{ hits: KiwixHit[]; notSearched: KiwixFile[] }> {
    await hydrated();
    const started = Date.now();
    const outOfTime = () => Date.now() - started >= opts.timeBudgetMs;
    const files = kiwixService.filesInProject(projectId)
      .sort((a, b) => (lastSearched.get(a.id) ?? 0) - (lastSearched.get(b.id) ?? 0));
    const found: Array<{ hit: KiwixHit; zim?: ZimArchive; titles: string[] }> = [];
    // ponytail: files are searched one after another inside a time budget; batched native reads if the phone is slow.
    for (const file of files) {
      lastSearched.set(file.id, ++searches);
      try {
        const zim = await readerFor(file);
        found.push({ hit: { file, article: null, otherTitles: [] }, zim, titles: await zim.findTitles(query) });
      } catch (e) {
        readers.delete(file.id);
        found.push({ hit: { file, article: null, otherTitles: [], error: errorOf(e) }, titles: [] });
      }
      if (outOfTime()) break;
    }
    found.sort((a, b) => rank(b.titles[0], query) - rank(a.titles[0], query));
    const readable = found.filter(f => f.zim && f.titles.length > 0);
    let budget = opts.budgetChars;
    for (const [i, { hit, zim, titles }] of readable.entries()) {
      hit.otherTitles = titles;
      const share = Math.floor(i === 0 && readable.length > 1 ? budget * 0.6 : budget / (readable.length - i));
      if (share <= 0 || (i > 0 && outOfTime())) continue;
      try {
        hit.article = await zim!.readArticle(titles[0], share);
      } catch (e) {
        readers.delete(hit.file.id);
        hit.error = errorOf(e);
      }
      if (hit.article) {
        budget -= hit.article.text.length;
        hit.otherTitles = titles.filter(t => t !== hit.article!.title);
      }
    }
    return { hits: found.map(f => f.hit), notSearched: files.slice(found.length) };
  },

  /** Drops files whose category project the user deleted; adding one again brings its project back. */
  async reconcile(): Promise<void> {
    await hydrated();
    await projectStoreHydrated();
    const projects = new Set(libraryProjectIds());
    for (const file of Object.values(store.getState().files)) {
      if (!projects.has(libraryProjectId(file.category))) await dropFile(file.id);
    }
  },
};

// A category project deleted anywhere (the Projects screen, its settings) takes its Kiwix files with it at once,
// before adding a file in that category brings the project back with the old files still in it.
useProjectStore.subscribe((state, prev) => {
  const ids = new Set(state.projects.map(p => p.id));
  if (prev.projects.some(p => isLibraryProject(p.id) && !ids.has(p.id))) {
    kiwixService.reconcile().catch(e => logger.warn('[Kiwix] reconcile failed', e));
  }
});
