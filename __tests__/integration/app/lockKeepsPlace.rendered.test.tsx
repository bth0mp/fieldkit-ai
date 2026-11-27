/**
 * Locking keeps your place, and the app's own pickers don't lock it (rendered).
 *
 * The lock is drawn over the app instead of replacing it, so the open chat and its draft are still there after
 * unlocking. A photo picker, camera, permission prompt, share sheet or document viewer the app opens is the app
 * going to another screen, not the person leaving, so it does not lock; unless they stay away over a minute.
 *
 * Real App, navigator, chat, composer, auth store, authService and LockScreen. Device leaves only: AsyncStorage,
 * the Keychain, AppState, the llama/LiteRT engines and the system image picker.
 */
import { seedRow, wipeFlakyStorage } from '../../harness/flakyStorage';
import { wipeKeychain } from '../../harness/keychainFake';
import { resetImagePicker, whileImagePickerOpen } from '../../harness/imagePickerFake';
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('../../harness/flakyStorage').flakyAsyncStorageModule(),
);
jest.mock('@op-engineering/op-sqlite', () => require('../../harness/flakyStorage').flakyOpSqliteModule());
jest.mock('react-native-keychain', () => require('../../harness/keychainFake').keychainModule());
jest.mock('react-native-image-picker', () => require('../../harness/imagePickerFake').imagePickerModule());
jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('react-native-bootsplash', () => ({ hide: jest.fn(async () => {}) }), { virtual: true });

jest.setTimeout(60000);

const TIMEOUT = { timeout: 8000 };
const PASSPHRASE = 'correct horse';
// The lock hides the app behind it from queries; a dialog is its own window, so look for it there too.
const ANY = { includeHiddenElements: true };

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
  // Before the first unlock the lock stands alone: nothing of the app is on screen.
  expect(t.ui.queryByTestId('home-screen')).toBeNull();
  expect(t.ui.queryByTestId('chats-tab')).toBeNull();
  await unlock(t.rtl, t.ui);
  t.rtl.fireEvent.press(await t.ui.findByTestId('new-chat-button', {}, TIMEOUT));
  await t.ui.findByTestId('chat-input', {}, TIMEOUT);
  return t;
}

async function attachPhoto(t: Awaited<ReturnType<typeof openChat>>) {
  t.rtl.fireEvent.press(await t.ui.findByTestId('attach-button', {}, TIMEOUT));
  t.rtl.fireEvent.press(await t.ui.findByTestId('attach-photo', {}, TIMEOUT));
  t.rtl.fireEvent.press(await t.ui.findByText('Photo Library', {}, TIMEOUT));
}

describe('locking keeps your place (rendered)', () => {
  beforeEach(() => {
    wipeFlakyStorage();
    wipeKeychain();
    resetImagePicker();
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
    // The chat is still mounted but not visible to the user while the lock shows.
    expect(ui.queryByTestId('chat-input')).toBeNull();
    expect(ui.queryByTestId('chats-tab')).toBeNull();
    await unlock(rtl, ui);

    expect(ui.getByTestId('chat-input').props.value).toBe('half-written');
  });

  it('an open attach menu does not show over the lock screen', async () => {
    const { boundary, rtl, ui } = await openChat();
    rtl.fireEvent.press(await ui.findByTestId('attach-button', {}, TIMEOUT));
    await ui.findByText('Photo', {}, TIMEOUT);

    boundary.emitAppStateChange('background');
    boundary.emitAppStateChange('active');
    await rtl.waitFor(() => expect(ui.getByPlaceholderText('Enter passphrase')).toBeTruthy(), TIMEOUT);
    expect(ui.queryByText('Photo', ANY)).toBeNull();
    expect(ui.queryByText('Document', ANY)).toBeNull();

    await unlock(rtl, ui);
    expect(ui.getByTestId('chat-input')).toBeTruthy();
  });

  it("picking a photo doesn't lock the app", async () => {
    const t = await openChat();
    whileImagePickerOpen(() => {
      t.boundary.emitAppStateChange('background');
      t.boundary.emitAppStateChange('active');
    });
    await attachPhoto(t);

    await t.rtl.waitFor(() => expect(t.ui.getByTestId('attachments-container')).toBeTruthy(), TIMEOUT);
    expect(t.ui.queryByPlaceholderText('Enter passphrase')).toBeNull();
  });

  it('a system screen left open over a minute locks on return', async () => {
    const t = await openChat();
    const start = Date.now();
    whileImagePickerOpen(() => {
      t.boundary.emitAppStateChange('background');
      jest.spyOn(Date, 'now').mockReturnValue(start + 2 * 60 * 1000);
      t.boundary.emitAppStateChange('active');
    });
    await attachPhoto(t);

    await t.rtl.waitFor(() => expect(t.ui.getByPlaceholderText('Enter passphrase')).toBeTruthy(), TIMEOUT);
    jest.restoreAllMocks();
    await unlock(t.rtl, t.ui);
    expect(t.ui.getByTestId('chat-input')).toBeTruthy();
  });

  it('a background more than 3 seconds after opening a picker locks at once', async () => {
    const t = await openChat();
    // The picker answers without the app ever leaving (a cancel, or nothing to show).
    whileImagePickerOpen(() => {});
    await attachPhoto(t);
    await t.rtl.waitFor(() => expect(t.ui.getByTestId('attachments-container')).toBeTruthy(), TIMEOUT);

    const start = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(start + 4000);
    t.boundary.emitAppStateChange('background');
    t.boundary.emitAppStateChange('active');

    await t.rtl.waitFor(() => expect(t.ui.getByPlaceholderText('Enter passphrase')).toBeTruthy(), TIMEOUT);
  });
});
