/**
 * BOUNDARY: AsyncStorage and the SQLite database behind it, as a phone whose reads can fail.
 *
 * The data lives in one in-memory map on `globalThis`, so it survives `jest.resetModules()` (a relaunch)
 * as the device disk does. A read can be made to fail once, or for good. A row can be marked oversized:
 * AsyncStorage's own read of it rejects (Android's cursor window), while op-sqlite, which opens the same
 * database (`RKStorage`), can still read it in pieces. A write to that key replaces the row.
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
};

function disk(): Disk {
  const g = globalThis as unknown as { __FLAKY_STORAGE_DISK__?: Disk };
  g.__FLAKY_STORAGE_DISK__ ??= { data: {}, failing: new Map(), oversized: new Set(), writtenKeys: [] };
  return g.__FLAKY_STORAGE_DISK__;
}

/** Wipe the disk (a fresh install). */
export function wipeFlakyStorage(): void {
  const d = disk();
  d.data = {};
  d.failing.clear();
  d.oversized.clear();
  d.writtenKeys = [];
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

/** op-sqlite: `RKStorage` answers the length and substr reads of an oversized row; anything else is empty. */
export function flakyOpSqliteModule() {
  const none = { rows: [], insertId: 0, rowsAffected: 0 };
  const execute = (name: string, sql: string, params: unknown[] = []) => {
    if (name !== 'RKStorage') return none;
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
    open: jest.fn(({ name }: { name: string }) => ({
      execute: jest.fn(async (sql: string, params?: unknown[]) => execute(name, sql, params)),
      executeSync: jest.fn((sql: string, params?: unknown[]) => execute(name, sql, params)),
      close: jest.fn(),
      delete: jest.fn(),
    })),
  };
}
