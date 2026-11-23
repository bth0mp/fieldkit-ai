/**
 * Cancelling one quantization of a vision model never takes the projector the other quantizations use.
 * Q6 and Q4 of one model share a projector file; whichever of them fetched it, whether Q4 is installed or
 * still downloading, cancelling Q6 leaves the projector in place for Q4.
 */
import { installNativeBoundary, GB } from '../../harness/nativeBoundary';

const modelId = 'unsloth/gemma-3-4b-it-GGUF';
const q4 = 'gemma-3-4b-it-Q4_K_M.gguf';
const q6 = 'gemma-3-4b-it-Q6_K.gguf';
const P = '/docs/models/gemma-3-4b-it-mmproj-F16.gguf';
const projBytes = 800 * 1024 * 1024;
const file = (name: string) => ({
  name, size: 1.2 * GB, quantization: name.includes('Q4') ? 'Q4_K_M' : 'Q6_K', downloadUrl: `https://huggingface.co/x/${name}`,
  mmProjFile: { name: 'mmproj-F16.gguf', size: projBytes, downloadUrl: 'https://huggingface.co/x/mmproj-F16.gguf' },
});
const tick = () => new Promise(r => setTimeout(r, 30));

describe('cancelling a quantization keeps the projector the others share', () => {
  const run = async (opts: { q4StartsBeforeProjector: boolean; q4FinishesBeforeCancel: boolean }) => {
    const boundary: any = installNativeBoundary({ download: true, fs: true, ram: { platform: 'android', totalBytes: 12 * GB, availBytes: 8 * GB } } as any);
    const { modelManager } = require('../../../src/services/modelManager');
    const exists = (p: string) => boundary.fs.module.exists(p);
    const complete = async (row: any, localUri: string, size: number) => {
      boundary.fs.seedFile(localUri, size);
      boundary.download.events.emit('DownloadComplete', { downloadId: row.downloadId, fileName: row.fileName, modelId: row.modelId, bytesDownloaded: size, totalBytes: size, status: 'completed', localUri });
      await tick();
    };
    const sidecars = () => boundary.download.active().filter((d: any) => /mmproj/.test(d.fileName));

    const a = await modelManager.downloadModelBackground(modelId, file(q6));
    modelManager.watchDownload(a.downloadId, () => {}, () => {});
    await tick();
    const s6 = sidecars()[0];
    let b: any;
    const startQ4 = async () => {
      b = await modelManager.downloadModelBackground(modelId, file(q4));
      modelManager.watchDownload(b.downloadId, () => {}, () => {});
      await tick();
    };
    if (opts.q4StartsBeforeProjector) await startQ4();
    await complete(s6, P, projBytes);
    if (!opts.q4StartsBeforeProjector) await startQ4();
    const nSidecars = sidecars().length;
    const finishQ4 = async () => {
      if (opts.q4StartsBeforeProjector) {
        const s4 = sidecars().find((d: any) => d.downloadId !== s6.downloadId);
        await complete(s4, P, projBytes);
      }
      const row = boundary.download.active().find((d: any) => d.fileName === q4);
      await complete(row, `/docs/models/${q4}`, 1.2 * GB);
    };
    if (opts.q4FinishesBeforeCancel) await finishQ4();
    const before = await exists(P);
    await modelManager.cancelBackgroundDownload(a.downloadId);
    await tick();
    const after = await exists(P);
    if (!opts.q4FinishesBeforeCancel) await finishQ4IfNoSidecar();
    async function finishQ4IfNoSidecar() {
      const row = boundary.download.active().find((d: any) => d.fileName === q4);
      await complete(row, `/docs/models/${q4}`, 1.2 * GB);
    }
    const installed = (await modelManager.getDownloadedModels()).map((m: any) => ({ f: m.fileName, p: m.mmProjPath ?? null }));
    return { nSidecars, before, after, installed, stillThere: await exists(P) };
  };

  it('Q6 fetched the projector, Q4 linked it and is installed, then Q6 is cancelled', async () => {
    const r = await run({ q4StartsBeforeProjector: false, q4FinishesBeforeCancel: true });
    expect(r.installed.some((m: any) => m.f === q4)).toBe(true);
    expect(r.after).toBe(true);
  }, 20000);

  it('Q6 fetched the projector, Q4 linked it, Q6 is cancelled, then Q4 finishes', async () => {
    const r = await run({ q4StartsBeforeProjector: false, q4FinishesBeforeCancel: false });
    expect(r.after).toBe(true);
    expect(r.installed.find((m: any) => m.f === q4)?.p).toBe(P);
  }, 20000);

  it('both fetch their own copy, Q4 is installed, then Q6 is cancelled', async () => {
    const r = await run({ q4StartsBeforeProjector: true, q4FinishesBeforeCancel: true });
    expect(r.installed.some((m: any) => m.f === q4)).toBe(true);
    expect(r.after).toBe(true);
  }, 20000);
});
