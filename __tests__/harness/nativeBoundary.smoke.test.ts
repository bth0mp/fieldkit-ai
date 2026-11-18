/**
 * Harness self-test: proves installNativeBoundary() injects the LiteRT native fake so the REAL
 * liteRTService (a construct-time singleton that destructures NativeModules.LiteRTModule at import)
 * runs on top of it — and that we can drive native events into the real service. No assertions about
 * product bugs here; this only guards the harness's injection mechanism itself.
 */
import { installNativeBoundary } from './nativeBoundary';

describe('nativeBoundary harness — injection mechanism', () => {
  it('injects LiteRTModule so the real liteRTService sees it as available and load resolves', async () => {
    const boundary = installNativeBoundary({ ram: { platform: 'android', totalBytes: 12 * 1024 ** 3, availBytes: 8 * 1024 ** 3 } });

    // Require the REAL service AFTER seeding — its module-scope `const { LiteRTModule } = NativeModules`
    // must capture our fake.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { liteRTService } = require('../../src/services/litert');

    expect(liteRTService.isAvailable()).toBe(true);

    await liteRTService.loadModel('/models/gemma.litertlm', 'gpu', { maxNumTokens: 4096 });
    expect(boundary.litert.module.loadModel).toHaveBeenCalledWith(
      '/models/gemma.litertlm', 'gpu', false, false, 4096,
    );
  });

  it('scripts a tool-call turn: the REAL service dispatches the tool call and respondToToolCall, then completes empty', async () => {
    const boundary = installNativeBoundary();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { liteRTService } = require('../../src/services/litert');
    await liteRTService.loadModel('/m', 'gpu', {});

    // Native "model" emits one calculator tool call, then a completion with NO content.
    boundary.litert.scriptTurn({ toolCalls: [{ name: 'calculator', arguments: { expression: '2+2' } }], content: '' });

    const seen: Array<{ name: string; args: Record<string, unknown> }> = [];
    const result = await liteRTService.generateRaw('what is 2+2', undefined, {
      onToolCall: async (name: string, args: Record<string, unknown>) => { seen.push({ name, args }); return '4'; },
    });

    expect(seen).toEqual([{ name: 'calculator', args: { expression: '2+2' } }]);
    expect(boundary.litert.module.respondToToolCall).toHaveBeenCalledWith('tc-0', '4');
    expect(result).toBe(''); // empty final turn — the exact Q5 precondition
  });

  it('installs a stateful FS that the REAL whisperService.listDownloadedModels reads (overrides the dumb stub)', async () => {
    const boundary = installNativeBoundary({ fs: true });
    // Seed ABOVE the MIN_MODEL_FILE_SIZE (10MB) floor — listDownloadedModels drops sub-floor
    // (truncated) files (V2), so a listable model must exceed it.
    boundary.fs!.seedFile(`${boundary.fs!.DocumentDirectoryPath}/whisper-models/ggml-base.en.bin`, 20 * 1024 * 1024);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { whisperService } = require('../../src/services/whisperService');
    const listed = await whisperService.listDownloadedModels();
    // Proves the stateful FS reached the service (the dumb global stub returns []).
    expect(listed.map((m: { modelId: string }) => m.modelId)).toEqual(['base.en']);
    expect(listed[0].sizeBytes).toBe(20 * 1024 * 1024);
  });

  describe('scripted downloads on the file-system fake', () => {
    type Rnfs = {
      downloadFile(o: {
        fromUrl: string; toFile: string; begin?: (b: { jobId: number; contentLength: number }) => void; progress?: (p: unknown) => void;
      }): { jobId: number; promise: Promise<{ jobId: number; statusCode: number; bytesWritten: number }> };
      stopDownload(jobId: number): void;
      readFile(p: string): Promise<string>;
      exists(p: string): Promise<boolean>;
      hash(p: string, algo: string): Promise<string>;
    };
    const setup = () => {
      const boundary = installNativeBoundary({ fs: true });
      return { fs: boundary.fs!, rnfs: boundary.fs!.module as unknown as Rnfs };
    };
    const sha256 = (s: string) => require('crypto').createHash('sha256').update(s).digest('hex');

    it('writes a seeded body to toFile, reports progress, resolves 200 and hashes for real', async () => {
      const { fs, rnfs } = setup();
      fs.seedDownload('https://x.test/a.pdf', 'pdf body');
      const begin = jest.fn();
      const progress = jest.fn();
      const job = rnfs.downloadFile({ fromUrl: 'https://x.test/a.pdf', toFile: '/docs/a.pdf', begin, progress });
      // Like the native module, nothing is reported before downloadFile has returned the job.
      expect(begin).not.toHaveBeenCalled();
      expect(progress).not.toHaveBeenCalled();
      const res = await job.promise;
      expect(res).toEqual({ jobId: job.jobId, statusCode: 200, bytesWritten: 8 });
      expect(begin).toHaveBeenCalledWith({ jobId: job.jobId, statusCode: 200, contentLength: 8, headers: {} });
      expect(progress).toHaveBeenCalledTimes(1);
      expect(progress).toHaveBeenCalledWith({ jobId: job.jobId, bytesWritten: 8, contentLength: 8 });
      expect(await rnfs.readFile('/docs/a.pdf')).toBe('pdf body');
      expect(await rnfs.hash('/docs/a.pdf', 'sha256')).toBe(sha256('pdf body'));
    });

    it('resolves a non-200 status without writing a file, and lets a re-seed replace it', async () => {
      const { fs, rnfs } = setup();
      fs.seedDownload('https://x.test/a.pdf', { status: 404, body: 'Not found' });
      const bad = await rnfs.downloadFile({ fromUrl: 'https://x.test/a.pdf', toFile: '/docs/a.pdf' }).promise;
      expect(bad).toEqual({ jobId: expect.any(Number), statusCode: 404, bytesWritten: 0 });
      expect(await rnfs.exists('/docs/a.pdf')).toBe(false);
      fs.seedDownload('https://x.test/a.pdf', 'good');
      const ok = await rnfs.downloadFile({ fromUrl: 'https://x.test/a.pdf', toFile: '/docs/a.pdf' }).promise;
      expect(ok.statusCode).toBe(200);
      expect(await rnfs.readFile('/docs/a.pdf')).toBe('good');
    });

    it('writes the partial text and rejects when failAfter is seeded', async () => {
      const { fs, rnfs } = setup();
      fs.seedDownload('https://x.test/a.pdf', { failAfter: 'par' });
      await expect(rnfs.downloadFile({ fromUrl: 'https://x.test/a.pdf', toFile: '/docs/a.pdf' }).promise)
        .rejects.toThrow('Network request failed');
      expect(await rnfs.readFile('/docs/a.pdf')).toBe('par');
    });

    it('gives each job its own id; stopDownload in begin rejects that job and writes nothing', async () => {
      const { fs, rnfs } = setup();
      fs.seedDownload('https://x.test/a.pdf', 'pdf body');
      const first = rnfs.downloadFile({ fromUrl: 'https://x.test/a.pdf', toFile: '/docs/first.pdf' });
      const second = rnfs.downloadFile({
        fromUrl: 'https://x.test/a.pdf', toFile: '/docs/second.pdf', begin: ({ jobId }) => rnfs.stopDownload(jobId),
      });
      expect(second.jobId).not.toBe(first.jobId);
      await expect(second.promise).rejects.toThrow('Download has been aborted');
      expect(await rnfs.exists('/docs/second.pdf')).toBe(false);
      await expect(first.promise).resolves.toMatchObject({ statusCode: 200 });
    });

    it('stopDownload in progress rejects the job after the bytes so far were written', async () => {
      const { fs, rnfs } = setup();
      fs.seedDownload('https://x.test/a.pdf', { status: 200, body: 'pdf body', contentLength: -1 });
      const begin = jest.fn();
      const job = rnfs.downloadFile({
        fromUrl: 'https://x.test/a.pdf', toFile: '/docs/a.pdf', begin, progress: () => rnfs.stopDownload(job.jobId),
      });
      await expect(job.promise).rejects.toThrow('Download has been aborted');
      expect(begin).toHaveBeenCalledWith(expect.objectContaining({ contentLength: -1 }));
      expect(await rnfs.readFile('/docs/a.pdf')).toBe('pdf body');
    });

    it('rejects an unseeded url and leaves no file', async () => {
      const { rnfs } = setup();
      await expect(rnfs.downloadFile({ fromUrl: 'https://x.test/none.pdf', toFile: '/docs/none.pdf' }).promise)
        .rejects.toThrow('Network request failed');
      expect(await rnfs.exists('/docs/none.pdf')).toBe(false);
    });

    it('reports plenty of free space until a test sets it', async () => {
      const { fs, rnfs } = setup();
      const info = (rnfs as unknown as { getFSInfo(): Promise<{ freeSpace: number }> }).getFSInfo;
      expect((await info()).freeSpace).toBeGreaterThan(1024 * 1024 * 1024);
      fs.setFreeSpace(1234);
      expect((await info()).freeSpace).toBe(1234);
    });
  });

  it('seeds the RAM leaf so DeviceMemoryModule reports the seeded free bytes', async () => {
    installNativeBoundary({ ram: { platform: 'android', totalBytes: 12 * 1024 ** 3, availBytes: 640 * 1024 * 1024 } });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RN = require('react-native');
    const info = await RN.NativeModules.DeviceMemoryModule.getMemoryInfo();
    expect(info.processAvailableBytes).toBe(640 * 1024 * 1024);
    expect(RN.Platform.OS).toBe('android');
  });
});
