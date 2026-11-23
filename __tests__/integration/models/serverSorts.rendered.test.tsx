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
  it('the seven sorts show without opening anything, in order', async () => {
    const { ui } = await openModelsFromHome({ totalGB: 12 });
    expect(ui.getAllByTestId(/^sort-option-/).map((n: any) => n.props.testID.replace('sort-option-', '')))
      .toEqual(['recommended', 'trending', 'downloads', 'likes', 'newest', 'bestfit', 'size']);
    expect(ui.queryByTestId('sort-pill')).toBeNull();
    expect(ui.getByTestId('sort-option-recommended')).toBeSelected();
  });

  it('opening the filters leaves the sorts in place', async () => {
    const { rtl, ui } = await openModelsFromHome({ totalGB: 12 });
    rtl.fireEvent.press(ui.getByTestId('text-filter-toggle'));
    expect(ui.getAllByTestId(/^sort-option-/)).toHaveLength(7);
  });

  it('Trending asks Hugging Face with the phone size limit and shows its answer', async () => {
    const { rtl, ui, hf } = await openModelsFromHome({
      totalGB: 10.82,
      hf: h => h.setList(url => (url.searchParams.get('sort') === 'trendingScore' ? [row('a/Zeta-Trend-GGUF'), row('a/Alpha-Trend-GGUF')] : [])),
    });
    await rtl.waitFor(() => expect(ui.getByText(PICKS)).toBeTruthy(), TIMEOUT);
    expect(hf.requests().filter(u => u.pathname === '/api/models')).toHaveLength(0); // opening the tab lists nothing
    rtl.fireEvent.press(ui.getByTestId('sort-option-trending'));
    await rtl.waitFor(() => expect(rtl.within(ui.getByTestId('models-list')).getByText('Alpha-Trend-GGUF')).toBeTruthy(), TIMEOUT);
    // Hugging Face's order is kept: Zeta before Alpha.
    expect(ui.getAllByText(/-Trend-GGUF/).map((n: any) => n.props.children)).toEqual(['Zeta-Trend-GGUF', 'Alpha-Trend-GGUF']);
    const last = hf.requests().filter(u => u.pathname === '/api/models').at(-1)!;
    expect(last.searchParams.get('sort')).toBe('trendingScore');
    expect(last.searchParams.get('num_parameters')).toBe('min:0,max:13B');
    expect(ui.queryByText(PICKS)).toBeNull();
  });

  it('a sorted list leaves out a model whose files are all in subfolders', async () => {
    const { rtl, ui } = await openModelsFromHome({
      totalGB: 10.82,
      hf: h => h.setList(url => (url.searchParams.get('sort') === 'downloads' ? [
        row('a/Nested-Only-GGUF', { siblings: [{ rfilename: 'sub/Nested-Only-Q4_K_M.gguf' }, { rfilename: 'README.md' }] }),
        row('a/Plain-GGUF', { siblings: [{ rfilename: 'README.md' }, { rfilename: 'Plain-Q4_K_M.gguf' }] }),
      ] : [])),
    });
    rtl.fireEvent.press(ui.getByTestId('sort-option-downloads'));
    await rtl.waitFor(() => expect(ui.getByText('Plain-GGUF')).toBeTruthy(), TIMEOUT);
    expect(ui.queryByText(/Nested-Only/)).toBeNull();
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
    rtl.fireEvent.press(ui.getByTestId('sort-option-trending'));
    await rtl.waitFor(() => expect(held.count()).toBe(1), TIMEOUT);
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
    rtl.fireEvent.press(ui.getByTestId('sort-option-likes'));
    await rtl.waitFor(() => expect(ui.getByText('Liked-GGUF')).toBeTruthy(), TIMEOUT);
    const last = hf.requests().filter(u => u.searchParams.get('sort') === 'likes').at(-1)!;
    expect(last.searchParams.get('search')).toBe('qwen');
    rtl.fireEvent.changeText(ui.getByTestId('search-input'), '');
    await new Promise(r => setTimeout(r, 700));
    expect(ui.getByText('Liked-GGUF')).toBeTruthy();
    expect(ui.queryByText(PICKS)).toBeNull();
    rtl.fireEvent.press(ui.getByTestId('sort-option-recommended'));
    await rtl.waitFor(() => expect(ui.getByText(PICKS)).toBeTruthy(), TIMEOUT);
  });

  it('says so when everything is filtered away', async () => {
    const { rtl, ui } = await openModelsFromHome({
      totalGB: 10.82,
      hf: h => h.setList(() => [{ id: 'a/tts-GGUF', pipeline_tag: 'text-to-speech' }]),
    });
    rtl.fireEvent.press(ui.getByTestId('sort-option-trending'));
    await rtl.waitFor(() => expect(ui.getByText('No models found. Try a different search term.')).toBeTruthy(), TIMEOUT);
  });

  it('a filter applies to a server sort, and removing it asks again', async () => {
    const { rtl, ui, hf } = await openModelsFromHome({
      totalGB: 10.82,
      hf: h => h.setList(url => {
        if (url.searchParams.get('sort') !== 'trendingScore') return [];
        return url.searchParams.get('pipeline_tag')
          ? [row('a/Llava-GGUF', { pipeline_tag: 'image-text-to-text' })]
          : [row('a/Plain-GGUF')];
      }),
    });
    rtl.fireEvent.press(ui.getByTestId('sort-option-trending'));
    await rtl.waitFor(() => expect(ui.getByText('Plain-GGUF')).toBeTruthy(), TIMEOUT);
    rtl.fireEvent.press(ui.getByTestId('text-filter-toggle'));
    rtl.fireEvent.press(ui.getByText(/^Type [▴▾]/));
    rtl.fireEvent.press(ui.getByText('Vision'));
    await rtl.waitFor(() => expect(ui.getByText('Llava-GGUF')).toBeTruthy(), TIMEOUT);
    expect(ui.queryByText('Plain-GGUF')).toBeNull();
    rtl.fireEvent.press(ui.getByText(/^Vision [▴▾]/));
    rtl.fireEvent.press(ui.getByText('All Types'));
    await rtl.waitFor(() => expect(ui.getByText('Plain-GGUF')).toBeTruthy(), TIMEOUT);
    expect(ui.queryByText('Llava-GGUF')).toBeNull();
    expect(hf.requests().filter(u => u.pathname === '/api/models').at(-1)!.searchParams.has('pipeline_tag')).toBe(false);
  });

  it('choosing a sort right after typing leaves only that sort\'s results', async () => {
    const { rtl, ui, hf } = await openModelsFromHome({
      totalGB: 10.82,
      hf: h => h.setList(url => (url.searchParams.get('sort') === 'likes' ? [row('a/Liked-GGUF')] : [row('a/Default-GGUF')])),
    });
    rtl.fireEvent.changeText(ui.getByTestId('search-input'), 'qwen');
    rtl.fireEvent.press(ui.getByTestId('sort-option-likes'));
    await new Promise(r => setTimeout(r, 900));
    await rtl.waitFor(() => expect(ui.getByText('Liked-GGUF')).toBeTruthy(), TIMEOUT);
    expect(ui.queryByText('Default-GGUF')).toBeNull();
    const lists = hf.requests().filter(u => u.pathname === '/api/models');
    expect(lists.length).toBeGreaterThan(0);
    expect(lists.every(u => u.searchParams.get('sort') === 'likes')).toBe(true);
  });

  it('moving between Smart, For You and Size does not ask again, and leaving a server sort does', async () => {
    const { rtl, ui, hf } = await openModelsFromHome({
      totalGB: 10.82,
      hf: h => h.setList(url => (url.searchParams.get('sort') === 'likes' ? [row('a/Liked-GGUF')] : [row('a/Plain-GGUF')])),
    });
    const lists = () => hf.requests().filter(u => u.pathname === '/api/models');
    rtl.fireEvent.changeText(ui.getByTestId('search-input'), 'qwen');
    await rtl.waitFor(() => expect(ui.getByText('Plain-GGUF')).toBeTruthy(), { timeout: 6000 });
    const before = lists().length;
    for (const key of ['bestfit', 'size', 'recommended']) {
      rtl.fireEvent.press(ui.getByTestId(`sort-option-${key}`));
      expect(ui.queryByText('Loading models...')).toBeNull();
    }
    await new Promise(r => setTimeout(r, 300));
    expect(lists().length).toBe(before);
    expect(ui.getByText('Plain-GGUF')).toBeTruthy();

    rtl.fireEvent.press(ui.getByTestId('sort-option-likes'));
    await rtl.waitFor(() => expect(ui.getByText('Liked-GGUF')).toBeTruthy(), TIMEOUT);
    rtl.fireEvent.press(ui.getByTestId('sort-option-size'));
    await rtl.waitFor(() => expect(ui.getByText('Plain-GGUF')).toBeTruthy(), TIMEOUT);
    const last = lists().at(-1)!;
    expect(last.searchParams.has('num_parameters')).toBe(false);
    expect(last.searchParams.get('search')).toBe('qwen');
  });

  it('a failed sort says so, clears the old list, and pull to refresh asks again', async () => {
    let failLikes = true;
    const { rtl, ui } = await openModelsFromHome({
      totalGB: 10.82,
      hf: h => h.setList(url => {
        const sort = url.searchParams.get('sort');
        if (sort === 'likes') return failLikes ? new Error('down') : [row('a/Liked-GGUF')];
        return sort === 'trendingScore' ? [row('a/Trend-GGUF')] : [];
      }),
    });
    rtl.fireEvent.press(ui.getByTestId('sort-option-trending'));
    await rtl.waitFor(() => expect(ui.getByText('Trend-GGUF')).toBeTruthy(), TIMEOUT);
    rtl.fireEvent.press(ui.getByTestId('sort-option-likes'));
    await rtl.waitFor(() => expect(ui.getByTestId('models-search-failed')).toBeTruthy(), TIMEOUT);
    expect(ui.getByText('Could not reach Hugging Face. Pull down to try again.')).toBeTruthy();
    expect(ui.queryByText('Trend-GGUF')).toBeNull();
    failLikes = false;
    await rtl.act(async () => { await ui.getByTestId('models-list').props.refreshControl.props.onRefresh(); });
    await rtl.waitFor(() => expect(ui.getByText('Liked-GGUF')).toBeTruthy(), TIMEOUT);
    expect(ui.queryByTestId('models-search-failed')).toBeNull();
  });

  it('removing the last filter under Smart with nothing typed shows the picks again', async () => {
    const { rtl, ui } = await openModelsFromHome({
      totalGB: 10.82,
      hf: h => h.setList(() => [row('a/Tiny-GGUF')]),
    });
    rtl.fireEvent.press(ui.getByTestId('text-filter-toggle'));
    rtl.fireEvent.press(ui.getByText(/^Size [▴▾]/));
    rtl.fireEvent.press(ui.getByText('< 1B'));
    await rtl.waitFor(() => expect(ui.getByText('Tiny-GGUF')).toBeTruthy(), TIMEOUT);
    expect(ui.queryByText(PICKS)).toBeNull();
    rtl.fireEvent.press(ui.getByText(/^< 1B [▴▾]/));
    rtl.fireEvent.press(ui.getByText('All Sizes'));
    await rtl.waitFor(() => expect(ui.getByText(PICKS)).toBeTruthy(), TIMEOUT);
    expect(ui.queryByText('Tiny-GGUF')).toBeNull();
  });

  it('the sort is readable: button role, name, selected state and a heading over the results', async () => {
    const { rtl, ui } = await openModelsFromHome({
      totalGB: 10.82,
      hf: h => h.setList(url => (url.searchParams.get('sort') === 'likes' ? [row('a/Liked-GGUF')] : [])),
    });
    expect(ui.getByRole('button', { name: 'Most liked' })).toBe(ui.getByTestId('sort-option-likes'));
    expect(ui.queryByTestId('results-heading')).toBeNull();
    expect(ui.getByTestId('sort-option-likes').props.accessibilityRole).toBe('button');
    expect(ui.getByTestId('sort-option-likes').props.accessibilityState).toEqual({ selected: false });
    expect(ui.getByTestId('sort-option-recommended').props.accessibilityState).toEqual({ selected: true });
    rtl.fireEvent.press(ui.getByTestId('sort-option-likes'));
    await rtl.waitFor(() => expect(ui.getByText('Liked-GGUF')).toBeTruthy(), TIMEOUT);
    expect(rtl.within(ui.getByTestId('results-heading')).getByText('Most liked')).toBeTruthy();
    expect(ui.getByTestId('sort-option-likes').props.accessibilityState).toEqual({ selected: true });
  });

  it('tapping the sort that is already chosen asks again, once', async () => {
    const { rtl, ui, hf } = await openModelsFromHome({
      totalGB: 10.82,
      hf: h => h.setList(url => (url.searchParams.get('sort') === 'likes' ? [row('a/Liked-GGUF')] : [])),
    });
    rtl.fireEvent.press(ui.getByTestId('sort-option-likes'));
    await rtl.waitFor(() => expect(ui.getByText('Liked-GGUF')).toBeTruthy(), TIMEOUT);
    const lists = () => hf.requests().filter(u => u.pathname === '/api/models').length;
    const before = lists();
    rtl.fireEvent.press(ui.getByTestId('sort-option-likes'));
    await rtl.waitFor(() => expect(lists()).toBe(before + 1), TIMEOUT);
    await new Promise(r => setTimeout(r, 700));
    expect(lists()).toBe(before + 1);
    await rtl.waitFor(() => expect(ui.getByText('Liked-GGUF')).toBeTruthy(), TIMEOUT);
  });

  it('stops loading after a stale answer is ignored', async () => {
    const { rtl, ui, hf } = await openModelsFromHome({
      totalGB: 10.82,
      hf: h => h.setList(url => (url.searchParams.get('sort') === 'likes' ? [row('a/Liked-GGUF')] : [row('a/Old-Trend-GGUF')])),
    });
    const held = hf.hold();
    rtl.fireEvent.press(ui.getByTestId('sort-option-trending'));
    await rtl.waitFor(() => expect(held.count()).toBe(1), TIMEOUT);
    rtl.fireEvent.press(ui.getByTestId('sort-option-likes'));
    await rtl.waitFor(() => expect(held.count()).toBe(2), TIMEOUT);
    await rtl.act(async () => { held.release(0); });
    expect(ui.getByText('Loading models...')).toBeTruthy();
    await rtl.act(async () => { held.release(1); });
    await rtl.waitFor(() => expect(ui.getByText('Liked-GGUF')).toBeTruthy(), TIMEOUT);
    expect(ui.queryByText('Loading models...')).toBeNull();
    expect(ui.queryByText('Old-Trend-GGUF')).toBeNull();
  });
});
