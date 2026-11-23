/**
 * Numbers and notes from the original page (rendered): image and Whisper files come from repos with no downloads of
 * their own, so each card shows the downloads and likes of the model it was converted from, names that page, and
 * keeps the run answer and notes when the page cannot be reached.
 *
 * Real AppNavigator, Home and Models screens, services and stores. Device leaves only: the Hugging Face network at
 * `global.fetch`, the llama engine, the diffusion native, the phone's RAM and the connection at NetInfo.
 */
import { openModelsFromHome } from '../../harness/modelsApp';
import { resetDeviceMemory } from '../../harness/deviceMemory';
import { GB } from '../../harness/nativeBoundary';
import { IMAGE_NOTES } from '../../../src/features/modelGuide/notes';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const TIMEOUT = { timeout: 4000 };
const DREAM = 'Lykon/dreamshaper-8';
const TURBO = 'openai/whisper-large-v3-turbo';
const NOTICE = 'Needs a connection to search, sort or show download numbers.';
const entry = (path: string, size: number) => ({ type: 'file', path, size });
const details = (id: string, downloads: number, likes: number) => ({
  id, downloads, likes, lastModified: new Date(Date.now() - 3 * 86400000).toISOString(),
});

// The card's visible text, top to bottom.
const textsOf = (card: any): string[] => card.UNSAFE_getAllByType(require('react-native').Text)
  .flatMap((n: any) => [n.props.children].flat().filter((c: unknown) => typeof c === 'string'));
const expectOrder = (card: any, lines: Array<string | RegExp>) => {
  const texts = textsOf(card);
  const at = lines.map(l => texts.findIndex(t => (typeof l === 'string' ? t === l : l.test(t))));
  expect(at.every(i => i >= 0)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
};

let netInfoFake: { setConnected(next: boolean): void };
afterEach(() => {
  netInfoFake?.setConnected(true);
  resetDeviceMemory();
});

async function openImages() {
  const opened = await openModelsFromHome({
    totalGB: 12,
    hf: hf => {
      ({ netInfoFake } = require('../../harness/netInfoFake'));
      const deviceInfo = require('react-native-device-info');
      (deviceInfo.default ?? deviceInfo).getHardware.mockResolvedValue('qcom');
      require('react-native').NativeModules.LocalDreamModule.getSoCModel = jest.fn(async () => 'SM8450');
      hf.setTree('xororz/sd-mnn', [entry('DreamShaperV8.zip', GB), entry('AnythingV5.zip', GB)]);
      hf.setTree('xororz/sd-qnn', [entry('DreamShaperV8_qnn2.28_8gen2.zip', GB)]);
      hf.setDetails({ [DREAM]: details(DREAM, 1234567, 2300), [TURBO]: details(TURBO, 4500000, 1500) });
    },
  });
  const { rtl, ui } = opened;
  rtl.fireEvent.press(ui.getByText('Image Models'));
  await rtl.waitFor(() => expect(ui.getByText(/NPU models supported/)).toBeTruthy(), TIMEOUT);
  rtl.fireEvent.press(ui.getByTestId('rec-toggle'));
  await rtl.waitFor(() => expect(ui.getByText('Anything V5 (GPU)')).toBeTruthy(), TIMEOUT);
  const cardOf = (name: string) => {
    const card = ui.root.findAll((n: any) => typeof n.type === 'string' && /^image-model-card-\d+$/.test(n.props.testID ?? ''))
      .find((n: any) => rtl.within(n).queryAllByText(name).length > 0);
    if (!card) throw new Error(`no card for ${name}`);
    return rtl.within(card);
  };
  return { ...opened, cardOf };
}

describe('Numbers and notes from the original page (rendered)', () => {
  it('Image: every variant of a mapped name shows the original page, its numbers and the note; an unmapped name shows none', async () => {
    const { hf, cardOf, rtl, ui } = await openImages();
    const note = IMAGE_NOTES.find(n => n.name === 'DreamShaperV8')!.goodFor;
    for (const name of ['Dream Shaper V8 (GPU)', 'Dream Shaper V8 (NPU 8gen2)']) {
      await rtl.waitFor(() => expect(cardOf(name).getByText(`Original: ${DREAM}`)).toBeTruthy(), TIMEOUT);
      await rtl.waitFor(() => expect(cardOf(name).getByText('1.2M downloads this month')).toBeTruthy(), TIMEOUT);
      expect(cardOf(name).getByText('2.3K likes · updated 3 days ago')).toBeTruthy();
      expect(cardOf(name).getByText(`Good for: ${note}`)).toBeTruthy();
      // The run answer, then Original, then the numbers, then Good for.
      expectOrder(cardOf(name), [/^(Runs on this phone|Tight|Won't run)/, `Original: ${DREAM}`, '1.2M downloads this month', '2.3K likes · updated 3 days ago', `Good for: ${note}`]);
    }
    expect(hf.requests().filter(u => u.pathname === `/api/models/${DREAM}`)).toHaveLength(1);

    expect(ui.queryByText(NOTICE)).toBeNull();
    const plain = cardOf('Anything V5 (GPU)');
    expect(plain.queryByText(/Original:/)).toBeNull();
    expect(plain.queryByText(/downloads|likes/)).toBeNull();
    expect(plain.queryByText(/Good for:/)).toBeNull();
  });

  it('Whisper: the Large v3 Turbo card shows its original page and numbers', async () => {
    const { rtl, ui } = await openModelsFromHome({
      totalGB: 12,
      hf: hf => hf.setDetails({ [TURBO]: details(TURBO, 4500000, 1500) }),
    });
    rtl.fireEvent.press(ui.getByTestId('transcription-models-tab'));
    const card = await rtl.waitFor(() => {
      const found = ui.root.findAll((n: any) => typeof n.type === 'string' && /^transcription-model-card-\d+$/.test(n.props.testID ?? ''))
        .find((n: any) => rtl.within(n).queryAllByText('Large v3 Turbo').length > 0);
      if (!found) throw new Error('no card');
      return rtl.within(found);
    }, TIMEOUT);
    await rtl.waitFor(() => expect(card.getByText(`Original: ${TURBO}`)).toBeTruthy(), TIMEOUT);
    await rtl.waitFor(() => expect(card.getByText('4.5M downloads this month')).toBeTruthy(), TIMEOUT);
    expect(card.getByText('1.5K likes · updated 3 days ago')).toBeTruthy();
    expectOrder(card, [/^(Runs on this phone|Tight|Won't run)/, `Original: ${TURBO}`, '4.5M downloads this month', '1.5K likes · updated 3 days ago']);
  });

  it('with no connection: no numbers, no undefined or NaN, the run answer and notes stay, and the notice shows', async () => {
    const { rtl, ui } = await openModelsFromHome({
      totalGB: 12,
      hf: hf => {
        ({ netInfoFake } = require('../../harness/netInfoFake'));
        netInfoFake.setConnected(false);
        hf.setOffline(true);
      },
    });
    rtl.fireEvent.press(ui.getByTestId('transcription-models-tab'));
    const tiny = await rtl.waitFor(() => rtl.within(ui.getByTestId('transcription-model-card-0')), TIMEOUT);
    await new Promise(r => setTimeout(r, 500)); // let the failing detail requests settle
    expect(tiny.getByText('Original: openai/whisper-tiny.en')).toBeTruthy();
    expect(tiny.getByText(/^Good for: /)).toBeTruthy();
    expect(tiny.getByText('Runs on this phone')).toBeTruthy();
    expect(ui.getByText(NOTICE)).toBeTruthy();
    const texts = ui.UNSAFE_getAllByType(require('react-native').Text)
      .flatMap((n: any) => [n.props.children].flat().filter((c: unknown) => typeof c === 'string')) as string[];
    expect(texts.join('\n')).not.toMatch(/undefined|NaN|downloads this month|likes/);
  });
});
