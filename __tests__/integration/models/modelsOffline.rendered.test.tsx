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
import { noteFor } from '../../../src/features/modelGuide/notes';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const TIMEOUT = { timeout: 4000 };
const PICKS = 'Recommended for your device';
const QWEN = 'unsloth/Qwen3.5-2B-GGUF';
const NOTICE = 'Needs a connection to search, sort or show download numbers.';

// The harness resets modules when it opens the app, so the fake is required after that, to be the screen's instance.
let netInfoFake: { setConnected(next: boolean): void };
const requireNetInfoFake = () => { ({ netInfoFake } = require('../../harness/netInfoFake')); };

afterEach(() => {
  netInfoFake?.setConnected(true);
  resetDeviceMemory();
});

describe('Models with no connection (rendered)', () => {
  it('opens with no connection: the notice, the picks with their Good for lines, no numbers, no error', async () => {
    const { rtl, ui, hf } = await openModelsFromHome({
      totalGB: 10.82,
      hf: h => {
        // The harness has reset modules by now, so this is the fake the app will listen to.
        requireNetInfoFake();
        netInfoFake.setConnected(false);
        h.setDetails({ [QWEN]: { id: QWEN, downloads: 1234567, downloadsAllTime: 9800000, likes: 2300, lastModified: new Date().toISOString(), tags: ['gguf'] } });
        h.setOffline(true);
      },
    });
    await rtl.waitFor(() => expect(ui.getByText(PICKS)).toBeTruthy(), TIMEOUT);
    await new Promise(r => setTimeout(r, 500)); // let the picks' failing detail requests settle
    expect(ui.getByTestId('models-offline-notice')).toBeTruthy();
    expect(ui.getByText(noteFor(QWEN)!.goodFor, { exact: false })).toBeTruthy();
    expect(ui.queryByText(/downloads this month/)).toBeNull();
    expect(ui.queryByText('Search Error')).toBeNull();
    expect(ui.queryByText('Loading models...')).toBeNull();
    expect(hf.requests().filter(u => u.pathname === '/api/models')).toHaveLength(0);
  });

  it('shows the notice and the picks, makes no list request, and searches when the connection returns', async () => {
    const { rtl, ui, hf } = await openModelsFromHome({ totalGB: 10.82, hf: h => h.setList(() => [{ id: 'a/Qwen-GGUF', tags: ['gguf'], pipeline_tag: 'text-generation' }]) });
    requireNetInfoFake();
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
    requireNetInfoFake();
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
