/**
 * Home Downloads card (rendered): while a model downloads, Home shows one card with what is downloading and a
 * bar; it opens the Download Manager and goes away when the download finishes.
 *
 * Real HomeScreen, startModelDownload, modelManager, backgroundDownloadService and download store. Device leaves
 * only: the background-download native, the disk, and the navigation mock.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const SIZE = 1000 * 1000 * 1000;

describe('Home Downloads card (rendered)', () => {
  it('shows a model download, follows its progress, opens the manager and clears when it finishes', async () => {
    const h = await setupChatScreen({ engine: 'llama', download: true });
    const { React, rtl, boundary } = h;
    const { HomeScreen } = require('../../../src/screens/HomeScreen');
    const { useDownloadListeners } = require('../../../src/hooks/useDownloads');
    const { startModelDownload } = require('../../../src/services/startModelDownload');
    const nav = { navigate: jest.fn(), goBack: () => {}, setOptions: () => {}, addListener: () => () => {} };

    const Root = () => { useDownloadListeners(); return React.createElement(HomeScreen, { navigation: nav }); };
    const home = rtl.render(React.createElement(Root));
    expect(home.queryByTestId('home-downloads')).toBeNull();

    const file = { name: 'tiny-q4.gguf', size: SIZE, quantization: 'Q4_K_M', downloadUrl: 'https://example.test/tiny-q4.gguf' };
    await rtl.act(async () => { await startModelDownload('acme/tiny', file); });
    await rtl.waitFor(() => { expect(boundary.download!.active()).toHaveLength(1); }, { timeout: 4000 });
    const row = boundary.download!.active()[0];
    await h.settle(100);

    await rtl.waitFor(() => expect(home.getByTestId('home-downloads')).toHaveTextContent('Downloading 1 model'));

    const event = (bytes: number, status: string) => ({
      downloadId: row.downloadId, fileName: row.fileName, modelId: row.modelId,
      bytesDownloaded: bytes, totalBytes: SIZE, status,
    });
    await rtl.act(async () => { boundary.download!.events.emit('DownloadProgress', event(SIZE / 2, 'running')); });
    await rtl.waitFor(() => {
      expect(home.getByTestId('home-downloads-bar').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 50 });
    });

    rtl.fireEvent.press(home.getByTestId('home-downloads'));
    expect(nav.navigate).toHaveBeenCalledWith('DownloadManager');

    const target = `${boundary.fs!.DocumentDirectoryPath}/models/tiny-q4.gguf`;
    await rtl.act(async () => {
      boundary.fs!.seedFile(target, SIZE);
      boundary.download!.events.emit('DownloadProgress', event(SIZE, 'running'));
      boundary.download!.events.emit('DownloadComplete', { ...event(SIZE, 'completed'), localUri: target });
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });
    await rtl.waitFor(() => expect(home.queryByTestId('home-downloads')).toBeNull(), { timeout: 4000 });
  }, 30000);
});
