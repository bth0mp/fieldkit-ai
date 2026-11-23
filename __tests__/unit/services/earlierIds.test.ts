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
