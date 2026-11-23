import { installNativeBoundary, requireRTL, GB } from '../../harness/nativeBoundary';

// Two quantizations of one vision model share one projector file. Journey: the person has the Q4 file
// and its projector on the phone, taps Download on the Q6 file (which only needs the Q6 file, the
// projector is already there) and then cancels it. The Q4 model keeps its projector.
const modelId = 'unsloth/gemma-3-4b-it-GGUF';
const q4 = 'gemma-3-4b-it-Q4_K_M.gguf';
const q6 = 'gemma-3-4b-it-Q6_K.gguf';
const projectorOnPhone = '/docs/models/gemma-3-4b-it-mmproj-F16.gguf';
const projectorBytes = 800 * 1024 * 1024;

const exists = (boundary: any, path: string) => (boundary.fs.module.exists as (p: string) => Promise<boolean>)(path);

/** Opens the Q6 file of the model, starts its download, and cancels it from the card. */
async function downloadQ6ThenCancel(boundary: any, beforeCancel?: () => Promise<void>) {
  global.fetch = async input => {
    const url = String(input);
    const body = url.includes('/tree/main')
      ? [
        { type: 'file', path: q4, size: 1.2 * GB },
        { type: 'file', path: q6, size: 1.5 * GB },
        { type: 'file', path: 'mmproj-F16.gguf', size: projectorBytes },
      ]
      : url.includes('search=gemma')
        ? [{ id: modelId, author: 'unsloth', downloads: 1000, likes: 20, tags: ['gguf'] }]
        : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  };
  const React = require('react');
  const rtl = requireRTL();
  const { registerCoreDownloadProviders } = require('../../../src/services/modelDownloadService/registerProviders');
  const { ModelsScreen } = require('../../../src/screens/ModelsScreen');
  registerCoreDownloadProviders();

  // The app root's download listeners, which route native progress into the store the cards read.
  const { useDownloadListeners } = require('../../../src/hooks/useDownloads');
  const Root = () => { useDownloadListeners(); return React.createElement(ModelsScreen, {}); };
  const screen = rtl.render(React.createElement(Root, {}));
  rtl.fireEvent.changeText(screen.getByTestId('search-input'), 'gemma');
  rtl.fireEvent(screen.getByTestId('search-input'), 'submitEditing');
  await rtl.waitFor(() => expect(screen.getByText('gemma-3-4b-it-GGUF')).toBeTruthy());
  rtl.fireEvent.press(screen.getByText('gemma-3-4b-it-GGUF'));
  await rtl.waitFor(() => expect(screen.getByText('gemma-3-4b-it-Q6_K')).toBeTruthy());

  // The person taps Download on the Q6 file, then cancels it.
  const card = screen.getAllByTestId(/^file-card-\d$/).find((node: any) => rtl.within(node).queryByText('gemma-3-4b-it-Q6_K'));
  const cardId = String(card!.props.testID);
  rtl.fireEvent.press(screen.getByTestId(`${cardId}-download`));
  await rtl.waitFor(() => expect(boundary.download.active().some((d: any) => d.fileName === q6)).toBe(true));
  const row = boundary.download.active().find((d: any) => d.fileName === q6);
  await rtl.act(async () => { await new Promise(r => setTimeout(r, 200)); });
  await rtl.act(async () => {
    boundary.download.events.emit('DownloadProgress', {
      downloadId: row.downloadId, fileName: row.fileName, modelId: row.modelId,
      bytesDownloaded: 100 * 1024 * 1024, totalBytes: row.totalBytes, status: 'running',
    });
  });
  await rtl.waitFor(() => expect(screen.getByTestId(`${cardId}-cancel`)).toBeTruthy());
  await beforeCancel?.();
  rtl.fireEvent.press(screen.getByTestId(`${cardId}-cancel`));
  await rtl.waitFor(() => expect(screen.queryByTestId(`${cardId}-cancel`)).toBeNull());
  await rtl.act(async () => { await new Promise(r => setTimeout(r, 50)); });
  screen.unmount();
}

describe('cancelling a download of a vision model', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });
  const install = () => installNativeBoundary({ download: true, fs: true, ram: { platform: 'ios', totalBytes: 12 * GB, availBytes: 8 * GB } });

  it('leaves the projector the other quantization uses when this one fetched none', async () => {
    const boundary = install();
    boundary.fs!.seedFile(`/docs/models/${q4}`, 1.2 * GB);
    boundary.fs!.seedFile(projectorOnPhone, projectorBytes);

    await downloadQ6ThenCancel(boundary);

    expect(await exists(boundary, projectorOnPhone)).toBe(true);
    expect(await exists(boundary, `/docs/models/${q4}`)).toBe(true);
  }, 30000);

  it('keeps a projector this download fetched itself, which is whole and reusable', async () => {
    const boundary = install();

    // Its own projector finishes downloading while the Q6 file is still coming.
    await downloadQ6ThenCancel(boundary, async () => {
      const sidecar = boundary.download!.active().find(d => d.fileName !== q6)!;
      boundary.fs!.seedFile(projectorOnPhone, projectorBytes);
      await requireRTL().act(async () => {
        boundary.download!.events.emit('DownloadComplete', {
          downloadId: sidecar.downloadId, fileName: sidecar.fileName, modelId: sidecar.modelId,
          bytesDownloaded: projectorBytes, totalBytes: projectorBytes, status: 'completed', localUri: projectorOnPhone,
        });
        await new Promise(r => setTimeout(r, 0));
      });
    });

    expect(await exists(boundary, projectorOnPhone)).toBe(true);
  }, 30000);
});
