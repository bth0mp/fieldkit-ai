/**
 * Choosing a model from Home (rendered): the model chip and the setup card open the Models screen (Text, or Image
 * when only an image model is in use), where Use marks the model and comes back to Home. Home starts no load: a
 * load started elsewhere shows only as the chip's spinner, and Home still takes taps.
 *
 * Real AppNavigator, Home and Models screens, services and stores. Device leaves only: the Hugging Face network at
 * `global.fetch`, the llama engine, the phone's RAM and the connection at NetInfo.
 */
import { ActivityIndicator } from 'react-native';
import { bootHome, type ModelsAppOptions } from '../../harness/modelsApp';
import { resetDeviceMemory } from '../../harness/deviceMemory';
import { GB } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

jest.setTimeout(40000);

const TIMEOUT = { timeout: 4000 };
const FIRST = { id: 'first', name: 'First', fileSize: 1 * GB };
const SECOND = { id: 'second', name: 'Second', fileSize: 1 * GB };
const SD_ONE = { id: 'sd1', name: 'SD One', size: 1 * GB, backend: 'coreml' as const, style: '' };

// The harness resets modules when it boots the app, so everything of ours is required after that.
let t: Awaited<ReturnType<typeof bootHome>>;
const stores = () => require('../../../src/stores');
const press = (el: any) => t.rtl.fireEvent.press(el);
const shown = (id: string) => t.ui.queryByTestId(id) !== null;
const spinners = () => t.rtl.within(t.ui.getByTestId('models-summary')).UNSAFE_queryAllByType(ActivityIndicator).length;

async function boot(opts: Partial<ModelsAppOptions>, inUse: { text?: string; image?: string } = {}) {
  t = await bootHome({ totalGB: 12, ...opts });
  t.rtl.act(() => { stores().useAppStore.setState({ activeModelId: inUse.text ?? null, activeImageModelId: inUse.image ?? null }); });
}

afterEach(() => resetDeviceMemory());

describe('Choosing a model from Home (rendered)', () => {
  it('the chip opens Models on Text, and Use comes back with the new name: two taps', async () => {
    await boot({ models: [FIRST, SECOND] }, { text: 'first' });
    expect(t.ui.getByTestId('model-chip-label')).toHaveTextContent('First');
    press(t.ui.getByTestId('models-summary'));
    await t.rtl.waitFor(() => expect(shown('your-models-text')).toBe(true), TIMEOUT);
    press(t.ui.getByLabelText('Use Second'));
    await t.rtl.waitFor(() => expect(t.ui.getByTestId('model-chip-label')).toHaveTextContent('Second'), TIMEOUT);
    expect(shown('models-screen')).toBe(false);
  });

  it('Use marks a model without loading it or asking about memory; the load waits for the first message', async () => {
    await boot({ models: [FIRST, SECOND], imageModels: [SD_ONE] }, { text: 'first' });
    const { activeModelService } = require('../../../src/services/activeModelService');
    press(t.ui.getByTestId('models-summary'));
    await t.rtl.waitFor(() => expect(shown('your-models-text')).toBe(true), TIMEOUT);
    press(t.ui.getByLabelText('Use Second'));
    await t.rtl.waitFor(() => expect(t.ui.getByTestId('model-chip-label')).toHaveTextContent('Second'), TIMEOUT);
    expect(stores().useAppStore.getState().lastTextModelId).toBe('second');
    press(t.ui.getByTestId('models-summary'));
    press(await t.rtl.waitFor(() => t.ui.getByText('Image Models'), TIMEOUT));
    press(await t.rtl.waitFor(() => t.ui.getByLabelText('Use SD One'), TIMEOUT));
    await t.rtl.waitFor(() => expect(stores().useAppStore.getState().activeImageModelId).toBe('sd1'), TIMEOUT);
    expect(activeModelService.getActiveModels().text.isLoaded).toBe(false);
    expect(activeModelService.getActiveModels().image.isLoaded).toBe(false);
    expect(t.boundary.llama!.module.initLlama).not.toHaveBeenCalled();
    for (const words of ['Insufficient Memory', 'Low Memory Warning', 'Load Anyway']) expect(t.ui.queryByText(words) === null).toBe(true);
  });

  it('with only an image model in use the chip opens Image', async () => {
    await boot({ models: [FIRST], imageModels: [SD_ONE] }, { image: 'sd1' });
    press(t.ui.getByTestId('models-summary'));
    await t.rtl.waitFor(() => expect(shown('your-models-image')).toBe(true), TIMEOUT);
    expect(shown('your-models-text')).toBe(false);
  });

  it.each([['Select Model', 1], ['Browse Models', 0]])('setup card "%s" (%d models) opens Models on Text', async (label, count) => {
    // The app opens its download screen with no model, so the phone starts with one and loses it once Home is up.
    await boot({ models: [FIRST] });
    if (!count) {
      const storage = require('@react-native-async-storage/async-storage');
      await (storage.default ?? storage).setItem('@local_llm/downloaded_models', '[]');
      t.rtl.act(() => { stores().useAppStore.setState({ downloadedModels: [] }); });
    }
    expect(t.rtl.within(t.ui.getByTestId('setup-card')).getByText(label)).toBeTruthy();
    press(t.ui.getByTestId('browse-models-button'));
    await t.rtl.waitFor(() => expect(shown('your-models-text')).toBe(true), TIMEOUT);
  });

  it('the chip spins while a model loads, and Home still takes taps', async () => {
    await boot({ models: [FIRST] }, { text: 'first' });
    const { activeModelService } = require('../../../src/services/activeModelService');
    expect(spinners()).toBe(0);
    t.boundary.llama!.holdNextInit();
    const load = activeModelService.loadTextModel('first');
    await t.rtl.waitFor(() => expect(spinners()).toBe(1), TIMEOUT);
    expect(t.ui.getByTestId('models-summary').props.accessibilityLabel).toMatch(/loading/);
    press(t.ui.getByTestId('models-summary'));
    await t.rtl.waitFor(() => expect(shown('models-screen')).toBe(true), TIMEOUT);
    t.boundary.llama!.releaseInit();
    await t.rtl.act(() => load);
  });

  it('a screen reader hears that the chip opens the Models screen', async () => {
    await boot({ models: [FIRST] }, { text: 'first' });
    const chip = t.ui.getByTestId('models-summary');
    expect(chip.props.accessibilityRole).toBe('button');
    expect(chip.props.accessibilityLabel).toBe('First. Opens Models');
  });

  it('"Load your image model" names Image Models', () => {
    const { createSpotlightSteps } = require('../../../src/components/onboarding/spotlightConfig');
    const text = (i: number) => createSpotlightSteps()[i].render({ stop: () => {} }).props.description;
    expect(text(13)).toMatch(/Image Models/);
    expect(text(1)).toMatch(/Models screen/);
  });
});
