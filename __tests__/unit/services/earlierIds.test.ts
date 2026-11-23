/**
 * The one place that knows the ids an earlier version saved things under.
 * Only the Keychain is faked.
 */
jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(),
  getGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
}));
jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import * as Keychain from 'react-native-keychain';
import { readKeychainEntry } from '../../../src/services/earlierIds';

const NEW = 'com.bth0mp.fieldkit.test';
const EARLIER = 'earlier.test';
const ACCESSIBLE = 'AccessibleWhenUnlocked' as never;

const vault = new Map<string, { username: string; password: string }>();
const fail = { get: new Set<string>(), set: false, reset: new Set<string>() };

beforeEach(() => {
  vault.clear();
  fail.get.clear();
  fail.set = false;
  fail.reset.clear();
  (Keychain.getGenericPassword as jest.Mock).mockReset().mockImplementation(async ({ service }: { service: string }) => {
    if (fail.get.has(service)) throw new Error('Keychain is locked');
    const entry = vault.get(service);
    return entry ? { ...entry, service } : false;
  });
  (Keychain.setGenericPassword as jest.Mock).mockReset().mockImplementation(
    async (username: string, password: string, options: { service: string }) => {
      if (fail.set) throw new Error('Keychain is locked');
      vault.set(options.service, { username, password });
      return true;
    },
  );
  (Keychain.resetGenericPassword as jest.Mock).mockReset().mockImplementation(async ({ service }: { service: string }) => {
    if (fail.reset.has(service)) throw new Error('Keychain is locked');
    return vault.delete(service);
  });
});

const read = () => readKeychainEntry(NEW, EARLIER, ACCESSIBLE);

describe('readKeychainEntry', () => {
  it('returns false and writes nothing when neither service has an entry', async () => {
    expect(await read()).toBe(false);
    expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
    expect(Keychain.resetGenericPassword).not.toHaveBeenCalled();
  });

  it('returns the new entry and does not look at the earlier one', async () => {
    vault.set(NEW, { username: 'u', password: 'new' });
    const entry = await read();
    expect(entry).toMatchObject({ password: 'new' });
    expect(Keychain.getGenericPassword).toHaveBeenCalledTimes(1);
  });

  it('moves an entry that only the earlier service has, keeping username and accessibility', async () => {
    vault.set(EARLIER, { username: 'passphrase_hash', password: 'old' });
    const entry = await read();
    expect(entry).toMatchObject({ username: 'passphrase_hash', password: 'old' });
    expect(vault.get(NEW)).toEqual({ username: 'passphrase_hash', password: 'old' });
    expect(vault.has(EARLIER)).toBe(false);
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith('passphrase_hash', 'old', { service: NEW, accessible: ACCESSIBLE });
    expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({ service: EARLIER });
  });

  it('lets the new entry win when both exist', async () => {
    vault.set(NEW, { username: 'u', password: 'new' });
    vault.set(EARLIER, { username: 'u', password: 'old' });
    expect(await read()).toMatchObject({ password: 'new' });
    expect(vault.get(NEW)?.password).toBe('new');
  });

  it('passes on a failing read of the new service', async () => {
    fail.get.add(NEW);
    vault.set(EARLIER, { username: 'u', password: 'old' });
    await expect(read()).rejects.toThrow('Keychain is locked');
    expect(vault.has(EARLIER)).toBe(true);
  });

  it('passes on a failing read of the earlier service', async () => {
    fail.get.add(EARLIER);
    await expect(read()).rejects.toThrow('Keychain is locked');
  });

  it('returns the earlier entry and keeps it when the store fails, so the next read tries again', async () => {
    vault.set(EARLIER, { username: 'u', password: 'old' });
    fail.set = true;
    expect(await read()).toMatchObject({ password: 'old' });
    expect(vault.has(NEW)).toBe(false);
    expect(vault.has(EARLIER)).toBe(true);
    expect(Keychain.resetGenericPassword).not.toHaveBeenCalled();

    fail.set = false;
    expect(await read()).toMatchObject({ password: 'old' });
    expect(vault.get(NEW)?.password).toBe('old');
    expect(vault.has(EARLIER)).toBe(false);
  });

  it('returns the entry when the reset fails, and the new one wins the next time', async () => {
    vault.set(EARLIER, { username: 'u', password: 'old' });
    fail.reset.add(EARLIER);
    expect(await read()).toMatchObject({ password: 'old' });
    expect(vault.get(NEW)?.password).toBe('old');
    expect(vault.has(EARLIER)).toBe(true);
    expect(await read()).toMatchObject({ password: 'old' });
    expect(Keychain.setGenericPassword).toHaveBeenCalledTimes(1);
  });
});

describe('renameEarlierModelIds', () => {
  const { renameEarlierModelIds } = require('../../../src/services/earlierIds');

  it('renames the id in values and in keys of a saved JSON string', () => {
    const raw = JSON.stringify({
      state: {
        activeModelId: 'offgrid/litert-recommended/gemma.litertlm',
        settings: { 'offgrid/litert-recommended/gemma.litertlm': { contextLength: 4096 } },
        list: ['offgrid/litert-recommended', 'org/other'],
      },
    });
    expect(JSON.parse(renameEarlierModelIds(raw))).toEqual({
      state: {
        activeModelId: 'fieldkit/litert-recommended/gemma.litertlm',
        settings: { 'fieldkit/litert-recommended/gemma.litertlm': { contextLength: 4096 } },
        list: ['fieldkit/litert-recommended', 'org/other'],
      },
    });
  });

  it('renames an id in the middle of a key', () => {
    const raw = JSON.stringify({ downloadId: 'queued:offgrid/litert-recommended/gemma.litertlm' });
    expect(JSON.parse(renameEarlierModelIds(raw))).toEqual({ downloadId: 'queued:fieldkit/litert-recommended/gemma.litertlm' });
  });

  it('returns the same string when there is nothing to do', () => {
    const raw = JSON.stringify({ id: 'org/model/file.gguf', note: 'nothing here' });
    expect(renameEarlierModelIds(raw)).toBe(raw);
  });

  it('leaves the id alone when it is only text inside a message', () => {
    const raw = JSON.stringify({ text: 'the id was offgrid/litert-recommended/x and "offgrid/litert-recommended/x"' });
    expect(renameEarlierModelIds(raw)).toBe(raw);
  });
});

describe('renameEarlierModelIdsIn and renamingStorage', () => {
  const { renameEarlierModelIdsIn, renamingStorage } = require('../../../src/services/earlierIds');

  it('renames the id in a native download row and returns a row without it as it came', () => {
    const row = { downloadId: 'd1', modelId: 'offgrid/litert-recommended', modelKey: 'offgrid/litert-recommended/f.litertlm', fileName: 'f.litertlm' };
    expect(renameEarlierModelIdsIn(row)).toEqual({
      downloadId: 'd1', modelId: 'fieldkit/litert-recommended', modelKey: 'fieldkit/litert-recommended/f.litertlm', fileName: 'f.litertlm',
    });
    const other = [{ downloadId: 'd2', modelId: 'org/model' }];
    expect(renameEarlierModelIdsIn(other)).toBe(other);
  });

  it('renames what it reads, passes a missing value on, and writes without touching the value', async () => {
    const stored: Record<string, string> = { a: JSON.stringify({ id: 'offgrid/litert-recommended/f' }) };
    const base = {
      getItem: jest.fn(async (name: string) => stored[name] ?? null),
      setItem: jest.fn(async (name: string, value: string) => { stored[name] = value; }),
      removeItem: jest.fn(async (name: string) => { delete stored[name]; }),
    };
    const storage = renamingStorage(base);
    expect(JSON.parse(await storage.getItem('a'))).toEqual({ id: 'fieldkit/litert-recommended/f' });
    expect(await storage.getItem('missing')).toBeNull();
    await storage.setItem('b', '{"id":"x"}');
    expect(base.setItem).toHaveBeenCalledWith('b', '{"id":"x"}');
    await storage.removeItem('b');
    expect(base.removeItem).toHaveBeenCalledWith('b');
  });
});
