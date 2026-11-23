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
