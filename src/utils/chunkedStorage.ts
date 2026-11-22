import AsyncStorage from '@react-native-async-storage/async-storage';
import { ANDROID_DATABASE_PATH, open } from '@op-engineering/op-sqlite';
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import type { StateStorage } from 'zustand/middleware';

/** The AsyncStorage calls a chunked value needs; the multi-key calls run as one transaction on Android. */
export interface ChunkStore {
  getItem(key: string): Promise<string | null>;
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  multiSet(pairs: [string, string][]): Promise<void>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

/** Reads a saved value that is too large for the store's own read (see `readOversizedRow`). */
export type OversizedReader = (key: string) => Promise<string | null>;

const MANIFEST = 'fieldkit-chunked:v1:';
// Android reads each AsyncStorage row through a ~2 MB cursor window. SQLite stores text as UTF-8, at
// most 3 bytes per UTF-16 unit, so 256K units stay under 1 MB.
const CHUNK_UNITS = 256 * 1024;

const chunkKey = (name: string, index: number): string => `${name}::chunk:${index}`;

function split(value: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(start + CHUNK_UNITS, value.length);
    // Never part a surrogate pair: a lone half does not survive the trip through native storage.
    const last = value.charCodeAt(end - 1);
    if (end < value.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks;
}

/**
 * Persist one large value as several rows, so a phone can read back what it saved.
 *
 * The chat store is one JSON value. On Android a row over the cursor window is written but can never be
 * read again, so a long history vanished at launch. The
 * value's own key holds a manifest; the parts sit beside it. A value saved by an older build is read as
 * before, and `readOversized` recovers one that already outgrew the window.
 */
export function createChunkedStorage(
  base: ChunkStore = AsyncStorage,
  readOversized?: OversizedReader,
): StateStorage {
  // The most part rows that may exist per key, so a shorter value blanks the ones it no longer uses.
  const partCounts = new Map<string, number>();

  return {
    getItem: async name => {
      let head: string | null;
      try {
        head = await base.getItem(name);
      } catch (error) {
        if (!readOversized) throw error;
        head = await readOversized(name);
        if (head === null) throw error;
      }
      if (head === null || !head.startsWith(MANIFEST)) {
        partCounts.set(name, 0);
        return head;
      }
      const count = Number(head.slice(MANIFEST.length));
      if (!Number.isInteger(count) || count < 0) {
        throw new Error(`${name}: the saved manifest is unreadable`);
      }
      const pairs = await base.multiGet(
        Array.from({ length: count }, (_, index) => chunkKey(name, index)),
      );
      const parts = pairs.map(([, value]) => value);
      if (parts.some(part => part === null)) {
        throw new Error(`${name}: part of the saved value is missing`);
      }
      partCounts.set(name, Math.max(partCounts.get(name) ?? 0, count));
      return parts.join('');
    },
    setItem: async (name, value) => {
      const parts = split(value);
      const previous = partCounts.get(name) ?? 0;
      // Never lowered by a write: if this one fails, the old rows are all still there and a later
      // write must still blank the ones it does not use.
      partCounts.set(name, Math.max(previous, parts.length));
      const stale = Array.from(
        { length: Math.max(0, previous - parts.length) },
        (_, index): [string, string] => [chunkKey(name, parts.length + index), ''],
      );
      // Parts, emptied stale parts and manifest are one multiSet, so one transaction: a failed write
      // leaves the old manifest with all of its parts, and overlapping writes keep their native order.
      await base.multiSet([
        ...parts.map((part, index): [string, string] => [chunkKey(name, index), part]),
        ...stale,
        [name, `${MANIFEST}${parts.length}`],
      ]);
    },
    removeItem: async name => {
      const count = partCounts.get(name) ?? 0;
      partCounts.set(name, 0);
      await base.multiRemove([
        name,
        ...Array.from({ length: count }, (_, index) => chunkKey(name, index)),
      ]);
    },
  };
}

// AsyncStorage's Android database, in the app's databases folder (op-sqlite reports that folder, with a
// trailing slash, as ANDROID_DATABASE_PATH).
const ASYNC_STORAGE_DB = 'RKStorage';
const ASYNC_STORAGE_TABLE = 'catalystLocalStorage';

let copies = 0;

/** Delete a file if it is there; a copy that is already gone is not an error. */
async function removeQuietly(path: string): Promise<void> {
  try {
    await RNFS.unlink(path);
  } catch {
    // Nothing to delete.
  }
}

/**
 * Read an Android AsyncStorage row that outgrew the cursor window, in pieces through op-sqlite.
 *
 * op-sqlite carries its own SQLite, and two SQLite copies in one process do not see each other's file
 * locks: opening AsyncStorage's live database could roll back a write the other copy is committing. So the
 * database file is copied to the cache folder first (never its journal) and the copy is read, then deleted.
 * A copy taken in the middle of a write fails `quick_check`; that throws, and Try again copies afresh.
 *
 * Runs once per affected store: the next write replaces the row with a chunked value.
 */
export const readOversizedRow: OversizedReader = async key => {
  if (Platform.OS !== 'android') return null;
  copies += 1;
  const copyName = `chats-copy-${Date.now()}-${copies}.db`;
  const copyPath = `${RNFS.CachesDirectoryPath}/${copyName}`;
  try {
    await RNFS.copyFile(`${ANDROID_DATABASE_PATH}${ASYNC_STORAGE_DB}`, copyPath);
    const db = open({ name: copyName, location: RNFS.CachesDirectoryPath });
    try {
      const check = await db.execute('PRAGMA quick_check');
      const verdict = Object.values(check.rows[0] ?? {})[0];
      if (verdict !== 'ok') throw new Error('the copy of the saved chats database is damaged');
      const { rows } = await db.execute(
        `SELECT length(value) AS units FROM ${ASYNC_STORAGE_TABLE} WHERE key = ?`,
        [key],
      );
      const units = rows[0]?.units;
      if (typeof units !== 'number') return null;
      const parts: string[] = [];
      // SQLite counts characters from 1 in both length() and substr().
      for (let start = 1; start <= units; start += CHUNK_UNITS) {
        const piece = await db.execute(
          `SELECT substr(value, ?, ?) AS part FROM ${ASYNC_STORAGE_TABLE} WHERE key = ?`,
          [start, CHUNK_UNITS, key],
        );
        parts.push(String(piece.rows[0]?.part ?? ''));
      }
      return parts.join('');
    } finally {
      db.close();
    }
  } finally {
    await removeQuietly(copyPath);
    await removeQuietly(`${copyPath}-journal`);
  }
};
