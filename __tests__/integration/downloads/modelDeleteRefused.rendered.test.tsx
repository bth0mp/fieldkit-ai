/**
 * The real Download Manager over the real stores, download service, providers and modelManager, with
 * the phone's disk faked in memory. When the disk will not let go of a model's files, the model stays
 * listed, the screen says so, and Retry removes it once the disk allows it.
 */
import type { NativeBoundary } from '../../harness/nativeBoundary';
import { GB, installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

const KB = 1024;

interface Ctx {
  boundary: NativeBoundary;
  useAppStore: any;
  modelManager: any;
}

async function placeTextModel(ctx: Ctx, fileName: string, bytes: number) {
  const { buildDownloadedModel, persistDownloadedModel } = require('../../../src/services/modelManager/storage');
  const modelsDir = `${ctx.boundary.fs!.DocumentDirectoryPath}/${require('../../../src/constants').APP_CONFIG.modelStorageDir}`;
  const path = `${modelsDir}/${fileName}`;
  ctx.boundary.fs!.seedFile(path, bytes);
  const model = await buildDownloadedModel({
    modelId: 'author/model',
    file: { name: fileName, size: bytes, quantization: 'Q4_K_M', downloadUrl: '' },
    resolvedLocalPath: path,
  });
  await persistDownloadedModel(model, modelsDir);
  ctx.useAppStore.getState().setDownloadedModels(await ctx.modelManager.getDownloadedModels());
  return { path };
}

async function placeImageModel(ctx: Ctx, id: string, name: string, bytes: number) {
  const dir = `${ctx.modelManager.getImageModelsDirectory()}/${id}`;
  ctx.boundary.fs!.seedFile(`${dir}/unet.mnn`, bytes);
  const model = {
    id, name, description: 'Image model', modelPath: dir, downloadedAt: '2026-01-15T00:00:00.000Z',
    size: bytes, style: 'creative', backend: 'mnn',
  };
  await ctx.modelManager.addDownloadedImageModel(model);
  ctx.useAppStore.getState().addDownloadedImageModel(model);
  return { dir };
}

async function openManager(before: (ctx: Ctx) => Promise<void>) {
  const boundary = installNativeBoundary({
    download: true,
    fs: true,
    ram: { platform: 'android', totalBytes: 12 * GB, availBytes: 8 * GB },
  });
  require('@react-native-async-storage/async-storage').clear?.();
  const React = require('react');
  const rtl = requireRTL();
  require('../../../src/services/modelDownloadService/registerProviders').registerCoreDownloadProviders();
  const { useAppStore } = require('../../../src/stores');
  const { modelManager } = require('../../../src/services');
  const ctx: Ctx = { boundary, useAppStore, modelManager };
  await before(ctx);
  const { DownloadManagerScreen } = require('../../../src/screens/DownloadManagerScreen');
  const view = rtl.render(React.createElement(DownloadManagerScreen, {}));
  await view.findByTestId('downloaded-models-screen');
  return { ...ctx, rtl, view };
}

/** The disk refuses every delete until `allow()` is called. */
function refuseDeletes(boundary: NativeBoundary) {
  const unlink = boundary.fs!.module.unlink as jest.Mock;
  const real = unlink.getMockImplementation()!;
  unlink.mockImplementation(async () => { throw new Error('EBUSY'); });
  return () => unlink.mockImplementation(real);
}

describe('a model the disk will not delete (rendered)', () => {
  const REFUSED = "Couldn't remove the model files. Try again.";

  it('text model: stays listed with the message, and Retry removes it', async () => {
    let path = '';
    let allow = () => {};
    const m = await openManager(async ctx => {
      ({ path } = await placeTextModel(ctx, 'model.gguf', KB));
      allow = refuseDeletes(ctx.boundary);
    });
    m.rtl.fireEvent.press(m.view.getByTestId('delete-model-button'));
    await m.view.findByText('Delete Model');
    await m.rtl.act(async () => { m.rtl.fireEvent.press(m.view.getByText('Delete')); });

    expect(await m.view.findByText(REFUSED)).toBeTruthy();
    expect(m.view.getByText('model.gguf')).toBeTruthy();
    expect(m.useAppStore.getState().downloadedModels).toHaveLength(1);
    expect(await onDisk(m.boundary, path)).toBe(true);

    allow();
    await m.rtl.act(async () => { m.rtl.fireEvent.press(m.view.getByText('Retry')); });
    await m.rtl.waitFor(() => expect(m.view.getByText('No models downloaded yet')).toBeTruthy());
    expect(await onDisk(m.boundary, path)).toBe(false);
  });

  it('image model: stays listed with the message, and Retry removes it', async () => {
    let dir = '';
    let allow = () => {};
    const m = await openManager(async ctx => {
      ({ dir } = await placeImageModel(ctx, 'img-1', 'SD Model', 2 * KB));
      allow = refuseDeletes(ctx.boundary);
    });
    m.rtl.fireEvent.press(m.view.getByTestId('delete-model-button'));
    await m.view.findByText('Delete Image Model');
    await m.rtl.act(async () => { m.rtl.fireEvent.press(m.view.getByText('Delete')); });

    expect(await m.view.findByText(REFUSED)).toBeTruthy();
    expect(m.view.getByText('SD Model')).toBeTruthy();
    expect(m.useAppStore.getState().downloadedImageModels).toHaveLength(1);
    expect(await onDisk(m.boundary, dir)).toBe(true);

    allow();
    await m.rtl.act(async () => { m.rtl.fireEvent.press(m.view.getByText('Retry')); });
    await m.rtl.waitFor(() => expect(m.view.getByText('No models downloaded yet')).toBeTruthy());
    expect(m.useAppStore.getState().downloadedImageModels).toEqual([]);
    expect(await onDisk(m.boundary, dir)).toBe(false);
  });
});

async function onDisk(boundary: NativeBoundary, path: string): Promise<boolean> {
  return (boundary.fs!.module.exists as (p: string) => Promise<boolean>)(path);
}
