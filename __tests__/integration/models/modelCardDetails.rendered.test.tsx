/**
 * Model cards (rendered): a card shows the numbers Hugging Face gave it (downloads this month and all time, likes,
 * how long since the last update) and a "Good for" line or labels, and only the parts it has. A search hit with
 * no numbers shows no "undefined", "NaN" or empty lines.
 *
 * Real AppNavigator, Home and Models screens and stores. Device leaves only: the Hugging Face network at
 * `global.fetch`, the phone's RAM and the native boundary.
 */
import { openModelsFromHome } from '../../harness/modelsApp';
import { resetDeviceMemory } from '../../harness/deviceMemory';
import { TEXT_NOTES, NO_NOTE } from '../../../src/features/modelGuide/notes';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const TIMEOUT = { timeout: 4000 };
const QWEN = 'unsloth/Qwen3.5-2B-GGUF';

afterEach(() => resetDeviceMemory());

describe('Model cards (rendered)', () => {
  it('shows downloads, likes, last update and a Good for line, and only what a search hit has', async () => {
    const { rtl, ui } = await openModelsFromHome({
      totalGB: 10.82,
      platform: 'ios',
      hf: hf => {
        hf.setDetails({
          [QWEN]: {
            id: QWEN, downloads: 1234567, downloadsAllTime: 9800000, likes: 2300,
            lastModified: new Date(Date.now() - 3 * 86400000).toISOString(), tags: ['gguf'],
          },
        });
        hf.setList(() => [{ id: 'x/Qwen2.5-Coder-1.5B-GGUF', tags: ['gguf'] }]);
      },
    });

    // The model cards are the host views called model-card-N; pick the one that holds this name.
    const cardOf = (name: string) => {
      const card = ui.root.findAll((n: any) => typeof n.type === 'string' && /^model-card-\d+$/.test(n.props.testID ?? ''))
        .find((n: any) => rtl.within(n).queryAllByText(name).length > 0);
      if (!card) throw new Error(`no card for ${name}`);
      return rtl.within(card);
    };

    const qwen = await rtl.waitFor(() => {
      const c = cardOf('Qwen 3.5 2B');
      expect(c.getByText('1.2M downloads this month · 9.8M all time')).toBeTruthy();
      return c;
    }, TIMEOUT);
    expect(qwen.getByText('2.3K likes · updated 3 days ago')).toBeTruthy();
    if (!(QWEN in NO_NOTE)) expect(qwen.getByText(`Good for: ${TEXT_NOTES[QWEN].goodFor}`)).toBeTruthy();

    rtl.fireEvent.changeText(ui.getByTestId('search-input'), 'coder');
    const coder = await rtl.waitFor(() => {
      const c = cardOf('Qwen2.5-Coder-1.5B-GGUF');
      expect(c.getByText('Coding · Small, fast')).toBeTruthy();
      return c;
    }, { timeout: 6000 });
    const texts = coder.UNSAFE_getAllByType(require('react-native').Text)
      .flatMap((n: any) => [n.props.children].flat().filter((c: unknown) => typeof c === 'string')) as string[];
    expect(texts.join('\n')).not.toMatch(/undefined|NaN|downloads this month|likes/);
  });
});
