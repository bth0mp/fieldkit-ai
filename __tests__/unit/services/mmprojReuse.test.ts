/**
 * A vision projector already on the phone under the name older versions gave it is reused, not fetched
 * again, by both the normal download and the vision repair, unless it is partial.
 */
import RNFS from 'react-native-fs';
import { performBackgroundDownload, performMmProjRepairDownload } from '../../../src/services/modelManager/download';
import { backgroundDownloadService } from '../../../src/services/backgroundDownloadService';
import { mmProjBelongsToModel } from '../../../src/services/mmproj';
import { createModelFileWithMmProj } from '../../utils/factories';

jest.mock('../../../src/services/huggingface', () => ({
  huggingFaceService: { getDownloadUrl: jest.fn((m: string, f: string) => `https://hf/${m}/${f}`) },
}));
jest.mock('../../../src/services/backgroundDownloadService', () => ({
  backgroundDownloadService: {
    isAvailable: jest.fn(() => true),
    startDownload: jest.fn(),
    cancelDownload: jest.fn(() => Promise.resolve()),
    onProgress: jest.fn(() => jest.fn()),
    onComplete: jest.fn(() => jest.fn()),
    onError: jest.fn(() => jest.fn()),
    startProgressPolling: jest.fn(),
    moveCompletedDownload: jest.fn(),
  },
}));

const rnfs = RNFS as jest.Mocked<typeof RNFS>;
const service = backgroundDownloadService as jest.Mocked<typeof backgroundDownloadService>;
const DIR = '/mock/documents/models';
const OLD = 'smolvlm-256m-instruct-mmproj-SmolVLM-256M-Instruct-f16.gguf';
const MMPROJ_BYTES = 500_000_000;

function visionFile() {
  return createModelFileWithMmProj({
    name: 'SmolVLM-256M-Instruct-Q8_0.gguf', size: 4_000_000_000, quantization: 'Q8_0',
    mmProjName: 'mmproj-SmolVLM-256M-Instruct-f16.gguf', mmProjSize: MMPROJ_BYTES,
    mmProjDownloadUrl: 'https://hf/mmproj',
  });
}

function phoneHas(files: Record<string, number>) {
  rnfs.exists.mockImplementation(async (p: string) => Object.keys(files).some(n => p === `${DIR}/${n}`));
  rnfs.stat.mockImplementation(async (p: string) => ({ size: files[p.split('/').pop() as string] ?? 0, isFile: () => true }) as any);
  rnfs.readDir.mockResolvedValue(Object.entries(files).map(([name, size]) => ({
    name, path: `${DIR}/${name}`, size, isFile: () => true, isDirectory: () => false,
  })) as any);
}

beforeEach(() => {
  jest.clearAllMocks();
  service.startDownload.mockImplementation(async (p: any) => ({
    downloadId: p.fileName.includes('mmproj') ? '2' : '1', fileName: p.fileName, modelId: p.modelId, status: 'pending',
    bytesDownloaded: 0, totalBytes: p.totalBytes ?? 0, startedAt: Date.now(),
  }) as any);
});

describe('performBackgroundDownload with a projector under the old name', () => {
  const run = () => performBackgroundDownload({
    modelId: 'ggml-org/SmolVLM-256M-Instruct-GGUF', file: visionFile(), modelsDir: DIR,
    backgroundDownloadContext: new Map(), backgroundDownloadMetadataCallback: jest.fn(),
  });

  it('does not fetch the projector again and links the old file', async () => {
    phoneHas({ [OLD]: MMPROJ_BYTES });
    const ctx = new Map<string, any>();
    const info = await performBackgroundDownload({
      modelId: 'ggml-org/SmolVLM-256M-Instruct-GGUF', file: visionFile(), modelsDir: DIR,
      backgroundDownloadContext: ctx, backgroundDownloadMetadataCallback: jest.fn(),
    });
    const fetched = service.startDownload.mock.calls.map((c: any[]) => c[0].fileName);
    expect(fetched).toEqual(['SmolVLM-256M-Instruct-Q8_0.gguf']);
    expect(ctx.get(info.downloadId).mmProjLocalPath).toBe(`${DIR}/${OLD}`);
  });

  it('fetches it when the old file is partial, and leaves the partial file alone', async () => {
    phoneHas({ [OLD]: MMPROJ_BYTES - 1 });
    await run();
    const fetched = service.startDownload.mock.calls.map((c: any[]) => c[0].fileName);
    expect(fetched).toContain('smolvlm-256m-instruct-mmproj-f16.gguf');
    expect(rnfs.unlink).not.toHaveBeenCalledWith(`${DIR}/${OLD}`);
  });

  it('does not reuse another model\'s projector', async () => {
    phoneHas({ 'gemma-4-e2b-it-mmproj-F16.gguf': MMPROJ_BYTES });
    await run();
    expect(service.startDownload).toHaveBeenCalledTimes(2);
  });
});

describe('performMmProjRepairDownload with a projector under the old name', () => {
  it('returns the complete old file without fetching', async () => {
    phoneHas({ [OLD]: MMPROJ_BYTES });
    const path = await performMmProjRepairDownload({ modelId: 'ggml-org/SmolVLM-256M-Instruct-GGUF', file: visionFile(), modelsDir: DIR });
    expect(path).toBe(`${DIR}/${OLD}`);
    expect(service.startDownload).not.toHaveBeenCalled();
  });
});

describe('UD packaging', () => {
  it('a projector with no precision still belongs to its UD-quant model', () => {
    expect(mmProjBelongsToModel('foo-UD-Q4_K_XL.gguf', 'foo-ud-mmproj.gguf')).toBe(true);
    expect(mmProjBelongsToModel('foo-UD-Q4_K_XL.gguf', 'foo-mmproj-F16.gguf')).toBe(true);
  });
});

describe('a model file is never taken for its projector', () => {
  it('fetches the projector when only the model itself is on the phone', async () => {
    phoneHas({ 'SmolVLM-256M-Instruct-Q4_K_M.gguf': MMPROJ_BYTES * 4 });
    const path = performMmProjRepairDownload({ modelId: 'ggml-org/SmolVLM-256M-Instruct-GGUF', file: visionFile(), modelsDir: DIR });
    path.catch(() => {});
    await new Promise(r => setImmediate(r));
    expect(service.startDownload).toHaveBeenCalledTimes(1);
  });
});
