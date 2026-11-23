/**
 * A person who updates keeps the LiteRT model they downloaded: shown as downloaded and in use, with no
 * earlier name on screen, and the chat that used it still opens with it. The saved data below is written the
 * way the earlier version wrote it (the earlier id in every place that holds a model id). Only the device
 * boundary is faked: AsyncStorage (jest.setup's in-memory fake), the file system and the native modules.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { installHfApiFake } from '../../harness/hfApiFake';
import { EARLIER_ACTIVE_DOWNLOADS_KEY, EARLIER_LITERT_AUTHOR, EARLIER_LITERT_PARENT_ID } from '../../../src/services/earlierIds';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const TIMEOUT = { timeout: 6000 };

const OLD_ID = EARLIER_LITERT_PARENT_ID;
const NEW_ID = 'fieldkit/litert-recommended';
const FILE = 'gemma-4-E2B-it.litertlm';
const PATH = `/mock/documents/models/${FILE}`;

const savedModel = {
  id: `${OLD_ID}/${FILE}`, name: 'Gemma 4 E2B', author: EARLIER_LITERT_AUTHOR, filePath: PATH, fileName: FILE,
  fileSize: 2588147712, quantization: 'LiteRT', downloadedAt: '2026-11-01T00:00:00.000Z', engine: 'litert',
  liteRTVision: true, liteRTAudio: true, credibility: { source: 'community', isOfficial: false, isVerifiedQuantizer: false },
};
const savedApp = {
  state: { activeModelId: `${OLD_ID}/${FILE}`, lastTextModelId: `${OLD_ID}/${FILE}`, hasCompletedOnboarding: true, settings: {} },
  version: 0,
};
const savedChats = {
  state: {
    activeConversationId: 'c1',
    conversations: [{
      id: 'c1', title: 'Camp stove', modelId: `${OLD_ID}/${FILE}`, createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z', projectId: null,
      messages: [{ id: 'm1', role: 'user', content: 'How do I light it?', timestamp: 1 }],
    }],
  },
  version: 0,
};

async function seed() {
  const boundary = installNativeBoundary({ download: true, fs: true });
  installHfApiFake();
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  boundary.fs!.seedFile(PATH, savedModel.fileSize);
  await AsyncStorage.setItem('@local_llm/downloaded_models', JSON.stringify([savedModel]));
  await AsyncStorage.setItem('local-llm-app-storage', JSON.stringify(savedApp));
  await AsyncStorage.setItem('local-llm-chat-storage', JSON.stringify(savedChats));
  return { boundary, AsyncStorage };
}

describe('LiteRT model downloaded by an earlier version', () => {
  it('loads as downloaded, selected, with a plain author and the chat still pointing at it', async () => {
    await seed();
    const { useAppStore } = require('../../../src/stores/appStore');
    const { useChatStore } = require('../../../src/stores/chatStore');
    const { modelManager } = require('../../../src/services/modelManager');
    await useAppStore.persist.rehydrate();
    await useChatStore.persist.rehydrate();

    const models = await modelManager.getDownloadedModels();
    expect(models.map((m: { id: string }) => m.id)).toEqual([`${NEW_ID}/${FILE}`]);
    expect(models[0].author).toBe('google');
    expect(useAppStore.getState().activeModelId).toBe(`${NEW_ID}/${FILE}`);
    expect(useAppStore.getState().lastTextModelId).toBe(`${NEW_ID}/${FILE}`);
    expect(useChatStore.getState().conversations[0].modelId).toBe(`${NEW_ID}/${FILE}`);
    expect(useChatStore.getState().conversations[0].messages[0].content).toBe('How do I light it?');
  });

  async function openApp() {
    const { AsyncStorage } = await seed();
    await AsyncStorage.setItem('local-llm-app-storage', JSON.stringify({
      state: { ...savedApp.state, checklistDismissed: true, shownSpotlights: { input: true, voiceHint: true, imageSettings: true } },
      version: 0,
    }));
    const React = require('react');
    const rtl = requireRTL();
    const { NavigationContainer } = require('@react-navigation/native');
    const { AppNavigator } = require('../../../src/navigation/AppNavigator');
    const { useAppStore, useChatStore } = require('../../../src/stores');
    await require('../../../src/services/hardware').hardwareService.refreshMemoryInfo();
    await useAppStore.persist.rehydrate();
    await useChatStore.persist.rehydrate();
    useAppStore.getState().setDownloadedModels(await require('../../../src/services/modelManager').modelManager.getDownloadedModels());

    const ui = rtl.render(React.createElement(NavigationContainer, null, React.createElement(AppNavigator)));
    await rtl.waitFor(() => expect(ui.getByTestId('home-screen')).toBeTruthy(), TIMEOUT);
    return { rtl, ui, useAppStore, useChatStore };
  }

  it('is shown on Home as in use and downloaded, and its chat opens', async () => {
    const { rtl, ui, useAppStore, useChatStore } = await openApp();
    // Home: the model in use under Assistant, and the downloaded count on the Phone card.
    await rtl.waitFor(() => expect(ui.getAllByText('Gemma 4 E2B').length).toBeGreaterThan(0), TIMEOUT);
    expect(ui.getByText('1 downloaded')).toBeTruthy();

    // The chat that used it opens, still pointing at it.
    rtl.fireEvent.press(ui.getByText('Chats'));
    await rtl.waitFor(() => expect(ui.getByText('Camp stove')).toBeTruthy(), TIMEOUT);
    rtl.fireEvent.press(ui.getByText('Camp stove'));
    await rtl.waitFor(() => expect(ui.getByText('How do I light it?')).toBeTruthy(), TIMEOUT);
    expect(useAppStore.getState().activeModelId).toBe(`${NEW_ID}/${FILE}`);
    expect(useChatStore.getState().conversations[0].modelId).toBe(useAppStore.getState().activeModelId);
    expect(useAppStore.getState().downloadedModels.map((m: { id: string }) => m.id)).toContain(useAppStore.getState().activeModelId);
  }, 60000);

  it('is marked as downloaded on the Models screen, with no earlier name', async () => {
    const { rtl, ui } = await openApp();
    rtl.fireEvent.press(await rtl.waitFor(() => ui.getByTestId('home-phone-models'), TIMEOUT));
    await rtl.waitFor(() => expect(ui.getByTestId('models-screen')).toBeTruthy(), TIMEOUT);
    rtl.fireEvent.press(await rtl.waitFor(() => ui.getByText('Gemma 4 LiteRT'), TIMEOUT));
    await rtl.waitFor(() => expect(ui.getByText('Available Files')).toBeTruthy(), TIMEOUT);
    expect(ui.getByText('✓')).toBeTruthy();
    expect(ui.queryAllByText(new RegExp(`${EARLIER_LITERT_AUTHOR}|${NEW_ID}`, 'i'))).toHaveLength(0);
  }, 60000);

  it('shows in the Download Manager without the earlier name', async () => {
    await seed();
    const React = require('react');
    const { render, waitFor } = requireRTL();
    const { useAppStore } = require('../../../src/stores/appStore');
    const { modelManager } = require('../../../src/services/modelManager');
    const { DownloadManagerScreen } = require('../../../src/screens/DownloadManagerScreen');
    await useAppStore.persist.rehydrate();
    useAppStore.getState().setDownloadedModels(await modelManager.getDownloadedModels());

    const ui = render(React.createElement(require('@react-navigation/native').NavigationContainer, null, React.createElement(DownloadManagerScreen, {})));
    await waitFor(() => expect(ui.queryAllByText(new RegExp(FILE))).toHaveLength(1));
    expect(ui.queryAllByText('google')).toHaveLength(1);
    expect(ui.queryAllByText(new RegExp(EARLIER_LITERT_AUTHOR, 'i'))).toHaveLength(0);
    expect(ui.queryAllByText(/fieldkit/i)).toHaveLength(0);
  });

  it('matches a native download row with the earlier id to its card, once', async () => {
    const { boundary, AsyncStorage } = await seed();
    const entry = {
      modelKey: `${OLD_ID}/${FILE}`, downloadId: 'dl-1', modelId: OLD_ID, fileName: FILE, quantization: 'LiteRT',
      modelType: 'text', status: 'running', bytesDownloaded: 1000, totalBytes: 2588147712, combinedTotalBytes: 2588147712,
      progress: 0.1, createdAt: 1,
    };
    await AsyncStorage.removeItem('@local_llm/downloaded_models');
    await AsyncStorage.setItem(EARLIER_ACTIVE_DOWNLOADS_KEY, JSON.stringify([entry]));
    boundary.download!.seedActive(entry as never);
    const React = require('react');
    const { render, waitFor } = requireRTL();
    const { hydrateDownloadStore } = require('../../../src/services/downloadHydration');
    const { useDownloadStore } = require('../../../src/stores/downloadStore');
    const { DownloadManagerScreen } = require('../../../src/screens/DownloadManagerScreen');
    await hydrateDownloadStore();

    expect(Object.keys(useDownloadStore.getState().downloads)).toEqual([`${NEW_ID}/${FILE}`]);
    const ui = render(React.createElement(require('@react-navigation/native').NavigationContainer, null, React.createElement(DownloadManagerScreen, {})));
    await waitFor(() => expect(ui.queryAllByText(new RegExp(FILE))).toHaveLength(1));
  });
});
