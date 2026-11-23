/**
 * A Keychain that cannot be read at launch must leave the app locked, and no passphrase may unlock it.
 * Real auth store, real authService and real LockScreen; only the device boundary (Keychain) is faked.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('../src/navigation', () => ({ AppNavigator: () => null }));
jest.mock('../src/screens', () => ({
  LockScreen: jest.requireActual('../src/screens/LockScreen').LockScreen,
}));
jest.mock('../src/hooks/useAppState', () => ({ useAppState: jest.fn() }));
jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(),
  getGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
  ACCESSIBLE: { WHEN_UNLOCKED: 'AccessibleWhenUnlocked' },
}));
jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockAppState = {
  setDeviceInfo: jest.fn(),
  setModelRecommendation: jest.fn(),
  setDownloadedModels: jest.fn(),
  setDownloadedImageModels: jest.fn(),
  clearImageModelDownloading: jest.fn(),
  setBackgroundDownload: jest.fn(),
  addDownloadedModel: jest.fn(),
  setDownloadProgress: jest.fn(),
  activeBackgroundDownloads: {},
  themeMode: 'light',
};
const mockUseAppStore = Object.assign(
  (selector?: (s: typeof mockAppState) => unknown) => (selector ? selector(mockAppState) : mockAppState),
  { getState: () => mockAppState, persist: { hasHydrated: () => true, rehydrate: jest.fn() } },
);
const mockUseWhisperStore = Object.assign(() => ({}), { getState: () => ({ refreshPresentModels: jest.fn() }) });

jest.mock('../src/stores', () => ({
  useAppStore: mockUseAppStore,
  useAuthStore: jest.requireActual('../src/stores/authStore').useAuthStore,
  useRemoteServerStore: Object.assign(() => ({}), { persist: { hasHydrated: () => true, rehydrate: jest.fn() } }),
  useWhisperStore: mockUseWhisperStore,
}));
jest.mock('../src/services/downloadHydration', () => ({ hydrateDownloadStore: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/services/modelDownloadService/registerProviders', () => ({ registerCoreDownloadProviders: jest.fn() }));
jest.mock('../src/hooks/useDownloads', () => ({ useDownloadListeners: jest.fn() }));
jest.mock('../src/services/loadPolicySync', () => ({ startLoadPolicySync: jest.fn(() => jest.fn()) }));
jest.mock('../src/utils/debugLogFile', () => ({ initDebugLogFile: jest.fn(), appendDebugLine: jest.fn() }));
jest.mock('../src/services', () => ({
  hardwareService: {
    getDeviceInfo: jest.fn(() => Promise.resolve({ totalMemory: 8 * 1024 * 1024 * 1024 })),
    getModelRecommendation: jest.fn(() => ({ maxParameters: 7, recommendedQuantization: 'Q4_K_M' })),
  },
  modelManager: {
    initialize: jest.fn(() => Promise.resolve()),
    cleanupMMProjEntries: jest.fn(() => Promise.resolve()),
    setBackgroundDownloadMetadataCallback: jest.fn(),
    syncBackgroundDownloads: jest.fn(() => Promise.resolve([])),
    syncCompletedImageDownloads: jest.fn(() => Promise.resolve([])),
    reconcileFinishedImageDownloads: jest.fn(() => Promise.resolve([])),
    restoreInProgressDownloads: jest.fn(() => Promise.resolve([])),
    startBackgroundDownloadPolling: jest.fn(),
    getDownloadedModels: jest.fn(() => Promise.resolve([])),
    refreshModelLists: jest.fn(() => Promise.resolve({ textModels: [], imageModels: [] })),
    watchDownload: jest.fn(),
  },
  authService: jest.requireActual('../src/services/authService').authService,
  ragService: { ensureReady: jest.fn(() => Promise.resolve()) },
  remoteServerManager: { initializeProviders: jest.fn(() => Promise.resolve()) },
}));

import * as Keychain from 'react-native-keychain';
import { EARLIER_AUTH_SERVICE } from '../src/services/earlierIds';

const AUTH_SERVICE = 'com.bth0mp.fieldkit.auth';

// The Keychain of a phone: entries by service. Only this device boundary is faked.
const vault = new Map<string, { username: string; password: string }>();
function useVault(): void {
  vault.clear();
  (Keychain.getGenericPassword as jest.Mock).mockReset().mockImplementation(async ({ service }: { service: string }) => {
    const entry = vault.get(service);
    return entry ? { ...entry, service } : false;
  });
  (Keychain.setGenericPassword as jest.Mock).mockReset().mockImplementation(
    async (username: string, password: string, { service }: { service: string }) => {
      vault.set(service, { username, password });
      return true;
    },
  );
  (Keychain.resetGenericPassword as jest.Mock).mockReset().mockImplementation(async ({ service }: { service: string }) => vault.delete(service));
}

/** The lock as an earlier version saved it: a passphrase under the earlier Keychain service. */
async function saveEarlierPassphrase(passphrase: string): Promise<void> {
  const { authService } = require('../src/services/authService');
  await authService.setPassphrase(passphrase);
  vault.set(EARLIER_AUTH_SERVICE, vault.get(AUTH_SERVICE)!);
  vault.delete(AUTH_SERVICE);
}

describe('App with an unreadable Keychain', () => {
  it('stays on the lock screen and no passphrase unlocks it', async () => {
    const { useAuthStore } = require('../src/stores/authStore');
    useAuthStore.setState({ isEnabled: true, isLocked: true, failedAttempts: 0, lockoutUntil: null });
    (Keychain.getGenericPassword as jest.Mock).mockRejectedValue(new Error('Keychain error'));
    const App = require('../App').default;

    const view = render(<App />);
    await waitFor(() => expect(view.getByPlaceholderText('Enter passphrase')).toBeTruthy());

    for (const attempt of ['anything', 'another-one']) {
      fireEvent.changeText(view.getByPlaceholderText('Enter passphrase'), attempt);
      await ReactTestRenderer.act(async () => {
        fireEvent.press(view.getByText('Unlock'));
      });
      await waitFor(() => expect(view.getByText("Couldn't check your passphrase")).toBeTruthy());
      fireEvent.press(view.getByText('Cancel'));
      expect(view.getByPlaceholderText('Enter passphrase')).toBeTruthy();
    }
    expect(useAuthStore.getState().isLocked).toBe(true);
    expect(useAuthStore.getState().failedAttempts).toBe(0);
  });
});

describe('App start', () => {
  it('makes no network call and reads no licence Keychain entry', async () => {
    const { useAuthStore } = require('../src/stores/authStore');
    const { ragService } = require('../src/services');
    useAuthStore.setState({ isEnabled: false, isLocked: false, failedAttempts: 0, lockoutUntil: null });
    (Keychain.getGenericPassword as jest.Mock).mockReset();
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
    const fetchSpy = jest.fn();
    const originalFetch = global.fetch;
    global.fetch = fetchSpy as unknown as typeof fetch;
    const App = require('../App').default;

    try {
      render(<App />);
      await waitFor(() => expect(ragService.ensureReady).toHaveBeenCalled());
      await ReactTestRenderer.act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      const services = (Keychain.getGenericPassword as jest.Mock).mock.calls.map(([options]) => options?.service);
      expect(services).not.toContain('off-grid-pro-license');
      expect(services).not.toContain('off-grid-device-fingerprint');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('App lock saved by an earlier version', () => {
  beforeEach(() => {
    useVault();
  });

  it('starts locked, opens with the right passphrase and keeps it under the new service', async () => {
    await saveEarlierPassphrase('open-sesame');
    const { useAuthStore } = require('../src/stores/authStore');
    useAuthStore.setState({ isEnabled: true, isLocked: true, failedAttempts: 0, lockoutUntil: null });
    const App = require('../App').default;

    const view = render(<App />);
    await waitFor(() => expect(view.getByPlaceholderText('Enter passphrase')).toBeTruthy());

    fireEvent.changeText(view.getByPlaceholderText('Enter passphrase'), 'not-it');
    await ReactTestRenderer.act(async () => {
      fireEvent.press(view.getByText('Unlock'));
    });
    await waitFor(() => expect(useAuthStore.getState().failedAttempts).toBe(1));
    expect(useAuthStore.getState().isLocked).toBe(true);

    fireEvent.changeText(view.getByPlaceholderText('Enter passphrase'), 'open-sesame');
    await ReactTestRenderer.act(async () => {
      fireEvent.press(view.getByText('Unlock'));
    });
    await waitFor(() => expect(useAuthStore.getState().isLocked).toBe(false));
    expect(vault.has(AUTH_SERVICE)).toBe(true);
    expect(vault.has(EARLIER_AUTH_SERVICE)).toBe(false);
  });

  it('turning the lock off clears both services, and the next start is not locked', async () => {
    const { authService } = require('../src/services/authService');
    const { useAuthStore } = require('../src/stores/authStore');
    vault.set(AUTH_SERVICE, { username: 'passphrase_hash', password: 'new-hash' });
    vault.set(EARLIER_AUTH_SERVICE, { username: 'passphrase_hash', password: 'stale-hash' });
    useAuthStore.setState({ isEnabled: true, isLocked: false });

    const { SecuritySettingsScreen } = require('../src/screens/SecuritySettingsScreen');
    const settings = render(<SecuritySettingsScreen />);
    fireEvent(settings.getAllByRole('switch')[0], 'valueChange', false);
    await ReactTestRenderer.act(async () => {
      fireEvent.press(settings.getByText('Disable'));
    });
    await waitFor(() => expect(useAuthStore.getState().isEnabled).toBe(false));
    expect(vault.size).toBe(0);
    settings.unmount();

    useAuthStore.setState({ isLocked: true });
    const App = require('../App').default;
    const { ragService } = require('../src/services');
    (ragService.ensureReady as jest.Mock).mockClear();
    const view = render(<App />);
    await waitFor(() => expect(ragService.ensureReady).toHaveBeenCalled());
    await ReactTestRenderer.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(view.queryByPlaceholderText('Enter passphrase')).toBeNull();
    expect(await authService.hasPassphrase()).toBe(false);
  });
});

describe('App start after an update', () => {
  const LEFTOVER_ENTRIES = ['off-grid-pro-license', 'off-grid-device-fingerprint'];
  const OLD_LOGS = ['/mock/documents/offgrid-debug.log', '/mock/documents/offgrid-wire.log'];
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  const RNFS = require('react-native-fs');
  const onDisk = new Set<string>();

  const startApp = async () => {
    const App = require('../App').default;
    const { ragService } = require('../src/services');
    (ragService.ensureReady as jest.Mock).mockClear();
    const view = render(<App />);
    await waitFor(() => expect(ragService.ensureReady).toHaveBeenCalled());
    await ReactTestRenderer.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    view.unmount();
  };

  beforeEach(async () => {
    useVault();
    onDisk.clear();
    (RNFS.exists as jest.Mock).mockImplementation(async (path: string) => onDisk.has(path));
    (RNFS.unlink as jest.Mock).mockClear().mockImplementation(async (path: string) => { onDisk.delete(path); });
    await AsyncStorage.removeItem('@fieldkit/earlier_ids_cleared');
    const { useAuthStore } = require('../src/stores/authStore');
    useAuthStore.setState({ isEnabled: false, isLocked: false, failedAttempts: 0, lockoutUntil: null });
  });

  afterEach(() => {
    (RNFS.exists as jest.Mock).mockImplementation(() => Promise.resolve(false));
  });

  it('clears the entries and logs an earlier version left, once', async () => {
    for (const service of LEFTOVER_ENTRIES) vault.set(service, { username: 'x', password: 'y' });
    for (const path of OLD_LOGS) onDisk.add(path);

    await startApp();
    await waitFor(() => expect(LEFTOVER_ENTRIES.some((service) => vault.has(service))).toBe(false));
    await waitFor(() => expect(OLD_LOGS.some((path) => onDisk.has(path))).toBe(false));
    await waitFor(async () => expect(await AsyncStorage.getItem('@fieldkit/earlier_ids_cleared')).toBeTruthy());

    // Once: a later launch does not look again.
    for (const service of LEFTOVER_ENTRIES) vault.set(service, { username: 'x', password: 'y' });
    await startApp();
    expect(LEFTOVER_ENTRIES.every((service) => vault.has(service))).toBe(true);
  });

  it('tries again at the next launch when the Keychain would not clear an entry', async () => {
    vault.set('off-grid-pro-license', { username: 'x', password: 'y' });
    (Keychain.resetGenericPassword as jest.Mock).mockRejectedValueOnce(new Error('Keychain is locked'));

    await startApp();
    expect(await AsyncStorage.getItem('@fieldkit/earlier_ids_cleared')).toBeNull();
    expect(vault.has('off-grid-pro-license')).toBe(true);

    await startApp();
    await waitFor(() => expect(vault.has('off-grid-pro-license')).toBe(false));
  });
});
