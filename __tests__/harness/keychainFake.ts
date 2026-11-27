/**
 * BOUNDARY: the Android Keychain, as a phone keeps it: entries by service, still there after a relaunch.
 *
 * The entries live in one map on `globalThis`, so they survive `jest.resetModules()` as the device does.
 *
 *   jest.mock('react-native-keychain', () => require('../../harness/keychainFake').keychainModule());
 */
type Entry = { username: string; password: string; service: string };

function entries(): Map<string, Entry> {
  const g = globalThis as unknown as { __KEYCHAIN_FAKE__?: Map<string, Entry> };
  g.__KEYCHAIN_FAKE__ ??= new Map();
  return g.__KEYCHAIN_FAKE__;
}

/** Empty the Keychain (a fresh install). */
export function wipeKeychain(): void {
  entries().clear();
}

export function keychainModule() {
  return {
    ACCESSIBLE: { WHEN_UNLOCKED: 'AccessibleWhenUnlocked' },
    setGenericPassword: jest.fn(async (username: string, password: string, options?: { service?: string }) => {
      const service = options?.service ?? '';
      entries().set(service, { username, password, service });
      return { service, storage: 'keychain' };
    }),
    getGenericPassword: jest.fn(async (options?: { service?: string }) => entries().get(options?.service ?? '') ?? false),
    resetGenericPassword: jest.fn(async (options?: { service?: string }) => entries().delete(options?.service ?? '')),
  };
}
