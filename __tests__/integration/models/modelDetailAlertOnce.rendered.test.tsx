/**
 * An alert raised from a model's page opens once (rendered): the page used to mount its own copy of the
 * screen's alert, so every alert showed twice. Here the files of the chosen model cannot be loaded.
 *
 * Real AppNavigator, Home and Models screens and stores. Device leaves only: the Hugging Face network at
 * `global.fetch` and the phone's RAM.
 */
import { openModelsFromHome } from '../../harness/modelsApp';
import { resetDeviceMemory } from '../../harness/deviceMemory';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const TIMEOUT = { timeout: 4000 };

afterEach(() => resetDeviceMemory());

describe('Model page alerts (rendered)', () => {
  it('shows the alert for files that failed to load once, not twice', async () => {
    const { rtl, ui, hf } = await openModelsFromHome({
      totalGB: 10.82,
      hf: h => h.setList(url => (url.searchParams.get('sort') === 'downloads'
        ? [{ id: 'a/Plain-GGUF', tags: ['gguf'], pipeline_tag: 'text-generation', siblings: [{ rfilename: 'Plain-Q4_K_M.gguf' }] }]
        : [])),
    });
    rtl.fireEvent.press(ui.getByTestId('sort-option-downloads'));
    await rtl.waitFor(() => expect(ui.getByText('Plain-GGUF')).toBeTruthy(), TIMEOUT);

    hf.setOffline(true); // the phone loses its connection before the files are asked for
    rtl.fireEvent.press(ui.getByText('Plain-GGUF'));
    await rtl.waitFor(() => expect(ui.getByTestId('model-detail-screen')).toBeTruthy(), TIMEOUT);

    await rtl.waitFor(() => expect(ui.getAllByText('Failed to load model files.').length).toBeGreaterThan(0), TIMEOUT);
    expect(ui.getAllByText('Failed to load model files.').length).toBe(1);
  }, 30000);
});
