/**
 * One damaged row in the saved list of downloaded models (no id) must not hide x Only the device boundary is faked:
 * AsyncStorage (jest.setup's in-memory fake), the file system and the native modules.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { installHfApiFake } from '../../harness/hfApiFake';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const TIMEOUT = { timeout: 6000 };
const FILE = 'gemma-4-E2B-it.litertlm';
const GOOD_LITERT = {
  id: `fieldkit/litert-recommended/${FILE}`, name: 'Gemma 4 E2B', author: 'google', filePath: `/mock/documents/models/${FILE}`,
  fileName: FILE, fileSize: 2588147712, quantization: 'LiteRT', downloadedAt: '2026-11-01T00:00:00.000Z', engine: 'litert',
  liteRTVision: true, liteRTAudio: true, credibility: { source: 'lmstudio', isOfficial: true, isVerifiedQuantizer: false },
};
const GOOD_LLAMA = {
  id: 'acme/pine-gguf/pine-q4.gguf', name: 'Pine Test', author: 'acme', filePath: '/mock/documents/models/pine-q4.gguf',
  fileName: 'pine-q4.gguf', fileSize: 1073741824, quantization: 'Q4_K_M', downloadedAt: '2026-11-02T00:00:00.000Z',
  engine: 'llama', credibility: { source: 'community', isOfficial: false, isVerifiedQuantizer: false },
};
const ROW_WITHOUT_ID = { name: 'Damaged', filePath: '/mock/documents/models/damaged.gguf', fileName: 'damaged.gguf', fileSize: 1 };

describe('a saved model row without an id', () => {
  it('leaves the two good downloaded models counted on Home, and the Models screen opens', async () => {
    const boundary = installNativeBoundary({ download: true, fs: true });
    installHfApiFake();
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    boundary.fs!.seedFile(GOOD_LITERT.filePath, GOOD_LITERT.fileSize);
    boundary.fs!.seedFile(GOOD_LLAMA.filePath, GOOD_LLAMA.fileSize);
    await AsyncStorage.setItem('@local_llm/downloaded_models', JSON.stringify([GOOD_LLAMA, ROW_WITHOUT_ID, GOOD_LITERT]));
    await AsyncStorage.setItem('local-llm-app-storage', JSON.stringify({
      state: {
        hasCompletedOnboarding: true, checklistDismissed: true, settings: {},
        shownSpotlights: { input: true, voiceHint: true, imageSettings: true },
      },
      version: 0,
    }));

    const React = require('react');
    const rtl = requireRTL();
    const { NavigationContainer } = require('@react-navigation/native');
    const { AppNavigator } = require('../../../src/navigation/AppNavigator');
    const { useAppStore } = require('../../../src/stores');
    await require('../../../src/services/hardware').hardwareService.refreshMemoryInfo();
    await useAppStore.persist.rehydrate();
    useAppStore.getState().setDownloadedModels(await require('../../../src/services/modelManager').modelManager.getDownloadedModels());

    const ui = rtl.render(React.createElement(NavigationContainer, null, React.createElement(AppNavigator)));
    await rtl.waitFor(() => expect(ui.getByTestId('home-screen')).toBeTruthy(), TIMEOUT);
    expect(ui.getByText('2 downloaded')).toBeTruthy();

    rtl.fireEvent.press(ui.getByTestId('home-phone-models'));
    await rtl.waitFor(() => expect(ui.getByTestId('models-screen')).toBeTruthy(), TIMEOUT);
  }, 60000);
});
