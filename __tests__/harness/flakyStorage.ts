/**
 * BOUNDARY: AsyncStorage and the SQLite database behind it, as a phone whose reads can fail.
 *
 * The data lives in one in-memory map on `globalThis`, so it survives `jest.resetModules()` (a relaunch)
 * as the device disk does. A read can be made to fail once, or for good. A row can be marked oversized:
 * AsyncStorage's own read of it rejects (Android's cursor window), while op-sqlite, which opens the same
 * database (`RKStorage`), can still read it in pieces from a copy of the file. A write to that key replaces the row.
 *
 * Use both as modules at the top of the test file (jest hoists them):
 *
 *   jest.mock('@react-native-async-storage/async-storage', () =>
 *     require('../../harness/flakyStorage').flakyAsyncStorageModule());
 *   jest.mock('@op-engineering/op-sqlite', () =>
 *     require('../../harness/flakyStorage').flakyOpSqliteModule());
 */
type Disk = {
  data: Record<string, string>;
  failing: Map<string, { message: string; times: number }>;
  oversized: Set<string>;
  writtenKeys: string[];
  sqliteOpens: { name: string; location?: string }[];
  sqliteOpen: number;
};

function disk(): Disk {
  const g = globalThis as unknown as { __FLAKY_STORAGE_DISK__?: Disk };
  g.__FLAKY_STORAGE_DISK__ ??= { data: {}, failing: new Map(), oversized: new Set(), writtenKeys: [], sqliteOpens: [], sqliteOpen: 0 };
  return g.__FLAKY_STORAGE_DISK__;
}

/** Wipe the disk (a fresh install). */
export function wipeFlakyStorage(): void {
  const d = disk();
  d.data = {};
  d.failing.clear();
  d.oversized.clear();
  d.writtenKeys = [];
  d.sqliteOpens = [];
  d.sqliteOpen = 0;
}

/** Put a value on the disk without going through the app. */
export function seedRow(key: string, value: string): void {
  disk().data[key] = value;
}

/** The raw value on the disk, or null. */
export function rawRow(key: string): string | null {
  return disk().data[key] ?? null;
}

/** The next `times` reads of `key` reject (Infinity: every read, until `stopFailingReads`). */
export function failReadsOf(key: string, message: string, times = Infinity): void {
  disk().failing.set(key, { message, times });
}

export function stopFailingReads(key: string): void {
  disk().failing.delete(key);
}

/** AsyncStorage cannot read this row (too big for one cursor window); op-sqlite can. */
export function markOversized(key: string): void {
  disk().oversized.add(key);
}

/** Every key a write has touched since the last wipe, in order. */
export function writtenKeys(): string[] {
  return [...disk().writtenKeys];
}

export function flakyAsyncStorageModule() {
  const read = (key: string): Promise<string | null> => {
    const d = disk();
    const failure = d.failing.get(key);
    if (failure) {
      failure.times -= 1;
      if (failure.times <= 0) d.failing.delete(key);
      return Promise.reject(new Error(failure.message));
    }
    if (d.oversized.has(key)) return Promise.reject(new Error('Row too big to fit into CursorWindow'));
    return Promise.resolve(d.data[key] ?? null);
  };
  const write = (key: string, value: string) => {
    const d = disk();
    d.data[key] = value;
    d.oversized.delete(key);
    d.writtenKeys.push(key);
  };
  const module = {
    getItem: jest.fn(read),
    setItem: jest.fn((key: string, value: string) => {
      write(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete disk().data[key];
      return Promise.resolve();
    }),
    multiGet: jest.fn(async (keys: string[]) =>
      Promise.all(keys.map(async key => [key, await read(key)] as [string, string | null])),
    ),
    multiSet: jest.fn((pairs: [string, string][]) => {
      pairs.forEach(([key, value]) => write(key, value));
      return Promise.resolve();
    }),
    multiRemove: jest.fn((keys: string[]) => {
      keys.forEach(key => delete disk().data[key]);
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      disk().data = {};
      return Promise.resolve();
    }),
    getAllKeys: jest.fn(() => Promise.resolve(Object.keys(disk().data))),
  };
  return { __esModule: true, default: module, ...module };
}

/** Where Android keeps AsyncStorage's database, as op-sqlite reports it (with the trailing slash). */
export const LIVE_DATABASE_DIRECTORY = '/data/user/0/app/databases/';
export const LIVE_DATABASE_FILE = `${LIVE_DATABASE_DIRECTORY}RKStorage`;
/** What a database file must hold for quick_check to report damage (a copy taken mid-write). */
export const TORN_DATABASE = 'torn';

/** Every database op-sqlite was asked to open since the last wipe. */
export function sqliteOpens(): { name: string; location?: string }[] {
  return [...disk().sqliteOpens];
}

/** How many opened databases have not been closed yet. */
export function sqliteStillOpen(): number {
  return disk().sqliteOpen;
}

/**
 * op-sqlite as a phone has it: a database is a file the test put on the file system (the react-native-fs
 * fake). Opening `RKStorage` itself is refused, since a second SQLite copy must not touch the live file.
 * A database file holding `TORN_DATABASE` fails PRAGMA quick_check. The row an `oversized` key names is
 * served in pieces from any database file that exists.
 */
export function flakyOpSqliteModule() {
  const none = { rows: [], insertId: 0, rowsAffected: 0 };
  const execute = async (name: string, location: string | undefined, sql: string, params: unknown[] = []) => {
    const fs = require('react-native-fs');
    let content: string;
    try {
      content = await fs.readFile(`${location}/${name}`, 'utf8');
    } catch {
      throw new Error('unable to open database file');
    }
    if (/quick_check/.test(sql)) {
      return { ...none, rows: [{ quick_check: content === TORN_DATABASE ? 'database disk image is malformed' : 'ok' }] };
    }
    const d = disk();
    const key = String(params[params.length - 1]);
    const value = d.oversized.has(key) ? d.data[key] : undefined;
    if (value === undefined) return none;
    if (/length\(value\)/.test(sql)) return { ...none, rows: [{ units: value.length }] };
    if (/substr\(value/.test(sql)) {
      const [from, count] = params as [number, number];
      return { ...none, rows: [{ part: value.slice(from - 1, from - 1 + count) }] };
    }
    return none;
  };
  return {
    ANDROID_DATABASE_PATH: LIVE_DATABASE_DIRECTORY,
    open: jest.fn(({ name, location }: { name: string; location?: string }) => {
      const d = disk();
      d.sqliteOpens.push({ name, location });
      if (name === 'RKStorage') throw new Error('The live AsyncStorage database must not be opened here');
      d.sqliteOpen += 1;
      return {
        execute: jest.fn(async (sql: string, params?: unknown[]) => execute(name, location, sql, params)),
        executeSync: jest.fn(() => none),
        close: jest.fn(() => { d.sqliteOpen -= 1; }),
        delete: jest.fn(),
      };
    }),
  };
}
