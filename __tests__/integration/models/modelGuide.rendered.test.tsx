/**
 * The "Which model?" guide (rendered): opened from the Models Text tab, it shows the phone's memory tier, what runs
 * on each tier, and a note and fit for each model, with or without a connection.
 *
 * Real AppNavigator, Home and Models screens. Device leaves only: the Hugging Face network at `global.fetch`, the
 * phone's RAM and the connection at NetInfo.
 */
import { openModelsFromHome } from '../../harness/modelsApp';
import { resetDeviceMemory } from '../../harness/deviceMemory';
import { TEXT_NOTES } from '../../../src/features/modelGuide/notes';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const TIMEOUT = { timeout: 4000 };
const GEMMA = 'unsloth/gemma-4-E4B-it-GGUF';

let netInfoFake: { setConnected(next: boolean): void } | undefined;

afterEach(() => {
  netInfoFake?.setConnected(true);
  resetDeviceMemory();
});

async function openGuide(offline: boolean) {
  const opened = await openModelsFromHome({
    totalGB: 10.82,
    platform: 'android',
    hf: () => {
      if (!offline) return;
      ({ netInfoFake } = require('../../harness/netInfoFake'));
      netInfoFake!.setConnected(false);
    },
  });
  const { rtl, ui } = opened;
  await rtl.waitFor(() => expect(ui.getByTestId('models-guide-button')).toBeTruthy(), TIMEOUT);
  rtl.fireEvent.press(ui.getByTestId('models-guide-button'));
  await rtl.waitFor(() => expect(ui.getByTestId('model-guide-screen')).toBeTruthy(), TIMEOUT);
  return opened;
}

function expectGuideContent({ rtl, ui }: Awaited<ReturnType<typeof openGuide>>) {
  const note = rtl.within(ui.getByTestId(`guide-note-${GEMMA}`));
  expect(ui.getByText('Your phone: 12 GB memory')).toBeTruthy();
  expect(ui.getByTestId('guide-tier-12').props.accessibilityState).toEqual({ selected: true });
  expect(ui.getByTestId('guide-tier-8').props.accessibilityState?.selected).not.toBe(true);
  const tier12 = rtl.within(ui.getByTestId('guide-tier-12'));
  expect(tier12.getByText('Runs well: Gemma 4 E2B, Qwen 3.5 2B, Qwen 3.5 0.8B, SmolLM3 3B, SmolVLM2 2.2B, SmolVLM 2B, Mistral 7B')).toBeTruthy();
  expect(tier12.getByText('Tight: Gemma 4 E4B, Qwen 3.5 9B')).toBeTruthy();
  expect(note.getByText(`Good for: ${TEXT_NOTES[GEMMA].goodFor}`)).toBeTruthy();
  expect(note.getByText('Fits: 16 GB and up; tight on 8 and 12 GB')).toBeTruthy();
  expect(ui.getByText('Tight means the app may stop and offer Load Anyway. A smaller file may help.')).toBeTruthy();
  expect(ui.getByText('These labels are for the default CPU setting. The GPU or NPU setting needs about half as much memory again.')).toBeTruthy();
  expect(rtl.within(ui.getByTestId('guide-image-mnn')).getByText('GPU models')).toBeTruthy();
  expect(rtl.within(ui.getByTestId('guide-image-qnn')).getByText('NPU models')).toBeTruthy();
  expect(rtl.within(ui.getByTestId('guide-note-large-v3')).getByText('Large v3 (many languages)')).toBeTruthy();
  expect(rtl.within(ui.getByTestId('guide-note-large-v3')).getByText('Fits: 6 GB and up')).toBeTruthy();
  expect(rtl.within(ui.getByTestId('guide-note-gemma-4-E2B-it.litertlm')).getByText('Fits: 12 GB and up')).toBeTruthy();
  expect(rtl.within(ui.getByTestId('guide-note-gemma-4-E4B-it.litertlm')).getByText('Fits: 12 GB and up')).toBeTruthy();
}

describe('Which model? guide (rendered)', () => {
  it('opens from the Models screen, marks the phone tier, lists the notes, and goes back', async () => {
    const opened = await openGuide(false);
    const { rtl, ui } = opened;
    expectGuideContent(opened);
    rtl.fireEvent.press(ui.getByTestId('model-guide-back'));
    await rtl.waitFor(() => expect(ui.getByTestId('models-screen')).toBeTruthy(), TIMEOUT);
    expect(ui.queryByTestId('model-guide-screen')).toBeNull();
  });

  it('shows the same guide with no connection', async () => {
    expectGuideContent(await openGuide(true));
  });
});
