/**
 * Guide library (rendered) — the user opens the Guide library, sees the checked catalogue by category,
 * downloads a guide, opens it in the phone's PDF viewer and removes it. A download is kept only when its size
 * and SHA-256 match the catalogue entry; anything else leaves no file behind.
 *
 * Real stack: the real GuideLibraryScreen, guide library service and store, catalogue validation and
 * AsyncStorage persistence. Device leaves only: memfs behind react-native-fs (downloadFile serves what each
 * test seeds per URL; an unseeded URL fails like no connection; hash is a real SHA-256) and the document
 * viewer mock from jest.setup.ts.
 */
import { createHash } from 'crypto';
import { setupChatScreen } from '../../harness/chatHarness';
import { bundledCatalogue, CATALOGUE_URL } from '../../../src/features/guideLibrary/catalogue';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));

const DIR = '/docs/guide-library';
const KNOTS_BODY = '%PDF-1.4 test knots guide body';
const WATER_BODY = '%PDF-1.4 test water guide body, a little longer';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const guide = (id: string, title: string, category: string, body: string) => ({
  id, title, category, publisher: 'Test publisher', year: 2020, licence: 'Public domain',
  licenceNote: 'US government work (17 U.S.C. 105).', url: `https://guides.example.gov/${id}.pdf`,
  bytes: Buffer.byteLength(body), sha256: sha256(body), pages: 12, hasText: true,
});
const KNOTS = guide('test-knots', 'Test knots', 'fieldcraft', KNOTS_BODY);
const WATER = guide('test-water', 'Test water', 'water', WATER_BODY);
const TEST_CATALOGUE = JSON.stringify({
  version: 1, updated: '2026-11-17',
  categories: [{ id: 'fieldcraft', name: 'Fieldcraft and knots' }, { id: 'water', name: 'Water and sanitation' }],
  guides: [KNOTS, WATER],
});

type Fs = NonNullable<Awaited<ReturnType<typeof setupChatScreen>>['boundary']['fs']>;
const exists = (fs: Fs, path: string) => (fs.module.exists as (p: string) => Promise<boolean>)(path);
const downloadsOf = (fs: Fs, url: string) =>
  (fs.module.downloadFile as jest.Mock).mock.calls.filter(([opts]) => opts.fromUrl === url).length;

/** Boot the app, let `seed` set up the device, then open the Guide library and wait for its refresh to end. */
async function openLibrary(seed: (fs: Fs) => void = () => {}) {
  const h = await setupChatScreen({ engine: 'llama', pdf: true, sqlite: true });
  const { React, rtl, boundary } = h;
  const fs = boundary.fs!;
  seed(fs);
  const fetchedBeforeOpen = downloadsOf(fs, CATALOGUE_URL);
  const { GuideLibraryScreen } = require('../../../src/screens/GuideLibraryScreen');
  const view = rtl.render(React.createElement(GuideLibraryScreen, {}));
  await waitForRefresh(h, view, fetchedBeforeOpen + 1);
  return { ...h, fs, view, fetchedBeforeOpen };
}

type Opened = Awaited<ReturnType<typeof setupChatScreen>>;
type View = ReturnType<Opened['rtl']['render']>;
async function waitForRefresh(h: Opened, view: View, fetches: number) {
  await h.rtl.waitFor(() => {
    expect(downloadsOf(h.boundary.fs!, CATALOGUE_URL)).toBe(fetches);
    expect(view.getByTestId('guide-library-refresh')).not.toBeBusy();
  }, { timeout: 4000 });
}

describe('Guide library (rendered)', () => {
  it('shows the bundled catalogue when there is no connection', async () => {
    const { view, fetchedBeforeOpen } = await openLibrary();

    // Nothing was fetched before the library opened.
    expect(fetchedBeforeOpen).toBe(0);
    expect(view.getByText(new RegExp(`^${bundledCatalogue.guides.length} guides`))).toBeTruthy();
    const counts = bundledCatalogue.categories.map(c => ({
      name: c.name, n: bundledCatalogue.guides.filter(g => g.category === c.id).length,
    }));
    const firstListed = counts.find(c => c.n > 0);
    if (firstListed) expect(view.getByText(`${firstListed.name} (${firstListed.n})`)).toBeTruthy();
    // Empty categories are hidden.
    const heading = (name: string) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(\\d+\\)$`);
    for (const empty of counts.filter(c => c.n === 0)) expect(view.queryByText(heading(empty.name))).toBeNull();
  }, 30000);

  it('a refreshed catalogue adds guides, and a malformed one changes nothing', async () => {
    const h = await openLibrary(fs => fs.seedDownload(CATALOGUE_URL, TEST_CATALOGUE));
    const { rtl, fs, view } = h;
    expect(view.getByText('Test knots')).toBeTruthy();
    expect(view.getByText('2 guides · 0 downloaded · 0 taught')).toBeTruthy();
    expect(view.getByText('Fieldcraft and knots (1)')).toBeTruthy();

    // A downloaded guide keeps its state across refreshes.
    fs.seedDownload(KNOTS.url, KNOTS_BODY);
    rtl.fireEvent.press(view.getByTestId('guide-download-test-knots'));
    await rtl.waitFor(() => { expect(view.getByTestId('guide-open-test-knots')).toBeTruthy(); }, { timeout: 4000 });

    fs.seedDownload(CATALOGUE_URL, '{ not json');
    rtl.fireEvent.press(view.getByTestId('guide-library-refresh'));
    await waitForRefresh(h, view, 2);
    expect(view.getByText('Test knots')).toBeTruthy();
    expect(view.getByTestId('guide-open-test-knots')).toBeTruthy();
    expect(view.getByText('2 guides · 1 downloaded · 0 taught')).toBeTruthy();
    expect(await exists(fs, `${DIR}/catalogue.json.part`)).toBe(false);

    fs.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
    rtl.fireEvent.press(view.getByTestId('guide-library-refresh'));
    await waitForRefresh(h, view, 3);
    expect(view.getByTestId('guide-open-test-knots')).toBeTruthy();
  }, 30000);

  it('downloads a guide, opens it and removes it', async () => {
    const { rtl, fs, view } = await openLibrary(f => {
      f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
      f.seedDownload(KNOTS.url, KNOTS_BODY);
    });
    const { viewDocument } = require('@react-native-documents/viewer');

    rtl.fireEvent.press(view.getByTestId('guide-download-test-knots'));
    await rtl.waitFor(() => { expect(view.getByTestId('guide-open-test-knots')).toBeTruthy(); }, { timeout: 4000 });
    expect(await exists(fs, `${DIR}/test-knots.pdf`)).toBe(true);

    rtl.fireEvent.press(view.getByTestId('guide-open-test-knots'));
    await rtl.waitFor(() => {
      expect(viewDocument).toHaveBeenCalledWith({ uri: 'file:///docs/guide-library/test-knots.pdf', mimeType: 'application/pdf', grantPermissions: 'read' });
    });

    rtl.fireEvent.press(view.getByTestId('guide-remove-test-knots'));
    await rtl.waitFor(() => { expect(view.getByTestId('guide-download-test-knots')).toBeTruthy(); }, { timeout: 4000 });
    expect(await exists(fs, `${DIR}/test-knots.pdf`)).toBe(false);
  }, 30000);

  it('a response that is not the checked file is refused', async () => {
    const { rtl, fs, view } = await openLibrary(f => {
      f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
      f.seedDownload(KNOTS.url, '<html>Access denied</html>');
    });

    rtl.fireEvent.press(view.getByTestId('guide-download-test-knots'));
    await rtl.waitFor(() => { expect(view.getByText("This file doesn't match the checked copy")).toBeTruthy(); }, { timeout: 4000 });
    expect(await exists(fs, `${DIR}/test-knots.pdf`)).toBe(false);
    expect(await exists(fs, `${DIR}/test-knots.pdf.part`)).toBe(false);

    fs.seedDownload(KNOTS.url, { status: 404 });
    rtl.fireEvent.press(view.getByTestId('guide-download-test-knots'));
    await rtl.waitFor(() => { expect(view.getByText("Couldn't download this guide. Try again.")).toBeTruthy(); }, { timeout: 4000 });
    expect(await exists(fs, `${DIR}/test-knots.pdf.part`)).toBe(false);
  }, 30000);

  it('a download larger than the checked file is stopped and refused', async () => {
    const { rtl, fs, view } = await openLibrary(f => {
      f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
      f.seedDownload(KNOTS.url, `${KNOTS_BODY} and a lot more than the catalogue said`);
    });

    rtl.fireEvent.press(view.getByTestId('guide-download-test-knots'));
    await rtl.waitFor(() => { expect(view.getByText("This file doesn't match the checked copy")).toBeTruthy(); }, { timeout: 4000 });
    expect(fs.module.stopDownload).toHaveBeenCalled();
    expect(await exists(fs, `${DIR}/test-knots.pdf`)).toBe(false);
    expect(await exists(fs, `${DIR}/test-knots.pdf.part`)).toBe(false);
  }, 30000);

  it('a download cut off part-way leaves nothing behind and can be retried', async () => {
    const { rtl, fs, view } = await openLibrary(f => {
      f.seedFile(`${DIR}/test-water.pdf.part`, 7);
      f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
      f.seedDownload(KNOTS.url, { failAfter: 'partial' });
    });
    // A part file left by an earlier run is cleaned up when the library starts.
    expect(await exists(fs, `${DIR}/test-water.pdf.part`)).toBe(false);

    rtl.fireEvent.press(view.getByTestId('guide-download-test-knots'));
    await rtl.waitFor(() => { expect(view.getByText("No connection. Try again when you're online.")).toBeTruthy(); }, { timeout: 4000 });
    expect(await exists(fs, `${DIR}/test-knots.pdf.part`)).toBe(false);

    fs.seedDownload(KNOTS.url, KNOTS_BODY);
    rtl.fireEvent.press(view.getByTestId('guide-download-test-knots'));
    await rtl.waitFor(() => { expect(view.getByTestId('guide-open-test-knots')).toBeTruthy(); }, { timeout: 4000 });
    expect(view.queryByText("No connection. Try again when you're online.")).toBeNull();
  }, 30000);

  it('a second tap while downloading does not start a second download', async () => {
    const { rtl, fs, view } = await openLibrary(f => {
      f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
      f.seedDownload(KNOTS.url, KNOTS_BODY);
    });

    const download = view.getByTestId('guide-download-test-knots');
    // Two taps before the screen re-renders.
    rtl.act(() => { rtl.fireEvent.press(download); rtl.fireEvent.press(download); });
    await rtl.waitFor(() => { expect(view.getByTestId('guide-open-test-knots')).toBeTruthy(); }, { timeout: 4000 });
    expect(downloadsOf(fs, KNOTS.url)).toBe(1);
  }, 30000);

  it('search filters by title and publisher', async () => {
    const { rtl, view } = await openLibrary(f => f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE));
    const search = view.getByTestId('guide-library-search');
    expect(search.props.placeholder).toBe('Search guides');

    rtl.fireEvent.changeText(search, 'knots');
    expect(view.getByText('Test knots')).toBeTruthy();
    expect(view.queryByText('Test water')).toBeNull();
    expect(view.queryByText('Water and sanitation (1)')).toBeNull();

    rtl.fireEvent.changeText(search, 'test PUBLISHER');
    expect(view.getByText('Test knots')).toBeTruthy();
    expect(view.getByText('Test water')).toBeTruthy();

    rtl.fireEvent.changeText(search, 'nothing like this');
    expect(view.queryByText('Test knots')).toBeNull();
    expect(view.queryByText('Test water')).toBeNull();

    // Tapping a row shows where the guide comes from.
    rtl.fireEvent.changeText(search, '');
    expect(view.queryByText(KNOTS.url)).toBeNull();
    rtl.fireEvent.press(view.getByTestId('guide-row-test-knots'));
    expect(view.getByText(KNOTS.url)).toBeTruthy();
    expect(view.getByText(KNOTS.licenceNote)).toBeTruthy();
  }, 30000);
});
