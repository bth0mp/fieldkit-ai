/**
 * A remote server's API key lives only in the Keychain.
 *
 * The key used to be saved in the `remote-servers` AsyncStorage row as well. These tests add a server through
 * the real modal, relaunch over rows an older version wrote, and open the server list over a faked network,
 * with the device boundary faked: AsyncStorage (harness/flakyStorage), the Keychain and fetch.
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { rawRow, seedRow, failReadsOf, wipeFlakyStorage } from '../../harness/flakyStorage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('../../harness/flakyStorage').flakyAsyncStorageModule(),
);
jest.mock('@op-engineering/op-sqlite', () => require('../../harness/flakyStorage').flakyOpSqliteModule());
jest.mock('react-native-keychain', () => {
  // On globalThis so a relaunch (fresh modules) sees the same Keychain, as the device's would.
  const g = globalThis as unknown as { __KEYCHAIN__?: { vault: Map<string, string>; fail: { set: boolean; get: boolean; reset: boolean } } };
  g.__KEYCHAIN__ ??= { vault: new Map<string, string>(), fail: { set: false, get: false, reset: false } };
  const { vault, fail } = g.__KEYCHAIN__;
  // A test can hold the Keychain's answer to a read until it chooses to release it.
  const hold: { get: Promise<void> | null } = { get: null };
  return {
    __vault: vault,
    __fail: fail,
    __hold: hold,
    ACCESSIBLE: { WHEN_UNLOCKED: 'AccessibleWhenUnlocked' },
    setGenericPassword: jest.fn(async (_user: string, password: string, options: { service: string }) => {
      if (fail.set) throw new Error('Keychain is locked');
      vault.set(options.service, password);
      return true;
    }),
    getGenericPassword: jest.fn(async (options: { service: string }) => {
      if (hold.get) await hold.get;
      if (fail.get) throw new Error('Keychain is locked');
      const password = vault.get(options.service);
      return password === undefined ? false : { username: 'server', password, service: options.service };
    }),
    resetGenericPassword: jest.fn(async (options: { service: string }) => {
      if (fail.reset) throw new Error('Keychain is locked');
      return vault.delete(options.service);
    }),
  };
});
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useIsFocused: () => true, useFocusEffect: () => {},
}));

import { RemoteServersScreen } from '../../../src/screens/RemoteServersScreen';
import { useRemoteServerStore } from '../../../src/stores';
import { EARLIER_SERVERS_SERVICE } from '../../../src/services/earlierIds';

jest.setTimeout(30000);

const SERVICE = 'com.bth0mp.fieldkit.servers';
const ENDPOINT = 'http://192.168.1.50:11434';
const keychain = () => require('react-native-keychain') as {
  __vault: Map<string, string>; __hold: { get: Promise<void> | null }; __fail: { set: boolean; get: boolean; reset: boolean };
};
const vaultKey = (id: string) => keychain().__vault.get(`${SERVICE}.${id}`);
const earlierKey = (id: string) => keychain().__vault.get(`${EARLIER_SERVERS_SERVICE}.${id}`);

const record = (id: string, extra: object = {}) => ({
  id, name: `Server ${id}`, endpoint: ENDPOINT, providerType: 'openai-compatible', createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});
const seedServers = (...servers: object[]) =>
  seedRow('remote-servers', JSON.stringify({
    state: { servers, activeServerId: null, activeRemoteTextModelId: null, activeRemoteImageModelId: null, discoveredModels: {} },
    version: 0,
  }));

interface Call { url: string; authorization?: string }
let calls: Call[] = [];
const installNetwork = (status = 200) => {
  calls = [];
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url: String(url), authorization: init?.headers?.Authorization });
    if (String(url).endsWith('/v1/models') && status === 200) {
      return { ok: true, status, json: async () => ({ object: 'list', data: [{ id: 'llama-3-8b', object: 'model' }] }) };
    }
    return { ok: false, status: status === 200 ? 404 : status, json: async () => ({}) };
  });
};

const loggedText = () =>
  (['log', 'warn', 'error'] as const)
    .flatMap(level => (console[level] as jest.Mock).mock.calls)
    .map((args: unknown[]) => args.map((a: unknown) => (a instanceof Error ? a.message : String(a))).join(' '))
    .join('\n');

/**
 * A relaunch: fresh modules over the same disk and Keychain. Like App.tsx, it asks the store to read its
 * saved servers when the first read has not worked, then starts the providers.
 */
async function startApp() {
  const { manager, store } = relaunch();
  if (!store.persist.hasHydrated()) await store.persist.rehydrate();
  await manager.initializeProviders();
  return { manager, store };
}

function relaunch() {
  let launched: { manager: any; store: any } | undefined;
  jest.isolateModules(() => {
    const { remoteServerManager } = require('../../../src/services/remoteServerManager');
    const { useRemoteServerStore: store } = require('../../../src/stores/remoteServerStore');
    launched = { manager: remoteServerManager, store };
  });
  return launched!;
}

beforeEach(() => {
  wipeFlakyStorage();
  keychain().__vault.clear();
  keychain().__fail.set = false;
  keychain().__fail.get = false;
  keychain().__fail.reset = false;
  keychain().__hold.get = null;
  (['log', 'warn', 'error'] as const).forEach(level => (console[level] as jest.Mock).mockClear());
  installNetwork();
  useRemoteServerStore.setState({ servers: [], serverHealth: {}, discoveredModels: {} });
});

describe('server keys live only in the Keychain', () => {
  it('never saves a new server key outside the Keychain', async () => {
    const ui = render(<RemoteServersScreen />);
    fireEvent.press(ui.getByText('Add Server'));
    fireEvent.changeText(await waitFor(() => ui.getByPlaceholderText('e.g., Ollama on my laptop')), 'Desk');
    fireEvent.changeText(ui.getByPlaceholderText('http://192.168.1.50:8080'), ENDPOINT);
    fireEvent.changeText(ui.getByPlaceholderText('sk-...'), 'sk-secret-1');
    fireEvent.press(ui.getByText('Test Connection'));
    await waitFor(() => expect(ui.queryByText(/Connected \(/)).not.toBeNull());
    const addButtons = ui.getAllByText('Add Server');
    fireEvent.press(addButtons[addButtons.length - 1]);
    await waitFor(() => expect(rawRow('remote-servers')).toContain('Desk'));

    expect(rawRow('remote-servers')).not.toContain('sk-secret-1');
    const [added] = useRemoteServerStore.getState().servers;
    expect(vaultKey(added.id)).toBe('sk-secret-1');
    expect(JSON.stringify(useRemoteServerStore.getState().servers)).not.toContain('sk-secret-1');
  });

  it('moves a key an older version saved into the Keychain', async () => {
    seedServers(record('a', { apiKey: 'sk-old' }));
    await startApp();

    expect(vaultKey('a')).toBe('sk-old');
    await waitFor(() => expect(rawRow('remote-servers')).not.toContain('sk-old'));
    expect(rawRow('remote-servers')).toContain('Server a');
    expect(loggedText()).not.toContain('sk-old');
  });

  it('keeps the newer Keychain key over an old saved one', async () => {
    seedServers(record('a', { apiKey: 'sk-old' }));
    keychain().__vault.set(`${SERVICE}.a`, 'sk-new');
    await startApp();

    expect(vaultKey('a')).toBe('sk-new');
    await waitFor(() => expect(rawRow('remote-servers')).not.toContain('sk-old'));
  });

  it('keeps the saved copy when the Keychain refuses it', async () => {
    seedServers(record('a', { apiKey: 'sk-old' }));
    keychain().__fail.set = true;
    const { store } = await startApp();

    expect(vaultKey('a')).toBeUndefined();
    expect(rawRow('remote-servers')).toContain('sk-old');
    expect(store.getState().servers).toHaveLength(1);
    expect(loggedText()).not.toContain('sk-old');

    // The next launch tries again.
    keychain().__fail.set = false;
    await startApp();
    expect(vaultKey('a')).toBe('sk-old');
    await waitFor(() => expect(rawRow('remote-servers')).not.toContain('sk-old'));
  });

  it('moves the key once the saved servers load, when the first read failed', async () => {
    seedServers(record('a', { apiKey: 'sk-old' }));
    // The launch read and the one App.tsx asks for both fail; the gate's own retry then works.
    failReadsOf('remote-servers', 'disk busy', 2);
    await startApp();

    // The failed read was not taken for "no servers": nothing moved and the row is untouched.
    expect(vaultKey('a')).toBeUndefined();
    expect(rawRow('remote-servers')).toContain('sk-old');

    await waitFor(() => expect(vaultKey('a')).toBe('sk-old'), { timeout: 5000 });
    await waitFor(() => expect(rawRow('remote-servers')).not.toContain('sk-old'));
    expect(rawRow('remote-servers')).toContain('Server a');
  });

  it('checks each listed server with its saved key', async () => {
    keychain().__vault.set(`${SERVICE}.a`, 'sk-old');
    useRemoteServerStore.setState({ servers: [record('a')] as never });
    render(<RemoteServersScreen />);

    await waitFor(() => expect(useRemoteServerStore.getState().serverHealth.a?.isHealthy).toBe(true));
    const sent = calls.filter(c => c.url.startsWith(ENDPOINT));
    expect(sent.some(c => c.url.endsWith('/v1/models'))).toBe(true);
    expect(sent.some(c => c.url.endsWith('/props'))).toBe(true);
    expect(sent.some(c => c.url.endsWith('/api/show'))).toBe(true);
    expect(sent.filter(c => c.authorization !== 'Bearer sk-old')).toEqual([]);
  });

  it('says the key was refused', async () => {
    installNetwork(401);
    keychain().__vault.set(`${SERVICE}.a`, 'sk-old');
    useRemoteServerStore.setState({ servers: [record('a')] as never });
    const ui = render(<RemoteServersScreen />);

    fireEvent.press(ui.getByText('Test'));
    await waitFor(() => expect(ui.queryByText('The server refused the API key.')).not.toBeNull());
  });

  it('keeps the key when a server is renamed without retyping it', async () => {
    keychain().__vault.set(`${SERVICE}.a`, 'sk-old');
    useRemoteServerStore.setState({ servers: [record('a')] as never });
    const ui = render(<RemoteServersScreen />);

    fireEvent.press(ui.getByText('Edit'));
    const name = await waitFor(() => ui.getByDisplayValue('Server a'));
    fireEvent.press(ui.getByText('Test Connection'));
    await waitFor(() => expect(ui.queryByText(/Connected \(/)).not.toBeNull());
    fireEvent.changeText(name, 'Renamed');
    await act(async () => { fireEvent.press(ui.getByText('Update Server')); });

    await waitFor(() => expect(useRemoteServerStore.getState().servers[0].name).toBe('Renamed'));
    expect(vaultKey('a')).toBe('sk-old');
  });

  it('keeps the key when the Keychain cannot be read while the server is renamed', async () => {
    keychain().__vault.set(`${SERVICE}.a`, 'sk-old');
    keychain().__fail.get = true;
    useRemoteServerStore.setState({ servers: [record('a')] as never });
    const ui = render(<RemoteServersScreen />);

    fireEvent.press(ui.getByText('Edit'));
    const name = await waitFor(() => ui.getByDisplayValue('Server a'));
    fireEvent.press(ui.getByText('Test Connection'));
    await waitFor(() => expect(ui.queryByText(/Connected \(/)).not.toBeNull());
    fireEvent.changeText(name, 'Renamed');
    await act(async () => { fireEvent.press(ui.getByText('Update Server')); });

    await waitFor(() => expect(useRemoteServerStore.getState().servers[0].name).toBe('Renamed'));
    expect(vaultKey('a')).toBe('sk-old');
  });

  it('removes the key when it is cleared on purpose', async () => {
    keychain().__vault.set(`${SERVICE}.a`, 'sk-old');
    useRemoteServerStore.setState({ servers: [record('a')] as never });
    const ui = render(<RemoteServersScreen />);

    fireEvent.press(ui.getByText('Edit'));
    const key = await waitFor(() => ui.getByDisplayValue('sk-old'));
    fireEvent.changeText(key, '');
    fireEvent.press(ui.getByText('Test Connection'));
    await waitFor(() => expect(ui.queryByText(/Connected \(/)).not.toBeNull());
    await act(async () => { fireEvent.press(ui.getByText('Update Server')); });

    await waitFor(() => expect(vaultKey('a')).toBeUndefined());
  });

  it('says so when the Keychain will not clear a key, and the key stays saved', async () => {
    keychain().__vault.set(`${SERVICE}.a`, 'sk-old');
    useRemoteServerStore.setState({ servers: [record('a')] as never });
    const ui = render(<RemoteServersScreen />);

    fireEvent.press(ui.getByText('Edit'));
    const key = await waitFor(() => ui.getByDisplayValue('sk-old'));
    fireEvent.changeText(key, '');
    fireEvent.changeText(ui.getByDisplayValue('Server a'), 'Renamed');
    fireEvent.press(ui.getByText('Test Connection'));
    await waitFor(() => expect(ui.queryByText(/Connected \(/)).not.toBeNull());
    keychain().__fail.reset = true;
    await act(async () => { fireEvent.press(ui.getByText('Update Server')); });

    await waitFor(() => expect(ui.queryByText('Keychain is locked')).not.toBeNull());
    // Nothing was saved as done: the key is still in the Keychain and the server was not renamed.
    expect(vaultKey('a')).toBe('sk-old');
    expect(useRemoteServerStore.getState().servers[0].name).toBe('Server a');
  });

  it('leaves no server behind when its key could not be saved, and a second try saves both', async () => {
    const ui = render(<RemoteServersScreen />);
    fireEvent.press(ui.getByText('Add Server'));
    fireEvent.changeText(await waitFor(() => ui.getByPlaceholderText('e.g., Ollama on my laptop')), 'Desk');
    fireEvent.changeText(ui.getByPlaceholderText('http://192.168.1.50:8080'), ENDPOINT);
    fireEvent.changeText(ui.getByPlaceholderText('sk-...'), 'sk-secret-1');
    fireEvent.press(ui.getByText('Test Connection'));
    await waitFor(() => expect(ui.queryByText(/Connected \(/)).not.toBeNull());
    keychain().__fail.set = true;
    const addButtons = ui.getAllByText('Add Server');
    await act(async () => { fireEvent.press(addButtons[addButtons.length - 1]); });

    await waitFor(() => expect(ui.queryByText('Keychain is locked')).not.toBeNull());
    expect(useRemoteServerStore.getState().servers).toEqual([]);

    // The Keychain works again; the same form is tried once more.
    keychain().__fail.set = false;
    fireEvent.press(ui.getByText('OK'));
    await waitFor(() => expect(ui.queryByText('Keychain is locked')).toBeNull());
    const retry = ui.getAllByText('Add Server');
    await act(async () => { fireEvent.press(retry[retry.length - 1]); });

    await waitFor(() => expect(useRemoteServerStore.getState().servers).toHaveLength(1));
    expect(vaultKey(useRemoteServerStore.getState().servers[0].id)).toBe('sk-secret-1');
  });

  it('does not put a late Keychain answer over a key the person already typed', async () => {
    keychain().__vault.set(`${SERVICE}.a`, 'sk-old');
    let release!: () => void;
    keychain().__hold.get = new Promise<void>(resolve => { release = resolve; });
    useRemoteServerStore.setState({ servers: [record('a')] as never });
    const ui = render(<RemoteServersScreen />);

    fireEvent.press(ui.getByText('Edit'));
    const key = await waitFor(() => ui.getByPlaceholderText('sk-...'));
    fireEvent.changeText(key, 'sk-new');
    fireEvent.press(ui.getByText('Test Connection'));
    await waitFor(() => expect(ui.queryByText(/Connected \(/)).not.toBeNull());
    // The Keychain answers only now, after the typing.
    keychain().__hold.get = null;
    await act(async () => { release(); });
    expect(ui.getByDisplayValue('sk-new')).toBeTruthy();
    expect(ui.queryByDisplayValue('sk-old')).toBeNull();
    await act(async () => { fireEvent.press(ui.getByText('Update Server')); });

    await waitFor(() => expect(vaultKey('a')).toBe('sk-new'));
  });

  describe('a key an earlier version saved under its own Keychain service', () => {
    beforeEach(() => {
      keychain().__vault.set(`${EARLIER_SERVERS_SERVICE}.a`, 'sk-old');
      useRemoteServerStore.setState({ servers: [record('a')] as never });
    });

    it('shows the saved key in the server form and moves it to the new service', async () => {
      const ui = render(<RemoteServersScreen />);
      fireEvent.press(ui.getByText('Edit'));

      await waitFor(() => expect(ui.getByDisplayValue('sk-old')).toBeTruthy());
      expect(vaultKey('a')).toBe('sk-old');
      expect(earlierKey('a')).toBeUndefined();
    });

    it('is sent with the requests to the server', async () => {
      render(<RemoteServersScreen />);
      await waitFor(() => expect(useRemoteServerStore.getState().serverHealth.a?.isHealthy).toBe(true));

      const sent = calls.filter(c => c.url.startsWith(ENDPOINT));
      expect(sent.length).toBeGreaterThan(0);
      expect(sent.filter(c => c.authorization !== 'Bearer sk-old')).toEqual([]);
      expect(vaultKey('a')).toBe('sk-old');
      expect(earlierKey('a')).toBeUndefined();
    });

    it('clearing the key removes it from both services', async () => {
      keychain().__vault.set(`${SERVICE}.a`, 'sk-old');
      const ui = render(<RemoteServersScreen />);

      fireEvent.press(ui.getByText('Edit'));
      const key = await waitFor(() => ui.getByDisplayValue('sk-old'));
      fireEvent.changeText(key, '');
      fireEvent.press(ui.getByText('Test Connection'));
      await waitFor(() => expect(ui.queryByText(/Connected \(/)).not.toBeNull());
      await act(async () => { fireEvent.press(ui.getByText('Update Server')); });

      await waitFor(() => expect(vaultKey('a')).toBeUndefined());
      expect(earlierKey('a')).toBeUndefined();
    });
  });
});
