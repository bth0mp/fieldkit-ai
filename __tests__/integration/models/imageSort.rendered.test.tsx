/**
 * Sorting the image tab (rendered): Popular, Most liked, Newest and Size reorder the cards by the original page's
 * numbers or by file size. Models with no numbers sit last under the first three; nothing is selected until a tap.
 *
 * Real AppNavigator, Home and Models screens, services and stores. Device leaves only: the Hugging Face network at
 * `global.fetch`, the llama engine, the diffusion native, the phone's RAM and the connection at NetInfo.
 */
import { openModelsFromHome } from '../../harness/modelsApp';
import { resetDeviceMemory } from '../../harness/deviceMemory';
import { GB } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const TIMEOUT = { timeout: 4000 };
const entry = (path: string, size: number) => ({ type: 'file', path, size });
const details = (id: string, downloads: number, likes: number, createdAt: string) => ({ id, downloads, likes, createdAt });

afterEach(() => resetDeviceMemory());

async function openImages() {
  const opened = await openModelsFromHome({
    totalGB: 12,
    hf: hf => {
      const deviceInfo = require('react-native-device-info');
      (deviceInfo.default ?? deviceInfo).getHardware.mockResolvedValue('qcom');
      require('react-native').NativeModules.LocalDreamModule.getSoCModel = jest.fn(async () => 'SM8450');
      hf.setTree('xororz/sd-mnn', [
        entry('AbsoluteReality.zip', GB), entry('AnythingV5.zip', GB / 2),
        entry('DreamShaperV8.zip', 2 * GB), entry('NaiAnimeV2.zip', 1.5 * GB),
      ]);
      hf.setTree('xororz/sd-qnn', []);
      hf.setDetails({
        'Lykon/AbsoluteReality': details('Lykon/AbsoluteReality', 100, 900, '2023-01-01T00:00:00.000Z'),
        'Lykon/dreamshaper-8': details('Lykon/dreamshaper-8', 900, 100, '2024-01-01T00:00:00.000Z'),
        'NovelAI/nai-anime-v2': details('NovelAI/nai-anime-v2', 500, 500, '2022-01-01T00:00:00.000Z'),
      });
    },
  });
  const { rtl, ui } = opened;
  rtl.fireEvent.press(ui.getByText('Image Models'));
  await rtl.waitFor(() => expect(ui.getByText(/NPU models supported/)).toBeTruthy(), TIMEOUT);
  rtl.fireEvent.press(ui.getByTestId('rec-toggle'));
  await rtl.waitFor(() => expect(ui.getByText('Anything V5 (GPU)')).toBeTruthy(), TIMEOUT);
  /** Names on the cards, top to bottom. */
  const order = () => ui.root.findAll((n: any) => typeof n.type === 'string' && /^image-model-card-\d+$/.test(n.props.testID ?? ''))
    .map((n: any) => ['Absolute Reality', 'Anything V5', 'Dream Shaper V8', 'Nai Anime V2']
      .find(name => rtl.within(n).queryAllByText(`${name} (GPU)`).length > 0));
  return { ...opened, order };
}

describe('Image tab sort (rendered)', () => {
  it('keeps the list order with nothing selected, then orders the cards by each option', async () => {
    const { rtl, ui, order } = await openImages();
    const alphabetical = ['Absolute Reality', 'Anything V5', 'Dream Shaper V8', 'Nai Anime V2'];
    expect(order()).toEqual(alphabetical);
    for (const key of ['popular', 'liked', 'newest', 'size']) {
      expect(ui.getByTestId(`image-sort-option-${key}`).props.accessibilityState.selected).toBe(false);
    }
    expect(ui.getByText('Popular')).toBeTruthy();
    expect(ui.getByText('Most liked')).toBeTruthy();
    expect(ui.getByText('Newest')).toBeTruthy();
    expect(ui.getByText('Size')).toBeTruthy();

    const expected: Record<string, string[]> = {
      popular: ['Dream Shaper V8', 'Nai Anime V2', 'Absolute Reality', 'Anything V5'],
      liked: ['Absolute Reality', 'Nai Anime V2', 'Dream Shaper V8', 'Anything V5'],
      newest: ['Dream Shaper V8', 'Absolute Reality', 'Nai Anime V2', 'Anything V5'],
      size: ['Anything V5', 'Absolute Reality', 'Nai Anime V2', 'Dream Shaper V8'],
    };
    for (const key of Object.keys(expected)) {
      rtl.fireEvent.press(ui.getByTestId(`image-sort-option-${key}`));
      await rtl.waitFor(() => expect(order()).toEqual(expected[key]), TIMEOUT);
      expect(ui.getByTestId(`image-sort-option-${key}`).props.accessibilityState.selected).toBe(true);
    }

    // A second tap on the chosen option keeps it chosen and the order unchanged.
    rtl.fireEvent.press(ui.getByTestId('image-sort-option-size'));
    expect(ui.getByTestId('image-sort-option-size').props.accessibilityState.selected).toBe(true);
    expect(order()).toEqual(expected.size);
  });
});
