/**
 * Server sorts (rendered): Trending, Most downloaded, Most liked and New releases ask Hugging Face, limited to
 * models the phone can run. A late answer never replaces a newer one, a typed query rides along and survives
 * being cleared, and a list with nothing left says so.
 *
 * Real AppNavigator, Home and Models screens and stores. Device leaves only: the Hugging Face network at
 * `global.fetch` and the phone's RAM.
 */
import { openModelsFromHome } from '../../harness/modelsApp';
import { resetDeviceMemory } from '../../harness/deviceMemory';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const TIMEOUT = { timeout: 4000 };
const PICKS = 'Recommended for your device';
const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, tags: ['gguf'], pipeline_tag: 'text-generation', ...extra });

afterEach(() => resetDeviceMemory());

describe('Server sorts (rendered)', () => {
  it('Trending asks Hugging Face with the phone size limit and shows its answer', async () => {
    const { rtl, ui, hf } = await openModelsFromHome({
      totalGB: 10.82,
      hf: h => h.setList(url => (url.searchParams.get('sort') === 'trendingScore' ? [row('a/Zeta-Trend-GGUF'), row('a/Alpha-Trend-GGUF')] : [])),
    });
    await rtl.waitFor(() => expect(ui.getByText(PICKS)).toBeTruthy(), TIMEOUT);
    expect(hf.requests().filter(u => u.pathname === '/api/models')).toHaveLength(0); // opening the tab lists nothing
    rtl.fireEvent.press(ui.getByTestId('sort-pill'));
    rtl.fireEvent.press(ui.getByTestId('sort-option-trending'));
    await rtl.waitFor(() => expect(rtl.within(ui.getByTestId('models-list')).getByText('Alpha-Trend-GGUF')).toBeTruthy(), TIMEOUT);
    // Hugging Face's order is kept: Zeta before Alpha.
    expect(ui.getAllByText(/-Trend-GGUF/).map((n: any) => n.props.children)).toEqual(['Zeta-Trend-GGUF', 'Alpha-Trend-GGUF']);
    const last = hf.requests().filter(u => u.pathname === '/api/models').at(-1)!;
    expect(last.searchParams.get('sort')).toBe('trendingScore');
    expect(last.searchParams.get('num_parameters')).toBe('min:0,max:13B');
    expect(ui.queryByText(PICKS)).toBeNull();
  });

  it('New releases asks five publishers and keeps going when one fails', async () => {
    const { rtl, ui, hf } = await openModelsFromHome({
      totalGB: 10.82,
      hf: h => h.setList(url => {
        const author = url.searchParams.get('author');
        if (author === 'bartowski') return new Error('boom');
        return author ? [row(`${author}/New-GGUF`, { createdAt: '2026-11-01T00:00:00Z' })] : [];
      }),
    });
    rtl.fireEvent.press(ui.getByTestId('sort-pill'));
    rtl.fireEvent.press(ui.getByTestId('sort-option-newest'));
    await rtl.waitFor(() => expect(ui.queryAllByText('New-GGUF')).toHaveLength(4), TIMEOUT);
    expect(hf.requests().filter(u => u.searchParams.has('author'))).toHaveLength(5);
  });

  it('a slower earlier answer does not replace a newer one', async () => {
    const { rtl, ui, hf } = await openModelsFromHome({
      totalGB: 10.82,
      hf: h => h.setList(url => {
        const sort = url.searchParams.get('sort');
        if (sort === 'trendingScore') return [row('a/Old-Trend-GGUF')];
        if (sort === 'likes') return [row('a/Liked-GGUF')];
        return [];
      }),
    });
    const held = hf.hold();
    rtl.fireEvent.press(ui.getByTestId('sort-pill'));
    rtl.fireEvent.press(ui.getByTestId('sort-option-trending'));
    await rtl.waitFor(() => expect(held.count()).toBe(1), TIMEOUT);
    rtl.fireEvent.press(ui.getByTestId('sort-pill'));
    rtl.fireEvent.press(ui.getByTestId('sort-option-likes'));
    await rtl.waitFor(() => expect(held.count()).toBe(2), TIMEOUT);
    await rtl.act(async () => { held.release(1); });
    await rtl.waitFor(() => expect(ui.getByText('Liked-GGUF')).toBeTruthy(), TIMEOUT);
    await rtl.act(async () => { held.release(0); });
    expect(ui.getByText('Liked-GGUF')).toBeTruthy();
    expect(ui.queryByText('Old-Trend-GGUF')).toBeNull();
  });

  it('a typed query rides along, clearing it keeps the sorted list, and Smart brings the picks back', async () => {
    const { rtl, ui, hf } = await openModelsFromHome({
      totalGB: 10.82,
      hf: h => h.setList(url => (url.searchParams.get('sort') === 'likes' ? [row('a/Liked-GGUF')] : [])),
    });
    rtl.fireEvent.changeText(ui.getByTestId('search-input'), 'qwen');
    rtl.fireEvent.press(ui.getByTestId('sort-pill'));
    rtl.fireEvent.press(ui.getByTestId('sort-option-likes'));
    await rtl.waitFor(() => expect(ui.getByText('Liked-GGUF')).toBeTruthy(), TIMEOUT);
    const last = hf.requests().filter(u => u.searchParams.get('sort') === 'likes').at(-1)!;
    expect(last.searchParams.get('search')).toBe('qwen');
    rtl.fireEvent.changeText(ui.getByTestId('search-input'), '');
    await new Promise(r => setTimeout(r, 700));
    expect(ui.getByText('Liked-GGUF')).toBeTruthy();
    expect(ui.queryByText(PICKS)).toBeNull();
    rtl.fireEvent.press(ui.getByTestId('sort-pill'));
    rtl.fireEvent.press(ui.getByTestId('sort-option-recommended'));
    await rtl.waitFor(() => expect(ui.getByText(PICKS)).toBeTruthy(), TIMEOUT);
  });

  it('says so when everything is filtered away', async () => {
    const { rtl, ui } = await openModelsFromHome({
      totalGB: 10.82,
      hf: h => h.setList(() => [{ id: 'a/tts-GGUF', pipeline_tag: 'text-to-speech' }]),
    });
    rtl.fireEvent.press(ui.getByTestId('sort-pill'));
    rtl.fireEvent.press(ui.getByTestId('sort-option-trending'));
    await rtl.waitFor(() => expect(ui.getByText('No models found. Try a different search term.')).toBeTruthy(), TIMEOUT);
  });
});
