/**
 * A phone whose saved lock setting cannot be read still opens on the lock screen when a passphrase is set.
 *
 * Disabling the lock removes the passphrase first, so a passphrase in the Keychain means the lock is on.
 * Real App, auth store, authService and LockScreen; only AsyncStorage (flakyStorage) and the Keychain are faked.
 */
import { failReadsOf, seedRow, wipeFlakyStorage } from '../../harness/flakyStorage';
import { wipeKeychain } from '../../harness/keychainFake';
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('../../harness/flakyStorage').flakyAsyncStorageModule(),
);
jest.mock('@op-engineering/op-sqlite', () => require('../../harness/flakyStorage').flakyOpSqliteModule());
jest.mock('react-native-keychain', () => require('../../harness/keychainFake').keychainModule());
jest.mock('react-native-bootsplash', () => ({ hide: jest.fn(async () => {}) }), { virtual: true });

jest.setTimeout(40000);

const TIMEOUT = { timeout: 8000 };

describe('lock when its saved setting cannot be read (rendered)', () => {
  beforeEach(() => {
    wipeFlakyStorage();
    wipeKeychain();
  });

  it("opens on the lock screen when the lock setting can't be read", async () => {
    const boundary = installNativeBoundary({ llama: true, fs: true });
    const GB = 1024 ** 3;
    const filePath = `${boundary.fs!.DocumentDirectoryPath}/models/ggml-small.gguf`;
    boundary.fs!.seedFile(filePath, 500 * 1024 * 1024);
    const { createDownloadedModel } = require('../../utils/factories');
    const model = createDownloadedModel({ id: 'm', name: 'Test Model', engine: 'llama', fileSize: 2 * GB, filePath, fileName: 'ggml-small.gguf' });
    seedRow('@local_llm/downloaded_models', JSON.stringify([model]));
    seedRow('local-llm-app-storage', JSON.stringify({
      state: { hasCompletedOnboarding: true, checklistDismissed: true, shownSpotlights: { input: true, voiceHint: true, imageSettings: true } },
      version: 0,
    }));
    // The lock was on when the person set it up; the saved setting can't be read now.
    seedRow('local-llm-auth-storage', JSON.stringify({ state: { isEnabled: true, failedAttempts: 0, lockoutUntil: null }, version: 0 }));
    failReadsOf('local-llm-auth-storage', 'database is locked');

    const React = require('react');
    const rtl = requireRTL();
    const { authService } = require('../../../src/services/authService');
    expect(await authService.setPassphrase('correct horse')).toBe(true);
    const App = require('../../../App').default;
    const ui = rtl.render(React.createElement(App));

    await rtl.waitFor(() => expect(ui.queryByTestId('app-loading')).toBeNull(), TIMEOUT);
    await rtl.waitFor(() => expect(ui.getByPlaceholderText('Enter passphrase')).toBeTruthy(), TIMEOUT);
    expect(ui.queryByTestId('home-screen')).toBeNull();

    rtl.fireEvent.changeText(ui.getByPlaceholderText('Enter passphrase'), 'correct horse');
    rtl.fireEvent.press(ui.getByText('Unlock'));
    await rtl.waitFor(() => expect(ui.getByTestId('home-screen')).toBeTruthy(), TIMEOUT);
    expect(ui.queryByPlaceholderText('Enter passphrase')).toBeNull();
  });
});
