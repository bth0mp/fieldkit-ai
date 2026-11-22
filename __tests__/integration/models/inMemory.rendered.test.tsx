/**
 * "In memory" on the Models screen (rendered): a button beside Import Local File reads the total of every loaded model
 * and opens the models sheet, titled IN USE, with a row per kind, its memory and its eject, and Eject All Models.
 * A tap on a row closes the sheet and goes to that tab. A tab named on the way in is applied once, not on every return.
 *
 * Real AppNavigator, Home and Models screens, services and stores. Device leaves only: the llama engine, the phone's
 * files and RAM, and the Hugging Face network at `global.fetch`.
 */
import { bootHome, type ModelsAppOptions } from '../../harness/modelsApp';
import { resetDeviceMemory } from '../../harness/deviceMemory';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));


const TIMEOUT = { timeout: 4000 };
const ROWS = ['text', 'image', 'voice', 'speech'];

// The harness resets modules when it boots the app, so everything of ours is required after that.
let t: Awaited<ReturnType<typeof bootHome>>;
const stores = () => require('../../../src/stores');
const state = () => stores().useAppStore.getState();
const press = (el: any) => t.rtl.fireEvent.press(el);
const settle = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const find = (text: string) => t.rtl.waitFor(() => t.ui.getByText(text), TIMEOUT);
const textOf = (el: any): string => el.children.map((c: any) => (typeof c === 'string' ? c : textOf(c))).join('');
const gb = (el: any) => /([\d.]+) GB/.exec(textOf(el))?.[1];
const residents = (): { sizeMB: number }[] => require('../../../src/services/modelResidency').modelResidencyManager.getResidents();
const label = () => textOf(t.ui.getByTestId('in-memory-label'));
const shown = (id: string) => t.ui.queryByTestId(id) !== null;

async function boot(opts: Partial<ModelsAppOptions> = {}, backend?: string, loadText = true) {
  t = await bootHome({ totalGB: 12, imageModels: [{ id: 'sd', name: 'SD Model' }], ...opts });
  if (backend) state().updateSettings({ inferenceBackend: backend });
  const { activeModelService } = require('../../../src/services/activeModelService');
  if (loadText) await t.rtl.act(async () => { await activeModelService.loadTextModel('m'); });
  press(t.ui.getByTestId('home-phone-models'));
  await t.rtl.waitFor(() => expect(shown('in-memory-button')).toBe(true), TIMEOUT);
}

/** Picks the first Whisper model through the Transcription Models tab, then comes back to the Text tab. */
async function loadWhisper() {
  const whisper = () => require('../../../src/stores/whisperStore').useWhisperStore.getState();
  t.boundary.fs!.seedFile(`${t.boundary.fs!.DocumentDirectoryPath}/whisper-models/ggml-tiny.en.bin`, 75 * 1024 * 1024);
  press(t.ui.getByTestId('transcription-models-tab'));
  await t.rtl.waitFor(() => expect(whisper().presentModelIds.includes('tiny.en')).toBe(true), TIMEOUT);
  press(t.ui.getByTestId('transcription-model-card-0'));
  await t.rtl.waitFor(() => expect(whisper().downloadedModelId).toBe('tiny.en'), TIMEOUT);
  press(t.ui.getByText('Text Models'));
}

const openSheet = async () => {
  press(t.ui.getByTestId('in-memory-button'));
  await find('IN USE');
};

afterEach(() => resetDeviceMemory());

describe('In memory on the Models screen (rendered)', () => {
  it('"In memory: none", then the total of every loaded model', async () => {
    await boot({}, undefined, false);
    expect(label()).toBe('In memory: none');
    const { activeModelService } = require('../../../src/services/activeModelService');
    await t.rtl.act(async () => { await activeModelService.loadTextModel('m'); });
    await loadWhisper();
    const total = (residents().reduce((sum, r) => sum + r.sizeMB, 0) / 1024).toFixed(1);
    expect(residents()).toHaveLength(2);
    await t.rtl.waitFor(() => expect(label()).toBe(`In memory: ${total} GB`), TIMEOUT);
  });

  it.each(['cpu', 'opencl'])('the sheet is titled IN USE, has four rows, and its chip agrees with the button (%s backend)', async (backend) => {
    await boot({ imageModels: [] }, backend);
    await openSheet();
    expect(t.ui.getByText('IN USE')).toBeTruthy();
    expect(ROWS.every(row => shown(`models-row-${row}`))).toBe(true);
    // Only the text model is loaded.
    expect(gb(t.ui.getByTestId('in-memory-label'))).toBe(gb(t.ui.getByTestId('models-row-text-ram')));
    // The row names the loaded model, and its figure is a real number of GB (memory is not a black box).
    expect(t.rtl.within(t.ui.getByTestId('models-row-text')).getByText('Test Model')).toBeTruthy();
    expect(Number(gb(t.ui.getByTestId('models-row-text-ram')))).toBeGreaterThan(0);
  });

  it('ejecting a row frees memory and keeps the choice', async () => {
    await boot();
    await openSheet();
    press(t.ui.getByTestId('models-row-text-eject'));
    await t.rtl.waitFor(() => expect(shown('models-row-text-ram')).toBe(false), TIMEOUT);
    expect(state().activeModelId).toBe('m');
    await t.rtl.waitFor(() => expect(label()).toBe('In memory: none'), TIMEOUT);
  });

  it('Eject All asks after the sheet has closed, frees everything and keeps the choices', async () => {
    await boot();
    t.rtl.act(() => { state().setActiveImageModelId('sd'); });
    await openSheet();
    press(t.ui.getByText('Eject All Models'));
    press(await find('Eject All'));
    await t.rtl.waitFor(() => expect(label()).toBe('In memory: none'), TIMEOUT);
    expect([state().activeModelId, state().activeImageModelId]).toEqual(['m', 'sd']);
  });

  it('Eject All: Cancel keeps the model loaded; confirming says how many were unloaded', async () => {
    await boot();
    await openSheet();
    press(t.ui.getByText('Eject All Models'));
    press(await find('Cancel'));
    await settle(300);
    expect(residents()).toHaveLength(1);
    expect(state().activeModelId).toBe('m');
    await openSheet();
    press(t.ui.getByText('Eject All Models'));
    press(await find('Eject All'));
    await find('Unloaded 1 model');
    expect(residents()).toHaveLength(0);
  });

  it('Eject All that fails says so', async () => {
    await boot();
    const { activeModelService } = require('../../../src/services/activeModelService');
    // The engines swallow a context that will not release, so the failure cannot come from the device boundary.
    jest.spyOn(activeModelService, 'ejectAll').mockRejectedValueOnce(new Error('release failed'));
    await openSheet();
    press(t.ui.getByText('Eject All Models'));
    press(await find('Eject All'));
    await find('Failed to unload models');
    expect(residents()).toHaveLength(1);
  });

  it.each([['remote', true], ['local', false]])('a %s text model: the sheet cloud mark is %s', async (kind, mark) => {
    await boot();
    if (kind === 'remote') {
      const caps = { supportsVision: false, supportsToolCalling: false, supportsThinking: false };
      t.rtl.act(() => {
        stores().useRemoteServerStore.setState({
          servers: [{ id: 's1', name: 'Study PC', endpoint: 'http://localhost:1234', providerType: 'openai-compatible', createdAt: '2026-01-01T00:00:00.000Z' }],
          discoveredModels: { s1: [{ id: 'llama3', name: 'llama3', capabilities: caps }] },
          activeServerId: 's1',
          activeRemoteTextModelId: 'llama3',
        });
      });
    }
    await openSheet();
    expect(shown('models-row-text-remote')).toBe(mark);
  });

  it.each(ROWS)('tapping the %s row closes the sheet and goes to its tab', async (row) => {
    await boot();
    // Start on a tab that is none of the targets' answers, so the move is seen.
    press(t.ui.getByText('Image Models'));
    if (row === 'image') press(t.ui.getByText('Text Models'));
    await openSheet();
    press(t.ui.getByTestId(`models-row-${row}`));
    await t.rtl.waitFor(() => expect(t.ui.queryByText('IN USE') === null).toBe(true), TIMEOUT);
    await t.rtl.waitFor(() => {
      expect(shown('your-models-text')).toBe(row === 'text');
      expect(shown('your-models-image')).toBe(row === 'image');
      expect(shown('transcription-model-card-0')).toBe(row === 'speech');
    }, TIMEOUT);
  });

  it('opened on Image, switched to Text, then a trip to the Download Manager and back: still Text', async () => {
    t = await bootHome({ totalGB: 12 });
    t.rtl.act(() => { t.nav.navigate('Models', { initialTab: 'image' }); });
    await t.rtl.waitFor(() => expect(shown('your-models-image')).toBe(true), TIMEOUT);
    press(t.ui.getByText('Text Models'));
    await t.rtl.waitFor(() => expect(shown('your-models-text')).toBe(true), TIMEOUT);
    press(t.ui.getByTestId('downloads-icon'));
    await t.rtl.waitFor(() => expect(t.nav.getCurrentRoute().name).toBe('DownloadManager'), TIMEOUT);
    t.rtl.act(() => { t.nav.goBack(); });
    await t.rtl.waitFor(() => expect(t.nav.getCurrentRoute().name).toBe('Models'), TIMEOUT);
    expect(shown('your-models-text')).toBe(true);
    expect(shown('your-models-image')).toBe(false);
  });

  it('a search or tab named by a new navigation is applied again while the screen stays mounted', async () => {
    t = await bootHome({ totalGB: 12 });
    t.rtl.act(() => { t.nav.navigate('Models', { initialSearchQuery: 'qwen' }); });
    await t.rtl.waitFor(() => expect(t.ui.getByTestId('search-input').props.value).toBe('qwen'), TIMEOUT);
    t.rtl.act(() => { t.nav.navigate('Models', { initialSearchQuery: 'llama' }); });
    await t.rtl.waitFor(() => expect(t.ui.getByTestId('search-input').props.value).toBe('llama'), TIMEOUT);
    t.rtl.act(() => { t.nav.navigate('Models', { initialTab: 'image' }); });
    await t.rtl.waitFor(() => expect(shown('your-models-image')).toBe(true), TIMEOUT);
  });

  it('screen readers reach the button and hear what it shows', async () => {
    await boot();
    const button = t.ui.getByTestId('in-memory-button');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe(label());
  });
});
