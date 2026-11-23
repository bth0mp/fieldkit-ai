/**
 * Downloads an earlier version saved under its own AsyncStorage keys are still shown after an update.
 * Real hydration, queue restore and Download Manager; only the native download module, the file system
 * and AsyncStorage (jest.setup's in-memory fake) are faked.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { EARLIER_ACTIVE_DOWNLOADS_KEY, EARLIER_QUEUED_DOWNLOADS_KEY } from '../../../src/services/earlierIds';

const ACTIVE_KEY = '@fieldkit/active_downloads';
const QUEUED_KEY = '@fieldkit/queued_downloads';

const activeEntry = (modelId: string, fileName: string) => ({
  modelKey: `${modelId}/${fileName}`, downloadId: 'dl-active', modelId, fileName, quantization: 'Q4_K_M',
  modelType: 'text', status: 'running', bytesDownloaded: 1000, totalBytes: 4_000_000, combinedTotalBytes: 4_000_000,
  progress: 0.25, createdAt: 1,
});
const queuedParams = (modelId: string, fileName: string) => ({
  url: `https://example.com/${modelId}/${fileName}`, fileName, modelId, modelKey: `${modelId}/${fileName}`,
  modelType: 'text', quantization: 'Q4_K_M', totalBytes: 4_000_000, combinedTotalBytes: 4_000_000,
});

async function launch() {
  const React = require('react');
  const { render, waitFor } = requireRTL();
  const { hydrateDownloadStore } = require('../../../src/services/downloadHydration');
  const { registerCoreDownloadProviders } = require('../../../src/services/modelDownloadService/registerProviders');
  const { restoreQueuedDownloads } = require('../../../src/services/restoreQueuedDownloads');
  const { DownloadManagerScreen } = require('../../../src/screens/DownloadManagerScreen');
  await hydrateDownloadStore();
  registerCoreDownloadProviders();
  await restoreQueuedDownloads();
  return { ui: render(React.createElement(DownloadManagerScreen, {})), waitFor };
}

describe('downloads saved under an earlier version\'s keys', () => {
  it('shows an active and a queued download once, and the earlier keys are gone', async () => {
    installNativeBoundary({ download: true });
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem(EARLIER_ACTIVE_DOWNLOADS_KEY, JSON.stringify([activeEntry('org/a', 'a.gguf')]));
    await AsyncStorage.setItem(EARLIER_QUEUED_DOWNLOADS_KEY, JSON.stringify([queuedParams('org/b', 'b.gguf')]));

    const { ui, waitFor } = await launch();
    await waitFor(() => {
      expect(ui.queryAllByText(/a\.gguf/)).toHaveLength(1);
      expect(ui.queryAllByText(/b\.gguf/)).toHaveLength(1);
    });

    expect(await AsyncStorage.getItem(EARLIER_ACTIVE_DOWNLOADS_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(EARLIER_QUEUED_DOWNLOADS_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(ACTIVE_KEY)).toContain('a.gguf');
  });

  it('keeps the new key over an earlier one', async () => {
    installNativeBoundary({ download: true });
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify([activeEntry('org/new', 'new.gguf')]));
    await AsyncStorage.setItem(EARLIER_ACTIVE_DOWNLOADS_KEY, JSON.stringify([activeEntry('org/old', 'old.gguf')]));

    const { ui, waitFor } = await launch();
    await waitFor(() => expect(ui.queryAllByText(/new\.gguf/)).toHaveLength(1));
    expect(ui.queryAllByText(/old\.gguf/)).toHaveLength(0);
    expect(QUEUED_KEY).toBe('@fieldkit/queued_downloads');
  });
});
