/**
 * Use on the cards that are not in "Your models" (rendered): a downloaded file in a model's file list, the Image
 * tab's own "Your models" section, and a downloaded transcription model. Use on a file or an image model marks
 * it and goes back; on a transcription model it switches and stays.
 *
 * Real AppNavigator, Home and Models screens, services and stores. Device leaves only: the Hugging Face network at
 * `global.fetch`, the llama engine, the diffusion native, the phone's RAM and the connection at NetInfo.
 */
import { bootHome, type ModelsAppOptions } from '../../harness/modelsApp';
import { resetDeviceMemory } from '../../harness/deviceMemory';
import { createDownloadedModel, createONNXImageModel } from '../../utils/factories';
import { GB } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

jest.setTimeout(40000);

const TIMEOUT = { timeout: 4000 };
const REPO = 'org/Test-GGUF';
const Q4 = 'Test-Q4_K_M.gguf';
const Q5 = 'Test-Q5_K_M.gguf';
const FIRST = { id: `${REPO}/${Q4}`, name: 'Test Model', fileName: Q4, fileSize: 1 * GB };
const SECOND = { id: `${REPO}/${Q5}`, name: 'Other Model', fileName: Q5, fileSize: 1 * GB };
const SD_ONE = { id: 'sd1', name: 'SD One', size: 1 * GB, backend: 'coreml' as const, style: '' };
const SD_TWO = { id: 'sd2', name: 'SD Two', size: 2 * GB, backend: 'coreml' as const, style: 'anime' };

// The harness resets modules when it boots the app, so everything of ours is required after that.
let t: Awaited<ReturnType<typeof bootHome>>;
const stores = () => require('../../../src/stores');
const state = () => stores().useAppStore.getState();
const whisper = () => stores().useWhisperStore.getState();
const press = (el: any) => t.rtl.fireEvent.press(el);
const settle = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** The Hugging Face fake answers the file list of REPO, and finds it by search. */
const withRepoFiles = (hf: any) => {
  hf.setList(() => [{ id: REPO, tags: ['gguf'] }]);
  const before = (global as any).fetch;
  (global as any).fetch = jest.fn(async (url: string, init?: unknown) => {
    if (!String(url).endsWith(`${REPO}/tree/main`)) return before(url, init);
    const files = [Q4, Q5].map(path => ({ type: 'file', path, size: 1 * GB }));
    return { ok: true, status: 200, json: async () => files };
  });
};

async function boot(opts: Partial<ModelsAppOptions> = {}, inUse: { text?: string; image?: string } = {}) {
  t = await bootHome({ totalGB: 12, ...opts });
  t.rtl.act(() => {
    stores().useAppStore.setState({ activeModelId: inUse.text ?? null, activeImageModelId: inUse.image ?? null });
  });
}

const openModels = async () => {
  press(t.ui.getByTestId('home-phone-models'));
  await t.rtl.waitFor(() => expect(t.ui.queryByTestId('models-screen') !== null).toBe(true), TIMEOUT);
};

const openFileList = async () => {
  await openModels();
  t.rtl.fireEvent.changeText(t.ui.getByTestId('search-input'), 'test');
  press(await t.rtl.waitFor(() => t.ui.getByText('Test-GGUF'), { timeout: 6000 }));
  await t.rtl.waitFor(() => expect(t.ui.queryByTestId('file-card-1') !== null).toBe(true), TIMEOUT);
};

const openImageTab = async () => {
  await openModels();
  press(t.ui.getByText('Image Models'));
  await t.rtl.waitFor(() => expect(t.ui.queryByTestId('your-models-image') !== null).toBe(true), TIMEOUT);
};

afterEach(() => resetDeviceMemory());

describe('Use on file, image and transcription cards (rendered)', () => {
  it('file list: a downloaded file has Use, which marks it and goes back', async () => {
    await boot({ models: [FIRST], hf: withRepoFiles });
    await openFileList();
    press(t.ui.getByTestId('file-card-0-use'));
    await t.rtl.waitFor(() => expect(t.ui.queryByTestId('models-screen') === null).toBe(true), TIMEOUT);
    await t.rtl.waitFor(() => expect(t.ui.getByTestId('model-chip-label')).toHaveTextContent('Test Model'), TIMEOUT);
  });

  it('file list: the one in use shows Active and no Use; a file that finishes downloading gains Use', async () => {
    await boot({ models: [FIRST], hf: withRepoFiles }, { text: FIRST.id });
    await openFileList();
    expect(t.ui.queryByTestId('file-card-0-use')).toBeNull();
    expect(t.rtl.within(t.ui.getByTestId('file-card-0')).getByText('Active')).toBeTruthy();
    expect(t.ui.queryByTestId('file-card-1-use')).toBeNull();
    t.rtl.act(() => { state().addDownloadedModel(createDownloadedModel({ ...SECOND, engine: 'llama' })); });
    await t.rtl.waitFor(() => expect(t.ui.queryByTestId('file-card-1-use') !== null).toBe(true), TIMEOUT);
  });

  it('file list: Use is disabled while a text model loads', async () => {
    await boot({ models: [FIRST, SECOND], hf: withRepoFiles }, { text: FIRST.id });
    await openFileList();
    const { activeModelService } = require('../../../src/services/activeModelService');
    t.boundary.llama!.holdNextInit();
    const load = activeModelService.loadTextModel(FIRST.id);
    // The card around the button has no tap of its own, so it counts as disabled for jest-native: read the button's own state.
    const disabled = () => !!t.ui.getByTestId('file-card-1-use').props.accessibilityState?.disabled;
    await t.rtl.waitFor(() => expect(disabled()).toBe(true), TIMEOUT);
    t.boundary.llama!.releaseInit();
    await t.rtl.act(() => load);
    await t.rtl.waitFor(() => expect(disabled()).toBe(false), TIMEOUT);
  });

  it('Image tab: downloaded image models with Use, quant style or "Image", x1.8 RAM hint; the one in use has Unload', async () => {
    await boot({ imageModels: [SD_ONE, SD_TWO] }, { image: 'sd1' });
    await openImageTab();
    const section = t.rtl.within(t.ui.getByTestId('your-models-image'));
    expect(section.getByText('~1.8 GB RAM')).toBeTruthy(); // 1 GB model
    expect(section.getByText('Image')).toBeTruthy(); // no style
    expect(section.getByText('anime')).toBeTruthy();
    expect(t.ui.getByLabelText('Unload SD One')).toBeTruthy();
    expect(t.ui.getByLabelText('Use SD Two')).toBeTruthy();
    expect(t.ui.queryByLabelText('Use SD One')).toBeNull();
  });

  it('Image tab: Use goes back to Home, which says an image model is in use', async () => {
    await boot({ imageModels: [SD_TWO] });
    await openImageTab();
    press(t.ui.getByLabelText('Use SD Two'));
    await t.rtl.waitFor(() => expect(t.ui.queryByTestId('models-screen') === null).toBe(true), TIMEOUT);
    expect(t.ui.getByTestId('model-chip-label')).toHaveTextContent('Image model loaded');
  });

  it('Image tab: hidden while the search box has text; shown offline; empty text with none', async () => {
    await boot({ imageModels: [SD_ONE], hf: hf => hf.setOffline(true) });
    await openImageTab(); // offline: the list of models to download fails, this section does not
    t.rtl.fireEvent.changeText(t.ui.getByPlaceholderText('Search models...'), 'zzz');
    await t.rtl.waitFor(() => expect(t.ui.queryByTestId('your-models-image') === null).toBe(true), TIMEOUT);
    t.rtl.fireEvent.changeText(t.ui.getByPlaceholderText('Search models...'), '');
    await t.rtl.waitFor(() => expect(t.ui.queryByTestId('your-models-image') !== null).toBe(true), TIMEOUT);
    t.rtl.act(() => { state().removeDownloadedImageModel('sd1'); });
    expect(t.ui.getByText('No image models yet. Download one below.')).toBeTruthy();
  });

  it('an image model appears in Your models when its download ends', async () => {
    await boot({ imageModels: [SD_ONE] });
    await openImageTab();
    t.rtl.act(() => { state().addDownloadedImageModel(createONNXImageModel({ id: 'sd3', name: 'SD Three', backend: 'coreml' })); });
    expect(t.ui.getByLabelText('Use SD Three')).toBeTruthy();
  });

  it.each([['an image', true], ['a text', false]])('Image tab: while %s model loads, Use disabled is %s', async (kind, disabled) => {
    await boot({ imageModels: [SD_ONE, SD_TWO] }, { image: 'sd1' });
    await openImageTab();
    const { activeModelService } = require('../../../src/services/activeModelService');
    let release = () => {};
    let load: Promise<void>;
    if (kind === 'an image') {
      t.boundary.diffusion.module.loadModel.mockImplementationOnce(() => new Promise<boolean>(resolve => { release = () => resolve(true); }));
      load = activeModelService.loadImageModel('sd1');
    } else {
      t.boundary.llama!.holdNextInit();
      release = () => t.boundary.llama!.releaseInit();
      load = activeModelService.loadTextModel('m');
    }
    await settle(50);
    expect(!!t.ui.getByLabelText('Use SD Two').props.accessibilityState?.disabled).toBe(disabled);
    release();
    await t.rtl.act(() => load);
  });

  it('Transcription: a downloaded model not in use has Use; tapping it keeps the screen open', async () => {
    await boot();
    const docs = t.boundary.fs!.DocumentDirectoryPath;
    for (const id of ['tiny.en', 'base.en']) t.boundary.fs!.seedFile(`${docs}/whisper-models/ggml-${id}.bin`, 100 * 1024 * 1024);
    t.rtl.act(() => { stores().useWhisperStore.setState({ downloadedModelId: 'base.en' }); });
    await openModels();
    press(t.ui.getByTestId('transcription-models-tab'));
    press(await t.rtl.waitFor(() => t.ui.getByTestId('transcription-model-card-0-use'), TIMEOUT));
    await t.rtl.waitFor(() => expect(whisper().downloadedModelId).toBe('tiny.en'), TIMEOUT);
    expect(t.ui.getByTestId('models-screen')).toBeTruthy();
  });
});
