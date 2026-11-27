/**
 * Hugging Face requests (rendered): a request that never answers is given up after 20 seconds, so a list does
 * not sit on its spinner for good; the screen then shows what it shows for any failed request.
 *
 * Real AppNavigator, Home and Models screens, services and stores. Device leaf only: the Hugging Face network
 * at `global.fetch`, which here never answers.
 */
import { openModelsFromHome } from '../../harness/modelsApp';
import { resetDeviceMemory } from '../../harness/deviceMemory';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

afterEach(() => {
  jest.useRealTimers();
  resetDeviceMemory();
});

describe('Hugging Face request timeout (rendered)', () => {
  it.each([['never answers', 'hang'], ['answers its headers but never sends the body', 'hangBody']] as const)('New releases stops waiting after 20 seconds when a request %s', async (_name, how) => {
    const { rtl, ui, hf } = await openModelsFromHome({ totalGB: 10.82 });
    hf[how]();
    jest.useFakeTimers();
    rtl.fireEvent.press(ui.getByTestId('sort-option-newest'));
    expect(ui.getByText('Loading models...')).toBeTruthy();
    expect(ui.queryByTestId('models-search-failed')).toBeNull();
    await rtl.act(async () => { await jest.advanceTimersByTimeAsync(19000); });
    expect(ui.queryByTestId('models-search-failed')).toBeNull();
    await rtl.act(async () => { await jest.advanceTimersByTimeAsync(1500); });
    await rtl.waitFor(() => expect(ui.getByTestId('models-search-failed')).toBeTruthy());
    expect(ui.getByText('Could not reach Hugging Face. Pull down to try again.')).toBeTruthy();
    expect(ui.queryByText('Loading models...')).toBeNull();
  });
});
