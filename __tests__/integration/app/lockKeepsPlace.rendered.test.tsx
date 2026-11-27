/**
 * Locking keeps your place, and the app's own pickers don't lock it (rendered).
 *
 * The lock is drawn over the app instead of replacing it, so the open chat and its draft are still there after
 * unlocking.
 *
 * Real App, navigator, chat, composer, auth store, authService and LockScreen. Device leaves only: AsyncStorage,
 * the Keychain, AppState, the llama/LiteRT engines.
 */
import { seedRow, wipeFlakyStorage } from '../../harness/flakyStorage';
import { wipeKeychain } from '../../harness/keychainFake';
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('../../harness/flakyStorage').flakyAsyncStorageModule(),
);
jest.mock('@op-engineering/op-sqlite', () => require('../../harness/flakyStorage').flakyOpSqliteModule());
jest.mock('react-native-keychain', () => require('../../harness/keychainFake').keychainModule());
jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('react-native-bootsplash', () => ({ hide: jest.fn(async () => {}) }), { virtual: true });

jest.setTimeout(60000);

const TIMEOUT = { timeout: 8000 };
const PASSPHRASE = 'correct horse';

async function bootLockedApp() {
  const boundary = installNativeBoundary({ llama: true, fs: true });
  const GB = 1024 ** 3;
  const filePath = `${boundary.fs!.DocumentDirectoryPath}/models/gemma.litertlm`;
  boundary.fs!.seedFile(filePath, 500 * 1024 * 1024);
  const { createDownloadedModel } = require('../../utils/factories');
  const model = createDownloadedModel({
    id: 'm', name: 'Test Model', engine: 'litert', fileSize: 2 * GB, filePath, fileName: 'gemma.litertlm', liteRTVision: true,
  });
  seedRow('@local_llm/downloaded_models', JSON.stringify([model]));
  seedRow('local-llm-app-storage', JSON.stringify({
    state: {
      hasCompletedOnboarding: true,
      checklistDismissed: true,
      activeModelId: 'm',
      shownSpotlights: { input: true, voiceHint: true, imageSettings: true },
    },
    version: 0,
  }));
  seedRow('local-llm-auth-storage', JSON.stringify({ state: { isEnabled: true, failedAttempts: 0, lockoutUntil: null }, version: 0 }));
  const React = require('react');
  const rtl = requireRTL();
  const { authService } = require('../../../src/services/authService');
  expect(await authService.setPassphrase(PASSPHRASE)).toBe(true);
  const App = require('../../../App').default;
  const ui = rtl.render(React.createElement(App));
  await rtl.waitFor(() => expect(ui.queryByTestId('app-loading')).toBeNull(), TIMEOUT);
  return { boundary, rtl, ui };
}

type Rtl = ReturnType<typeof requireRTL>;
type Ui = Awaited<ReturnType<typeof bootLockedApp>>['ui'];

async function unlock(rtl: Rtl, ui: Ui) {
  await rtl.waitFor(() => expect(ui.getByPlaceholderText('Enter passphrase')).toBeTruthy(), TIMEOUT);
  rtl.fireEvent.changeText(ui.getByPlaceholderText('Enter passphrase'), PASSPHRASE);
  rtl.fireEvent.press(ui.getByText('Unlock'));
  await rtl.waitFor(() => expect(ui.queryByPlaceholderText('Enter passphrase')).toBeNull(), TIMEOUT);
}

/** Unlocks at launch and opens a new chat with the composer showing. */
async function openChat() {
  const t = await bootLockedApp();
  await unlock(t.rtl, t.ui);
  t.rtl.fireEvent.press(await t.ui.findByTestId('new-chat-button', {}, TIMEOUT));
  await t.ui.findByTestId('chat-input', {}, TIMEOUT);
  return t;
}

describe('locking keeps your place (rendered)', () => {
  beforeEach(() => {
    wipeFlakyStorage();
    wipeKeychain();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('locking keeps the open chat and its draft', async () => {
    const { boundary, rtl, ui } = await openChat();
    rtl.fireEvent.changeText(ui.getByTestId('chat-input'), 'half-written');

    boundary.emitAppStateChange('background');
    boundary.emitAppStateChange('active');
    await rtl.waitFor(() => expect(ui.getByPlaceholderText('Enter passphrase')).toBeTruthy(), TIMEOUT);
    await unlock(rtl, ui);

    expect(ui.getByTestId('chat-input').props.value).toBe('half-written');
  });
});
