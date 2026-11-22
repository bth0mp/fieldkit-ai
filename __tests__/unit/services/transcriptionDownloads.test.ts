/**
 * Transcription model downloads.
 *
 * A transcription model whose download fails mid-session stays in the Download Manager as failed, with
 * Retry. It used to vanish: the download's cleanup removed its row whatever the outcome, so there was
 * nothing left to retry. A stale download must also never delete the file of a newer one.
 *
 * The device is the boundary: the native background downloader (a transfer fails, finishes or is
 * cancelled there) and the disk. The transcription service, the download service with its providers and
 * the download store run for real.
 */
import RNFS from 'react-native-fs';

const MODEL = 'tiny.en';
const ID = `stt:${MODEL}`;
const SIZE = 75 * 1024 * 1024;
const PATH = '/mock/documents/whisper-models/ggml-tiny.en.bin';

type Transfer = { downloadId: string; resolve: () => void; reject: (e: unknown) => void };
type Row = { id: string; status: string; error?: string; capabilities: { retry: boolean } };

const mockTransfers: Transfer[] = [];
let disk: Set<string>;

jest.mock('../../../src/services/backgroundDownloadService', () => ({
  backgroundDownloadService: {
    isAvailable: jest.fn(() => true),
    downloadFileTo: jest.fn(() => {
      const downloadId = `native-${mockTransfers.length + 1}`;
      let resolve = () => {};
      let reject = (_e: unknown) => {};
      const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
      mockTransfers.push({ downloadId, resolve, reject });
      return { downloadIdPromise: Promise.resolve(downloadId), promise };
    }),
    cancelDownload: jest.fn(() => Promise.resolve()),
  },
}));

let downloads: { list(): Promise<Row[]>; retry(id: string): Promise<void>; cancel(id: string): Promise<void> };
let whisperService: typeof import('../../../src/services/whisperService').whisperService;
const settle = () => new Promise<void>(r => setImmediate(r));
const row = async () => (await downloads.list()).find(d => d.id === ID);
const outcome = (p: Promise<unknown>) => p.then(() => null, (e: Error) => e);

beforeEach(() => {
  mockTransfers.length = 0;
  disk = new Set(['/mock/documents/whisper-models']);
  (RNFS.exists as jest.Mock).mockImplementation((p: string) => Promise.resolve(disk.has(p)));
  (RNFS.unlink as jest.Mock).mockImplementation((p: string) => { disk.delete(p); return Promise.resolve(); });
  (RNFS.stat as jest.Mock).mockResolvedValue({ size: SIZE, isFile: () => true });
  jest.isolateModules(() => {
    require('../../../src/services/modelDownloadService/registerProviders').registerCoreDownloadProviders();
    ({ modelDownloadService: downloads } = require('../../../src/services/modelDownloadService'));
    ({ whisperService } = require('../../../src/services/whisperService'));
  });
});

it('keeps a failed transcription download with Retry, and Retry completes it', async () => {
  const first = outcome(whisperService.downloadModel(MODEL));
  await settle();
  mockTransfers[0].reject(new Error('connection reset'));

  expect((await first)?.message).toBe('connection reset');
  expect(await row()).toEqual(
    expect.objectContaining({ status: 'error', error: 'connection reset', capabilities: expect.objectContaining({ retry: true }) }),
  );

  await downloads.retry(ID);
  await settle();
  expect(mockTransfers).toHaveLength(2);
  disk.add(PATH);
  mockTransfers[1].resolve();
  await settle();

  expect(await whisperService.isModelDownloaded(MODEL)).toBe(true);
  expect((await row())?.status).not.toBe('error');
});

it('a cancelled transcription download leaves no row', async () => {
  const first = outcome(whisperService.downloadModel(MODEL));
  await settle();
  await downloads.cancel(ID);
  mockTransfers[0].reject(Object.assign(new Error('cancelled'), { cancelled: true }));
  await first;
  await settle();
  expect(await row()).toBeUndefined();
});

it('a stale download does not delete the file of the one that replaced it', async () => {
  const stale = outcome(whisperService.downloadModel(MODEL));
  await settle();
  // The user cancels, then starts the model again; the newer download finishes.
  await downloads.cancel(ID);
  const newer = outcome(whisperService.downloadModel(MODEL));
  await settle();
  expect(mockTransfers).toHaveLength(2);
  disk.add(PATH);
  mockTransfers[1].resolve();
  expect(await newer).toBeNull();

  // The cancelled download's native transfer only now reports back.
  mockTransfers[0].reject(Object.assign(new Error('cancelled'), { cancelled: true }));
  await stale;
  await settle();

  expect(disk.has(PATH)).toBe(true);
});
