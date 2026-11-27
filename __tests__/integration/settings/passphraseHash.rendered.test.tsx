/**
 * The app lock tells passphrases apart (rendered).
 *
 * The old lock kept a 31-bit string hash, so "AaAaAa" and "BBBBBB" opened the same lock. The lock now keeps a
 * salted PBKDF2 record, and a passphrase saved by an earlier version is moved to it at the next unlock.
 *
 * Real App, Security settings, PassphraseSetupScreen, LockScreen, auth store and authService. Device leaves
 * only: AsyncStorage, the Keychain and AppState.
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
const AUTH_SERVICE = 'com.bth0mp.fieldkit.auth';
const EARLIER_AUTH_SERVICE = 'ai.offgridmobile.auth';

// Two passphrases the old hash could not tell apart ("Aa" and "BB" hash the same, so any run of them does).
const RIGHT = 'AaAaAa';
const COLLIDING = 'BBBBBB';

/** A copy of the old algorithm, as a fixture: what an earlier version saved for a passphrase. */
function oldHash(passphrase: string): string {
  let hash = 0;
  for (let i = 0; i < passphrase.length; i++) {
    hash = ((hash << 5) - hash) + (passphrase.codePointAt(i) ?? 0);
    hash &= hash;
  }
  let extended = Math.abs(hash).toString(16);
  for (let i = 0; i < 1000; i++) {
    let temp = 0;
    for (let j = 0; j < extended.length; j++) {
      temp = ((temp << 5) - temp) + (extended.codePointAt(j) ?? 0);
      temp &= temp;
    }
    extended = Math.abs(temp).toString(16) + extended.slice(0, 8);
  }
  return extended;
}

async function bootApp(lockOn: boolean) {
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
  if (lockOn) {
    seedRow('local-llm-auth-storage', JSON.stringify({ state: { isEnabled: true, failedAttempts: 0, lockoutUntil: null }, version: 0 }));
  }
  const React = require('react');
  const rtl = requireRTL();
  const App = require('../../../App').default;
  const ui = rtl.render(React.createElement(App));
  await rtl.waitFor(() => expect(ui.queryByTestId('app-loading')).toBeNull(), TIMEOUT);
  return { boundary, rtl, ui };
}

type Rtl = ReturnType<typeof requireRTL>;
type Ui = Awaited<ReturnType<typeof bootApp>>['ui'];

async function unlock(rtl: Rtl, ui: Ui, passphrase: string) {
  await rtl.waitFor(() => expect(ui.getByPlaceholderText('Enter passphrase')).toBeTruthy(), TIMEOUT);
  rtl.fireEvent.changeText(ui.getByPlaceholderText('Enter passphrase'), passphrase);
  rtl.fireEvent.press(ui.getByText('Unlock'));
}

const storedRecord = async (): Promise<string> => {
  const stored = await require('react-native-keychain').getGenericPassword({ service: AUTH_SERVICE });
  return stored ? stored.password : '';
};

describe('app lock passphrase hash (rendered)', () => {
  beforeEach(() => {
    wipeFlakyStorage();
    wipeKeychain();
  });

  it('a different passphrase with the same old hash no longer unlocks', async () => {
    const { boundary, rtl, ui } = await bootApp(false);
    expect(oldHash(RIGHT)).toBe(oldHash(COLLIDING));

    // Turn the lock on through Settings > Security.
    await rtl.waitFor(() => expect(ui.getByTestId('settings-tab')).toBeTruthy(), TIMEOUT);
    rtl.fireEvent.press(ui.getByTestId('settings-tab'));
    await rtl.waitFor(() => expect(ui.getByTestId('settings-tab')).toBeSelected(), TIMEOUT);
    rtl.fireEvent.press(await ui.findByText('Security', {}, TIMEOUT));
    await ui.findByText('Require passphrase to open app', {}, TIMEOUT);
    rtl.fireEvent(ui.UNSAFE_getByType(require('react-native').Switch), 'valueChange', true);
    rtl.fireEvent.changeText(await ui.findByPlaceholderText('Enter passphrase (min 6 characters)', {}, TIMEOUT), RIGHT);
    rtl.fireEvent.changeText(ui.getByPlaceholderText('Re-enter passphrase'), RIGHT);
    rtl.fireEvent.press(ui.getByText('Enable Lock'));
    await rtl.waitFor(async () => expect(await storedRecord()).not.toBe(''), TIMEOUT);

    // Leave the app and come back: the lock shows.
    boundary.emitAppStateChange('background');
    boundary.emitAppStateChange('active');
    await unlock(rtl, ui, COLLIDING);
    await rtl.waitFor(() => expect(ui.getByText('Incorrect Passphrase')).toBeTruthy(), TIMEOUT);
    expect(ui.queryByTestId('home-screen')).toBeNull();
    expect(ui.queryByTestId('settings-tab')).toBeNull();

    rtl.fireEvent.press(ui.getByText('OK'));
    await unlock(rtl, ui, RIGHT);
    await rtl.waitFor(() => expect(ui.getByTestId('settings-tab')).toBeTruthy(), TIMEOUT);
    expect(ui.queryByPlaceholderText('Enter passphrase')).toBeNull();
  });

  it('a passphrase saved by an earlier version unlocks once and is moved to the new hash', async () => {
    const Keychain = require('react-native-keychain');
    await Keychain.setGenericPassword('passphrase_hash', oldHash(RIGHT), { service: EARLIER_AUTH_SERVICE });
    const { boundary, rtl, ui } = await bootApp(true);

    await unlock(rtl, ui, RIGHT);
    await rtl.waitFor(() => expect(ui.getByTestId('settings-tab')).toBeTruthy(), TIMEOUT);
    await rtl.waitFor(async () => expect(await storedRecord()).toMatch(/^pbkdf2-sha256\$/), TIMEOUT);

    boundary.emitAppStateChange('background');
    boundary.emitAppStateChange('active');
    await unlock(rtl, ui, COLLIDING);
    await rtl.waitFor(() => expect(ui.getByText('Incorrect Passphrase')).toBeTruthy(), TIMEOUT);
    expect(ui.queryByTestId('settings-tab')).toBeNull();
  });
});
