import { installNativeBoundary, requireRTL, GB } from '../../harness/nativeBoundary';

// Two pop-ups raised at the same moment are both seen, one after the other. Journey: the user taps
// two files of one model; both start. One finishes and the other fails in the same instant, so the
// "downloaded successfully" pop-up and the "Download Failed" pop-up are raised together. The user
// sees both; neither replaces the other.
const modelId = 'ibm-granite/granite-4.0-micro-GGUF';
const files = ['granite-4.0-micro-Q4_K_M.gguf', 'granite-4.0-micro-Q5_K_M.gguf'];
const fileBytes = 1.5 * GB;

describe('a finished download and a failed download', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('shows the success pop-up and the failure pop-up, one after the other', async () => {
    const boundary = installNativeBoundary({ download: true, fs: true, ram: { platform: 'ios', totalBytes: 12 * GB, availBytes: 8 * GB } });
    global.fetch = async input => {
      const url = String(input);
      const body = url.includes('/tree/main')
        ? files.map(path => ({ type: 'file', path, size: fileBytes }))
        : url.includes('search=granite')
          ? [{ id: modelId, author: 'ibm-granite', downloads: 1000, likes: 20, tags: ['gguf'] }]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    };
    const React = require('react');
    const rtl = requireRTL();
    const { registerCoreDownloadProviders } = require('../../../src/services/modelDownloadService/registerProviders');
    const { ModelsScreen } = require('../../../src/screens/ModelsScreen');
    registerCoreDownloadProviders();

    const screen = rtl.render(React.createElement(ModelsScreen, {}));
    rtl.fireEvent.changeText(screen.getByTestId('search-input'), 'granite');
    rtl.fireEvent(screen.getByTestId('search-input'), 'submitEditing');
    await rtl.waitFor(() => expect(screen.getByText('granite-4.0-micro-GGUF')).toBeTruthy());
    rtl.fireEvent.press(screen.getByText('granite-4.0-micro-GGUF'));
    await rtl.waitFor(() => expect(screen.getByTestId('file-card-1-download')).toBeTruthy());

    // Before: nothing downloading, no pop-up on screen.
    expect(boundary.download!.active()).toHaveLength(0);
    expect(screen.queryByText('Download Failed')).toBeNull();

    for (const i of [0, 1]) {
      rtl.fireEvent.press(screen.getByTestId(`file-card-${i}-download`));
      await rtl.waitFor(() => expect(boundary.download!.active()).toHaveLength(i + 1));
    }
    const [done, broken] = boundary.download!.active();

    // One download finishes while the other fails, in the same instant.
    await rtl.act(async () => {
      boundary.fs!.seedFile(`/docs/models/${done.fileName}`, fileBytes);
      boundary.download!.events.emit('DownloadComplete', {
        downloadId: done.downloadId, fileName: done.fileName, modelId: done.modelId,
        bytesDownloaded: fileBytes, totalBytes: fileBytes, status: 'completed', localUri: `/docs/models/${done.fileName}`,
      });
      boundary.download!.events.emit('DownloadError', {
        downloadId: broken.downloadId, fileName: broken.fileName, modelId: broken.modelId,
        status: 'failed', reason: 'Connection lost',
      });
      await new Promise(r => setTimeout(r, 0));
      await new Promise(r => setTimeout(r, 0));
    });

    // After: one of the two pop-ups is on screen; closing it brings the other one.
    const ready = /downloaded successfully/;
    const failed = 'Download Failed';
    await rtl.waitFor(() => expect(screen.queryByText(ready) ?? screen.queryByText(failed)).toBeTruthy());
    const readyFirst = screen.queryByText(ready) !== null;
    expect(readyFirst ? screen.queryByText(failed) : screen.queryByText(ready)).toBeNull();

    // The user closes the first pop-up with its own button.
    rtl.fireEvent.press(screen.getByText('OK'));
    await rtl.waitFor(() => expect(readyFirst ? screen.queryByText(failed) : screen.queryByText(ready)).toBeTruthy());
    expect(readyFirst ? screen.queryByText(ready) : screen.queryByText(failed)).toBeNull();

    // Closing the second leaves no pop-up.
    rtl.fireEvent.press(screen.getByText('OK'));
    await rtl.waitFor(() => expect(screen.queryByText(failed)).toBeNull());
    expect(screen.queryByText(ready)).toBeNull();
    screen.unmount();
  }, 30000);
});
