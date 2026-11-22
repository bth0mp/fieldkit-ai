/**
 * Models with no connection (rendered): the Text tab says it needs a connection, leaves the picks showing instead of
 * searching, searches once the connection returns, and shows the notice, not a "Search Error", when the connection
 * drops while a search is in flight.
 *
 * Real AppNavigator, Home and Models screens and stores. Device leaves only: the Hugging Face network at
 * `global.fetch`, the phone's RAM and the connection at NetInfo.
 */
import { openModelsFromHome } from '../../harness/modelsApp';
import { resetDeviceMemory } from '../../harness/deviceMemory';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const TIMEOUT = { timeout: 4000 };
const PICKS = 'Recommended for your device';
const NOTICE = 'Needs a connection to search, sort or show download numbers.';

// The harness resets modules when it opens the app, so the fake is required after that, to be the screen's instance.
let netInfoFake: { setConnected(next: boolean): void };
const useNetInfoFake = () => { ({ netInfoFake } = require('../../harness/netInfoFake')); };

afterEach(() => {
  netInfoFake?.setConnected(true);
  resetDeviceMemory();
});

describe('Models with no connection (rendered)', () => {
  it('shows the notice and the picks, makes no list request, and searches when the connection returns', async () => {
    const { rtl, ui, hf } = await openModelsFromHome({ totalGB: 10.82, hf: h => h.setList(() => [{ id: 'a/Qwen-GGUF', tags: ['gguf'], pipeline_tag: 'text-generation' }]) });
    useNetInfoFake();
    await rtl.act(async () => { netInfoFake.setConnected(false); });
    await rtl.waitFor(() => expect(ui.getByText(PICKS)).toBeTruthy(), TIMEOUT);
    expect(ui.getByTestId('models-offline-notice')).toBeTruthy();
    expect(ui.getByText(NOTICE)).toBeTruthy();
    expect(ui.getAllByText(/Good for:/).length).toBeGreaterThan(0);
    expect(ui.queryByText(/downloads this month/)).toBeNull();

    const lists = () => hf.requests().filter(u => u.pathname === '/api/models');
    const before = lists().length;
    rtl.fireEvent.changeText(ui.getByTestId('search-input'), 'qwen');
    rtl.fireEvent.press(ui.getByTestId('sort-pill'));
    rtl.fireEvent.press(ui.getByTestId('sort-option-trending'));
    await new Promise(r => setTimeout(r, 800));
    expect(lists().length).toBe(before);
    expect(ui.queryByText('Search Error')).toBeNull();
    expect(ui.queryByText('Loading models...')).toBeNull();
    expect(ui.getByText(PICKS)).toBeTruthy();

    await rtl.act(async () => { netInfoFake.setConnected(true); });
    await rtl.waitFor(() => expect(ui.getByText('Qwen-GGUF')).toBeTruthy(), TIMEOUT);
    expect(ui.queryByTestId('models-offline-notice')).toBeNull();
    const last = lists().at(-1)!;
    expect(last.searchParams.get('search')).toBe('qwen');
    expect(last.searchParams.get('sort')).toBe('trendingScore');
  });

  it('shows the notice, not a Search Error, when the connection drops while a search is in flight', async () => {
    const { rtl, ui, hf } = await openModelsFromHome({ totalGB: 10.82 });
    useNetInfoFake();
    const held = hf.hold();
    rtl.fireEvent.changeText(ui.getByTestId('search-input'), 'gemma');
    await rtl.waitFor(() => expect(held.count()).toBe(1), TIMEOUT);
    await rtl.act(async () => { netInfoFake.setConnected(false); });
    await rtl.act(async () => { held.release(0, new Error('Network request failed')); });
    await rtl.waitFor(() => expect(ui.getByTestId('models-offline-notice')).toBeTruthy(), TIMEOUT);
    expect(ui.queryByText('Search Error')).toBeNull();
    expect(ui.queryByText('Loading models...')).toBeNull();
    expect(ui.getByText(PICKS)).toBeTruthy();
  });
});
