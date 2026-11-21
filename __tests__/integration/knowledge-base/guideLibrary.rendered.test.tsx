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

// GUIDE_LIBRARY_DIR as the app computes it on the fake file system (set once the harness is installed).
let DIR = '';
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
const catalogueOf = (guides: unknown[]) => JSON.stringify({
  version: 1, updated: '2026-11-17',
  categories: [{ id: 'fieldcraft', name: 'Fieldcraft and knots' }, { id: 'water', name: 'Water and sanitation' }],
  guides,
});
const TEST_CATALOGUE = catalogueOf([KNOTS, WATER]);
const DELISTED_HEADING = 'No longer listed';
const DELISTED_LINE = 'Removed from the library. Your copy still works.';
const DIDNT_FINISH = "The download didn't finish. Check your connection and try again.";

type Fs = NonNullable<Awaited<ReturnType<typeof setupChatScreen>>['boundary']['fs']>;
const exists = (fs: Fs, path: string) => (fs.module.exists as (p: string) => Promise<boolean>)(path);
const downloadsOf = (fs: Fs, url: string) =>
  (fs.module.downloadFile as jest.Mock).mock.calls.filter(([opts]) => opts.fromUrl === url).length;
/** The jobId downloadFile returned for the last download of `url`. */
const jobIdOf = (fs: Fs, url: string) => {
  const mock = fs.module.downloadFile as jest.Mock;
  const i = mock.mock.calls.map(([opts]) => opts.fromUrl).lastIndexOf(url);
  return mock.mock.results[i].value.jobId as number;
};
const AsyncStorageOf = () => {
  const m = require('@react-native-async-storage/async-storage');
  return m.default ?? m;
};
const unlinked = (fs: Fs, path: string) => (fs.module.unlink as jest.Mock).mock.calls.some(([p]) => p === path);

/** Tap a guide's Remove button, then answer the confirmation sheet. Returns the sheet's message. */
async function removeGuide(h: Opened, view: View, id: string, answer: 'Remove' | 'Cancel' = 'Remove'): Promise<string> {
  h.rtl.fireEvent.press(view.getByTestId(`guide-remove-${id}`));
  await h.rtl.waitFor(() => { expect(view.getByText('Remove guide?')).toBeTruthy(); });
  const message = String(view.getByText(/will be deleted from your phone\./).props.children);
  // The sheet is drawn after the list, so its button is the last one with this text (the row's Remove is first).
  const buttons = view.getAllByText(answer);
  h.rtl.fireEvent.press(buttons[buttons.length - 1]);
  return message;
}

/**
 * Boot the app, let `seed` set up the device, then open the Guide library and wait for its refresh to end.
 * The seed lands before Home first mounts: Home's Your library card starts the guide library at launch, and
 * that reads the saved records once, as the app does after a restart.
 */
async function openLibrary(seed: (fs: Fs) => void | Promise<void> = () => {}) {
  const h = await setupChatScreen({
    engine: 'llama', pdf: true, sqlite: true,
    beforeHome: async (boundary) => {
      const { GUIDE_LIBRARY_DIR } = require('../../../src/features/guideLibrary/guideLibraryService');
      DIR = GUIDE_LIBRARY_DIR;
      await seed(boundary.fs!);
    },
  });
  const { React, rtl, boundary } = h;
  const fs = boundary.fs!;
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

  it('downloads a guide, opens it and removes it once the user confirms', async () => {
    const h = await openLibrary(f => {
      f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
      f.seedDownload(KNOTS.url, KNOTS_BODY);
    });
    const { rtl, fs, view } = h;
    const { viewDocument } = require('@react-native-documents/viewer');

    rtl.fireEvent.press(view.getByTestId('guide-download-test-knots'));
    await rtl.waitFor(() => { expect(view.getByTestId('guide-open-test-knots')).toBeTruthy(); }, { timeout: 4000 });
    expect(await exists(fs, `${DIR}/test-knots.pdf`)).toBe(true);
    // Slow government hosts get time to answer and to send; progress comes at most twice a second.
    const [opts] = (fs.module.downloadFile as jest.Mock).mock.calls.find(([o]) => o.fromUrl === KNOTS.url)!;
    expect(opts).toMatchObject({ connectionTimeout: 30000, readTimeout: 60000, progressInterval: 500 });

    rtl.fireEvent.press(view.getByTestId('guide-open-test-knots'));
    await rtl.waitFor(() => {
      expect(viewDocument).toHaveBeenCalledWith({ uri: 'file:///docs/guide-library/test-knots.pdf', mimeType: 'application/pdf', grantPermissions: 'read' });
    });

    // Cancel keeps it.
    const message = await removeGuide(h, view, 'test-knots', 'Cancel');
    expect(message).toBe('"Test knots" will be deleted from your phone.');
    await rtl.act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(view.getByTestId('guide-open-test-knots')).toBeTruthy();
    expect(await exists(fs, `${DIR}/test-knots.pdf`)).toBe(true);

    await removeGuide(h, view, 'test-knots');
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

  it('a guide too big for the free space is not downloaded and says so', async () => {
    const { rtl, fs, view } = await openLibrary(f => {
      f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
      f.seedDownload(KNOTS.url, KNOTS_BODY);
      // Room for the file itself, but not for the margin kept free beyond it.
      f.setFreeSpace(KNOTS.bytes + 1024);
    });

    rtl.fireEvent.press(view.getByTestId('guide-download-test-knots'));
    await rtl.waitFor(() => { expect(view.getByText('Not enough free space for this guide.')).toBeTruthy(); }, { timeout: 4000 });
    expect(downloadsOf(fs, KNOTS.url)).toBe(0);
    expect(await exists(fs, `${DIR}/test-knots.pdf`)).toBe(false);
    expect(view.getByTestId('guide-download-test-knots')).toBeTruthy();

    // When the free space cannot be read, the download goes ahead.
    (fs.module.getFSInfo as jest.Mock).mockRejectedValueOnce(new Error('statfs failed'));
    rtl.fireEvent.press(view.getByTestId('guide-download-test-knots'));
    await rtl.waitFor(() => { expect(view.getByTestId('guide-open-test-knots')).toBeTruthy(); }, { timeout: 4000 });
  }, 30000);

  it('a download that declares more bytes than the checked file is stopped before anything is written', async () => {
    const { rtl, fs, view } = await openLibrary(f => {
      f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
      f.seedDownload(KNOTS.url, `${KNOTS_BODY} and a lot more than the catalogue said`);
    });

    rtl.fireEvent.press(view.getByTestId('guide-download-test-knots'));
    await rtl.waitFor(() => { expect(view.getByText("This file doesn't match the checked copy")).toBeTruthy(); }, { timeout: 4000 });
    expect(fs.module.stopDownload).toHaveBeenCalledTimes(1);
    expect(fs.module.stopDownload).toHaveBeenCalledWith(jobIdOf(fs, KNOTS.url));
    // Nothing of the body reached the disk, so there was no part file to clean up.
    expect(unlinked(fs, `${DIR}/test-knots.pdf.part`)).toBe(false);
    expect(await exists(fs, `${DIR}/test-knots.pdf`)).toBe(false);
    expect(await exists(fs, `${DIR}/test-knots.pdf.part`)).toBe(false);
  }, 30000);

  it('a download with no declared length that sends more bytes than the checked file is stopped and refused', async () => {
    const { rtl, fs, view } = await openLibrary(f => {
      f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
      f.seedDownload(KNOTS.url, { status: 200, body: `${KNOTS_BODY} and a lot more`, contentLength: -1 });
    });

    rtl.fireEvent.press(view.getByTestId('guide-download-test-knots'));
    await rtl.waitFor(() => { expect(view.getByText("This file doesn't match the checked copy")).toBeTruthy(); }, { timeout: 4000 });
    // Stopped from inside the progress callback, once, for this job.
    expect(fs.module.stopDownload).toHaveBeenCalledTimes(1);
    expect(fs.module.stopDownload).toHaveBeenCalledWith(jobIdOf(fs, KNOTS.url));
    expect(await exists(fs, `${DIR}/test-knots.pdf`)).toBe(false);
    expect(await exists(fs, `${DIR}/test-knots.pdf.part`)).toBe(false);
  }, 30000);

  it('a fetched catalogue that lists no guides is refused', async () => {
    const h = await openLibrary(fs => fs.seedDownload(CATALOGUE_URL, TEST_CATALOGUE));
    const { view } = h;
    h.fs.seedDownload(CATALOGUE_URL, catalogueOf([]));
    h.rtl.fireEvent.press(view.getByTestId('guide-library-refresh'));
    await waitForRefresh(h, view, 2);
    expect(view.getByText('Test knots')).toBeTruthy();
    expect(view.getByText('Test water')).toBeTruthy();
  }, 30000);

  describe('on a launch with no connection', () => {
    const savedCatalogue = (updated: string) => async (fs: Fs) => {
      await (fs.module.writeFile as (p: string, c: string) => Promise<void>)(
        `${DIR}/catalogue.json`, JSON.stringify({ ...JSON.parse(TEST_CATALOGUE), updated }));
    };

    it('the bundled catalogue is shown when it is newer than the saved one', async () => {
      const { view } = await openLibrary(savedCatalogue('2000-01-01'));
      expect(view.queryByText('Test knots')).toBeNull();
      expect(view.getByText(new RegExp(`^${bundledCatalogue.guides.length} guides`))).toBeTruthy();
    }, 30000);

    it('the saved catalogue is shown when it is newer than the bundled one', async () => {
      const { view } = await openLibrary(savedCatalogue('2999-12-31'));
      expect(view.getByText('Test knots')).toBeTruthy();
      expect(view.getByText('2 guides · 0 downloaded · 0 taught')).toBeTruthy();
    }, 30000);
  });

  it('a fetched catalogue over the size cap is refused', async () => {
    const { fs, view } = await openLibrary(f => f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE + ' '.repeat(2 * 1024 * 1024)));
    expect(view.queryByText('Test knots')).toBeNull();
    expect(view.getByText(new RegExp(`^${bundledCatalogue.guides.length} guides`))).toBeTruthy();
    expect(fs.module.stopDownload).toHaveBeenCalledWith(jobIdOf(fs, CATALOGUE_URL));
    expect(await exists(fs, `${DIR}/catalogue.json`)).toBe(false);
    expect(await exists(fs, `${DIR}/catalogue.json.part`)).toBe(false);
  }, 30000);

  it('on launch, a saved guide whose file is there opens and one whose file is gone is forgotten', async () => {
    const AsyncStorage = () => {
      const m = require('@react-native-async-storage/async-storage');
      return m.default ?? m;
    };
    const { fs, view } = await openLibrary(async f => {
      f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
      f.seedFile(`${DIR}/test-knots.pdf`, KNOTS.bytes);
      // test-water's file is gone; a record whose id is not a catalogue id must never name a file.
      await AsyncStorage().setItem('@fieldkit/guide_library', JSON.stringify({
        downloaded: { 'test-knots': KNOTS, 'test-water': WATER, '../escape': { ...KNOTS, id: '../escape' } },
      }));
    });

    expect(view.getByTestId('guide-open-test-knots')).toBeTruthy();
    expect(view.getByTestId('guide-download-test-water')).toBeTruthy();
    expect(view.getByText('2 guides · 1 downloaded · 0 taught')).toBeTruthy();
    const saved = JSON.parse(await AsyncStorage().getItem('@fieldkit/guide_library'));
    expect(Object.keys(saved.downloaded)).toEqual(['test-knots']);
    expect((fs.module.exists as jest.Mock).mock.calls.some(([p]) => String(p).includes('escape'))).toBe(false);
  }, 30000);

  it('on launch, a saved record that fails the catalogue checks is dropped and its file deleted', async () => {
    const { fs, view } = await openLibrary(async f => {
      f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
      f.seedFile(`${DIR}/test-knots.pdf`, KNOTS.bytes);
      f.seedFile(`${DIR}/test-water.pdf`, WATER.bytes);
      // test-knots' record lost its title; its category is gone from the catalogue, which is fine for a saved one.
      const { title: _title, ...untitled } = KNOTS;
      await AsyncStorageOf().setItem('@fieldkit/guide_library', JSON.stringify({
        downloaded: { 'test-knots': untitled, 'test-water': { ...WATER, category: 'gone' } },
      }));
    });

    expect(view.getByTestId('guide-download-test-knots')).toBeTruthy();
    expect(view.getByTestId('guide-open-test-water')).toBeTruthy();
    expect(view.getByText('2 guides · 1 downloaded · 0 taught')).toBeTruthy();
    const saved = JSON.parse(await AsyncStorageOf().getItem('@fieldkit/guide_library'));
    expect(Object.keys(saved.downloaded)).toEqual(['test-water']);
    expect(await exists(fs, `${DIR}/test-knots.pdf`)).toBe(false);
    expect(await exists(fs, `${DIR}/test-water.pdf`)).toBe(true);
  }, 30000);

  it('on launch, a guide file with no saved record is deleted', async () => {
    const { fs, view } = await openLibrary(async f => {
      f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
      // An earlier run moved the checked file in and was killed before it saved the record.
      f.seedFile(`${DIR}/test-knots.pdf`, KNOTS.bytes);
      f.seedFile(`${DIR}/test-water.pdf`, WATER.bytes);
      await AsyncStorageOf().setItem('@fieldkit/guide_library', JSON.stringify({ downloaded: { 'test-water': WATER } }));
    });

    expect(await exists(fs, `${DIR}/test-knots.pdf`)).toBe(false);
    expect(await exists(fs, `${DIR}/test-water.pdf`)).toBe(true);
    expect(await exists(fs, `${DIR}/catalogue.json`)).toBe(true);
    expect(view.getByTestId('guide-download-test-knots')).toBeTruthy();
    expect(view.getByTestId('guide-open-test-water')).toBeTruthy();
  }, 30000);

  it('when the saved state cannot be read, nothing is deleted, and the next open finds the guides', async () => {
    let failing = true;
    let before: string | null = null;
    // AsyncStorage is required after the device is installed (the install resets modules).
    let storage = AsyncStorageOf();
    let getItem = storage.getItem as jest.Mock;
    let realGetItem!: (key: string, ...rest: unknown[]) => Promise<string | null>;
    // The saved state is unreadable from launch on: Home's Your library card starts the library at launch, and
    // that must fail too, deleting nothing.
    const h = await setupChatScreen({
      engine: 'llama', pdf: true, sqlite: true,
      beforeHome: async (boundary) => {
        const fs = boundary.fs!;
        DIR = require('../../../src/features/guideLibrary/guideLibraryService').GUIDE_LIBRARY_DIR;
        // Offline, so test-knots and test-water are guides the shipped catalogue does not list: their files are the
        // only copies the user can get.
        fs.seedFile(`${DIR}/test-knots.pdf`, KNOTS.bytes);
        fs.seedFile(`${DIR}/test-water.pdf`, WATER.bytes);
        storage = AsyncStorageOf();
        getItem = storage.getItem as jest.Mock;
        realGetItem = getItem.getMockImplementation()!;
        await storage.setItem('@fieldkit/guide_library', JSON.stringify({ downloaded: { 'test-knots': KNOTS, 'test-water': WATER } }));
        before = await storage.getItem('@fieldkit/guide_library');
        getItem.mockImplementation(async (key: string, ...rest: unknown[]) => {
          if (failing && key === '@fieldkit/guide_library') throw new Error('storage read failed');
          return realGetItem(key, ...rest);
        });
      },
    });
    const fs = h.boundary.fs!;
    const failedReads = () => getItem.mock.calls.filter(([key]) => key === '@fieldkit/guide_library').length;

    const { GuideLibraryScreen } = require('../../../src/screens/GuideLibraryScreen');
    const first = h.rtl.render(h.React.createElement(GuideLibraryScreen, {}));
    // The screen's start and its refresh each tried, and failed, to start the library.
    await h.rtl.waitFor(() => {
      expect(failedReads()).toBeGreaterThanOrEqual(2);
      expect(first.getByTestId('guide-library-refresh')).not.toBeBusy();
    }, { timeout: 4000 });
    expect(await exists(fs, `${DIR}/test-knots.pdf`)).toBe(true);
    expect(await exists(fs, `${DIR}/test-water.pdf`)).toBe(true);
    failing = false;
    expect(await storage.getItem('@fieldkit/guide_library')).toBe(before);
    first.unmount();

    const again = h.rtl.render(h.React.createElement(GuideLibraryScreen, {}));
    h.rtl.fireEvent.changeText(again.getByTestId('guide-library-search'), 'test');
    await h.rtl.waitFor(() => {
      expect(again.getByTestId('guide-open-test-knots')).toBeTruthy();
      expect(again.getByTestId('guide-open-test-water')).toBeTruthy();
    }, { timeout: 4000 });
    expect(again.getByText('No longer listed')).toBeTruthy();
    getItem.mockImplementation(realGetItem);
  }, 30000);

  it('a guide whose id is also an object property name shows as not downloaded and downloads', async () => {
    const body = '%PDF-1.4 a guide with an awkward id';
    const odd = guide('constructor', 'Test awkward id', 'fieldcraft', body);
    const { rtl, fs, view } = await openLibrary(f => {
      f.seedDownload(CATALOGUE_URL, catalogueOf([odd, WATER]));
      f.seedDownload(odd.url, body);
    });
    expect(view.getByText('Test awkward id')).toBeTruthy();
    rtl.fireEvent.press(view.getByTestId('guide-download-constructor'));
    await rtl.waitFor(() => { expect(view.getByTestId('guide-open-constructor')).toBeTruthy(); }, { timeout: 4000 });
    expect(view.getByText('2 guides · 1 downloaded · 0 taught')).toBeTruthy();
    expect(await exists(fs, `${DIR}/constructor.pdf`)).toBe(true);
  }, 30000);

  it('a downloaded guide shows the entry it was checked against after the catalogue corrects it', async () => {
    const h = await openLibrary(f => {
      f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
      f.seedDownload(KNOTS.url, KNOTS_BODY);
    });
    const { rtl, fs, view } = h;
    rtl.fireEvent.press(view.getByTestId('guide-download-test-knots'));
    await rtl.waitFor(() => { expect(view.getByTestId('guide-teach-test-knots')).toBeTruthy(); }, { timeout: 4000 });

    fs.seedDownload(CATALOGUE_URL, catalogueOf([{ ...KNOTS, title: 'Test knots, revised', hasText: false }, WATER, { ...WATER, id: 'test-rope', title: 'Test rope', hasText: false }]));
    rtl.fireEvent.press(view.getByTestId('guide-library-refresh'));
    await waitForRefresh(h, view, 2);
    // The new catalogue is in (a new guide is listed), but the downloaded row is the copy on the phone.
    expect(view.getByText('Test rope')).toBeTruthy();
    expect(view.getByText('Test knots')).toBeTruthy();
    expect(view.queryByText('Test knots, revised')).toBeNull();
    expect(view.getByTestId('guide-teach-test-knots')).toBeTruthy();
    expect(view.getAllByText("Read only. The assistant can't learn this guide.")).toHaveLength(1);

    // Once removed, the row is the catalogue's entry again.
    await removeGuide(h, view, 'test-knots');
    await rtl.waitFor(() => { expect(view.getByText('Test knots, revised')).toBeTruthy(); }, { timeout: 4000 });
    expect(view.queryByTestId('guide-teach-test-knots')).toBeNull();
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
    await rtl.waitFor(() => { expect(view.getByText(DIDNT_FINISH)).toBeTruthy(); }, { timeout: 4000 });
    expect(await exists(fs, `${DIR}/test-knots.pdf.part`)).toBe(false);

    fs.seedDownload(KNOTS.url, KNOTS_BODY);
    rtl.fireEvent.press(view.getByTestId('guide-download-test-knots'));
    await rtl.waitFor(() => { expect(view.getByTestId('guide-open-test-knots')).toBeTruthy(); }, { timeout: 4000 });
    expect(view.queryByText(DIDNT_FINISH)).toBeNull();
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

  describe('when the library cannot start (its folder cannot be made)', () => {
    // The first listed guide of the shipped catalogue: the only one shown while no catalogue can be loaded.
    const firstListed = () => bundledCatalogue.categories
      .map(c => bundledCatalogue.guides.find(g => g.category === c.id))
      .find(g => g !== undefined)!;
    const storage = () => {
      const m = require('@react-native-async-storage/async-storage');
      return m.default ?? m;
    };

    /** Open the library with mkdir of the library folder failing until `allow()` is called. */
    async function openBroken(seed: (fs: Fs) => void | Promise<void> = () => {}) {
      let failing = true;
      // The folder cannot be made from launch on, so Home's Your library card fails to start the library too.
      const h = await setupChatScreen({
        engine: 'llama', pdf: true, sqlite: true,
        beforeHome: async (boundary) => {
          const fsb = boundary.fs!;
          DIR = require('../../../src/features/guideLibrary/guideLibraryService').GUIDE_LIBRARY_DIR;
          const mkdirFn = fsb.module.mkdir as jest.Mock;
          const realMkdir = mkdirFn.getMockImplementation()!;
          mkdirFn.mockImplementation(async (p: string) => {
            if (failing && p === DIR) throw new Error('EACCES: permission denied');
            return realMkdir(p);
          });
          await seed(fsb);
        },
      });
      const fs = h.boundary.fs!;
      const mkdir = fs.module.mkdir as jest.Mock;
      const { GuideLibraryScreen } = require('../../../src/screens/GuideLibraryScreen');
      const view = h.rtl.render(h.React.createElement(GuideLibraryScreen, {}));
      // The screen's start and its refresh each tried, and failed, to start the library.
      await h.rtl.waitFor(() => {
        expect(mkdir.mock.calls.filter(([p]) => p === DIR).length).toBeGreaterThanOrEqual(2);
        expect(view.getByTestId('guide-library-refresh')).not.toBeBusy();
      }, { timeout: 4000 });
      return { ...h, fs, view, allow: () => { failing = false; } };
    }

    it('a download fails and saves nothing, and refresh changes nothing', async () => {
      const target = firstListed();
      const { rtl, fs, view } = await openBroken(f => {
        f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
        f.seedDownload(target.url, 'any body');
      });
      expect(downloadsOf(fs, CATALOGUE_URL)).toBe(0);

      rtl.fireEvent.press(view.getByTestId(`guide-download-${target.id}`));
      await rtl.waitFor(() => { expect(view.getByText("Couldn't download this guide. Try again.")).toBeTruthy(); }, { timeout: 4000 });
      expect(downloadsOf(fs, target.url)).toBe(0);
      expect(await storage().getItem('@fieldkit/guide_library')).toBeNull();
      expect(await exists(fs, `${DIR}/${target.id}.pdf`)).toBe(false);

      rtl.fireEvent.press(view.getByTestId('guide-library-refresh'));
      await rtl.waitFor(() => { expect(view.getByTestId('guide-library-refresh')).not.toBeBusy(); }, { timeout: 4000 });
      expect(downloadsOf(fs, CATALOGUE_URL)).toBe(0);
      expect(view.queryByText('Test knots')).toBeNull();
      expect(view.getByText(new RegExp(`^${bundledCatalogue.guides.length} guides`))).toBeTruthy();
    }, 30000);

    it('once it starts, a guide whose file and record are fine shows as downloaded, not as the failed download', async () => {
      const target = firstListed();
      const { rtl, view, allow } = await openBroken(async f => {
        f.seedFile(`${DIR}/${target.id}.pdf`, target.bytes);
        await storage().setItem('@fieldkit/guide_library', JSON.stringify({ downloaded: { [target.id]: target } }));
      });
      // Nothing is known about the saved guide yet, so it offers a download, which fails.
      rtl.fireEvent.press(view.getByTestId(`guide-download-${target.id}`));
      await rtl.waitFor(() => { expect(view.getByText("Couldn't download this guide. Try again.")).toBeTruthy(); }, { timeout: 4000 });

      allow();
      rtl.fireEvent.press(view.getByTestId('guide-library-refresh'));
      await rtl.waitFor(() => { expect(view.getByTestId(`guide-open-${target.id}`)).toBeTruthy(); }, { timeout: 4000 });
      expect(view.queryByTestId(`guide-download-${target.id}`)).toBeNull();
      expect(view.queryByText("Couldn't download this guide. Try again.")).toBeNull();
    }, 30000);
  });

  describe('when the catalogue no longer lists a downloaded guide', () => {
    async function refreshWith(h: Awaited<ReturnType<typeof openLibrary>>, catalogue: string, fetches: number) {
      h.fs.seedDownload(CATALOGUE_URL, catalogue);
      h.rtl.fireEvent.press(h.view.getByTestId('guide-library-refresh'));
      await waitForRefresh(h, h.view, fetches);
    }

    it('a downloaded guide dropped by a refresh stays usable under "No longer listed"', async () => {
      const h = await openLibrary(f => {
        f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
        f.seedDownload(KNOTS.url, KNOTS_BODY);
      });
      const { rtl, fs, view } = h;
      const { viewDocument } = require('@react-native-documents/viewer');
      rtl.fireEvent.press(view.getByTestId('guide-download-test-knots'));
      await rtl.waitFor(() => { expect(view.getByTestId('guide-open-test-knots')).toBeTruthy(); }, { timeout: 4000 });
      expect(view.queryByText(DELISTED_HEADING)).toBeNull();

      await refreshWith(h, catalogueOf([WATER]), 2);
      expect(view.getByText(DELISTED_HEADING)).toBeTruthy();
      expect(view.getByText(DELISTED_LINE)).toBeTruthy();
      expect(view.getByText('Test knots')).toBeTruthy();
      expect(view.queryByText('Fieldcraft and knots (1)')).toBeNull();
      expect(view.queryByTestId('guide-download-test-knots')).toBeNull();
      // It still counts, as a guide shown and as on the phone.
      expect(view.getByText('2 guides · 1 downloaded · 0 taught')).toBeTruthy();

      // Search filters the rows that are no longer listed too.
      const search = view.getByTestId('guide-library-search');
      rtl.fireEvent.changeText(search, 'water');
      expect(view.queryByText('Test knots')).toBeNull();
      expect(view.queryByText(DELISTED_HEADING)).toBeNull();
      rtl.fireEvent.changeText(search, 'test publisher');
      expect(view.getByText('Test knots')).toBeTruthy();
      expect(view.getByText(DELISTED_HEADING)).toBeTruthy();
      rtl.fireEvent.changeText(search, '');

      // Listed again, it goes back to its category as it was.
      await refreshWith(h, TEST_CATALOGUE, 3);
      expect(view.queryByText(DELISTED_HEADING)).toBeNull();
      expect(view.getByText('Fieldcraft and knots (1)')).toBeTruthy();
      expect(view.getByTestId('guide-open-test-knots')).toBeTruthy();

      await refreshWith(h, catalogueOf([WATER]), 4);
      rtl.fireEvent.press(view.getByTestId('guide-open-test-knots'));
      await rtl.waitFor(() => {
        expect(viewDocument).toHaveBeenCalledWith({ uri: 'file:///docs/guide-library/test-knots.pdf', mimeType: 'application/pdf', grantPermissions: 'read' });
      });
      expect(view.queryByText("Couldn't open this guide.")).toBeNull();

      // Removing it is for good, and the question says so.
      const message = await removeGuide(h, view, 'test-knots');
      expect(message).toBe('"Test knots" will be deleted from your phone. It is no longer in the library, so you won\'t be able to download it again.');
      await rtl.waitFor(() => { expect(view.queryByTestId('guide-row-test-knots')).toBeNull(); }, { timeout: 4000 });
      expect(view.queryByText(DELISTED_HEADING)).toBeNull();
      expect(view.getByText('1 guide · 0 downloaded · 0 taught')).toBeTruthy();
      expect(await exists(fs, `${DIR}/test-knots.pdf`)).toBe(false);
    }, 40000);

    /** Downloads of `url` write their file and report progress, but do not finish until `release()`. */
    function holdDownloads(fs: Fs, url: string) {
      let release = () => {};
      const gate = new Promise<void>(resolve => { release = resolve; });
      const downloadFile = fs.module.downloadFile as jest.Mock;
      const real = downloadFile.getMockImplementation()!;
      downloadFile.mockImplementation((opts: { fromUrl: string }) => {
        const job = real(opts);
        if (opts.fromUrl !== url) return job;
        job.promise.catch(() => {});
        return { jobId: job.jobId, promise: gate.then(() => job.promise) };
      });
      return () => release();
    }

    it('a guide dropped by a refresh while it downloads stays under "No longer listed" and finishes there', async () => {
      const h = await openLibrary(f => {
        f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
        f.seedDownload(KNOTS.url, KNOTS_BODY);
      });
      const { rtl, fs, view } = h;
      const release = holdDownloads(fs, KNOTS.url);
      rtl.fireEvent.press(view.getByTestId('guide-download-test-knots'));
      await rtl.waitFor(() => { expect(view.getByText('100%')).toBeTruthy(); }, { timeout: 4000 });

      await refreshWith(h, catalogueOf([WATER]), 2);
      expect(view.getByText(DELISTED_HEADING)).toBeTruthy();
      expect(view.getByText('Test knots')).toBeTruthy();
      expect(view.getByText('100%')).toBeTruthy();
      expect(view.queryByTestId('guide-download-test-knots')).toBeNull();
      expect(view.getByText('2 guides · 0 downloaded · 0 taught')).toBeTruthy();

      await rtl.act(async () => { release(); });
      await rtl.waitFor(() => { expect(view.getByTestId('guide-open-test-knots')).toBeTruthy(); }, { timeout: 4000 });
      expect(view.getByText(DELISTED_HEADING)).toBeTruthy();
      expect(view.getByText('2 guides · 1 downloaded · 0 taught')).toBeTruthy();
      // The refreshed catalogue has no entry for it: the file was checked against the one the download started with.
      expect((fs.module.hash as jest.Mock).mock.calls.some(([p]) => p === `${DIR}/test-knots.pdf.part`)).toBe(true);
      const m = require('@react-native-async-storage/async-storage');
      const saved = JSON.parse(await (m.default ?? m).getItem('@fieldkit/guide_library'));
      expect(saved.downloaded['test-knots']).toEqual(KNOTS);
      expect(await exists(fs, `${DIR}/test-knots.pdf`)).toBe(true);
    }, 40000);

    it('a guide dropped by a refresh while it downloads is gone when the download fails', async () => {
      const h = await openLibrary(f => {
        f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
        f.seedDownload(KNOTS.url, { status: 404 });
      });
      const { rtl, fs, view } = h;
      const release = holdDownloads(fs, KNOTS.url);
      rtl.fireEvent.press(view.getByTestId('guide-download-test-knots'));
      await rtl.waitFor(() => { expect(view.queryByTestId('guide-download-test-knots')).toBeNull(); }, { timeout: 4000 });

      await refreshWith(h, catalogueOf([WATER]), 2);
      expect(view.getByText(DELISTED_HEADING)).toBeTruthy();

      await rtl.act(async () => { release(); });
      await rtl.waitFor(() => { expect(view.queryByTestId('guide-row-test-knots')).toBeNull(); }, { timeout: 4000 });
      expect(view.queryByText(DELISTED_HEADING)).toBeNull();
      expect(view.getByText('1 guide · 0 downloaded · 0 taught')).toBeTruthy();
      expect(await exists(fs, `${DIR}/test-knots.pdf`)).toBe(false);
      expect(await exists(fs, `${DIR}/test-knots.pdf.part`)).toBe(false);
    }, 40000);

    it('a changed hash in a refreshed catalogue leaves the downloaded copy alone', async () => {
      const h = await openLibrary(f => {
        f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
        f.seedDownload(KNOTS.url, KNOTS_BODY);
      });
      const { rtl, fs, view } = h;
      const { viewDocument } = require('@react-native-documents/viewer');
      rtl.fireEvent.press(view.getByTestId('guide-download-test-knots'));
      await rtl.waitFor(() => { expect(view.getByTestId('guide-open-test-knots')).toBeTruthy(); }, { timeout: 4000 });

      await refreshWith(h, catalogueOf([{ ...KNOTS, sha256: sha256('a newer edition') }, WATER]), 2);
      expect(view.getByTestId('guide-open-test-knots')).toBeTruthy();
      expect(view.queryByTestId('guide-download-test-knots')).toBeNull();
      expect(view.queryByText(DELISTED_HEADING)).toBeNull();
      expect(view.queryByText("This file doesn't match the checked copy")).toBeNull();
      expect(await exists(fs, `${DIR}/test-knots.pdf`)).toBe(true);
      rtl.fireEvent.press(view.getByTestId('guide-open-test-knots'));
      await rtl.waitFor(() => { expect(viewDocument).toHaveBeenCalledTimes(1); });
      expect(view.queryByText("Couldn't open this guide.")).toBeNull();
    }, 30000);

    it('on a launch with no connection, a saved guide the shipped catalogue does not list is under "No longer listed"', async () => {
      const { rtl, view } = await openLibrary(async f => {
        f.seedFile(`${DIR}/test-knots.pdf`, KNOTS.bytes);
        const m = require('@react-native-async-storage/async-storage');
        await (m.default ?? m).setItem('@fieldkit/guide_library', JSON.stringify({ downloaded: { 'test-knots': KNOTS } }));
      });
      // The group comes after every shipped category, further down than the list first renders.
      rtl.fireEvent.changeText(view.getByTestId('guide-library-search'), 'test knots');
      expect(view.getByText(DELISTED_HEADING)).toBeTruthy();
      expect(view.getByText(DELISTED_LINE)).toBeTruthy();
      expect(view.getByTestId('guide-open-test-knots')).toBeTruthy();
      expect(view.getByTestId('guide-remove-test-knots')).toBeTruthy();
    }, 30000);
  });

  it('search filters by title, publisher and id', async () => {
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
    expect(view.getByText('No guides match your search.')).toBeTruthy();

    // A publication number is part of the id.
    rtl.fireEvent.changeText(search, 'TEST-WAT');
    expect(view.getByText('Test water')).toBeTruthy();
    expect(view.queryByText('Test knots')).toBeNull();
    expect(view.queryByText('No guides match your search.')).toBeNull();

    // Tapping a row shows where the guide comes from.
    rtl.fireEvent.changeText(search, '');
    expect(view.queryByText(KNOTS.url)).toBeNull();
    expect(view.getByTestId('guide-row-test-knots').props.accessibilityState).toEqual({ expanded: false });
    rtl.fireEvent.press(view.getByTestId('guide-row-test-knots'));
    expect(view.getByText(KNOTS.url)).toBeTruthy();
    expect(view.getByText(KNOTS.licenceNote)).toBeTruthy();
    expect(view.getByTestId('guide-row-test-knots').props.accessibilityState).toEqual({ expanded: true });
  }, 30000);

  it('a screen reader hears what each control is for', async () => {
    const h = await openLibrary(f => {
      f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
      f.seedDownload(KNOTS.url, KNOTS_BODY);
    });
    const { rtl, view } = h;
    expect(view.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Refresh guide list' })).toBeTruthy();
    expect(view.getByTestId('guide-row-test-knots').props.accessibilityRole).toBe('button');
    expect(view.getByLabelText('Download Test knots')).toBeTruthy();
    rtl.fireEvent.press(view.getByLabelText('Download Test knots'));
    await rtl.waitFor(() => { expect(view.getByLabelText('Open Test knots')).toBeTruthy(); }, { timeout: 4000 });
    expect(view.getByLabelText('Remove Test knots')).toBeTruthy();
    expect(view.getByLabelText('Assistant knows Test knots')).toBeTruthy();
    // The visible words are unchanged.
    expect(view.getByText('Open')).toBeTruthy();
    expect(view.getByText('Assistant knows this')).toBeTruthy();
  }, 30000);

  it('Download all asks first, downloads every guide not on the phone, and a failure does not stop the rest', async () => {
    const h = await openLibrary(f => {
      f.seedDownload(CATALOGUE_URL, TEST_CATALOGUE);
      // Test knots comes first and has no connection; Test water downloads.
      f.seedDownload(WATER.url, WATER_BODY);
    });
    const { rtl, view, fs } = h;
    const { formatBytes } = require('../../../src/utils/formatBytes');

    rtl.fireEvent.press(view.getByText('Download all'));
    await rtl.waitFor(() => { expect(view.getByText('Download all guides?')).toBeTruthy(); });
    expect(view.getByText(`2 guides, ${formatBytes(KNOTS.bytes + WATER.bytes)} in all. They download one at a time.`)).toBeTruthy();
    rtl.fireEvent.press(view.getAllByText('Download').at(-1)!); // the sheet's, drawn after the rows

    await rtl.waitFor(() => { expect(view.getByLabelText('Open Test water')).toBeTruthy(); }, { timeout: 4000 });
    expect(view.getByText(DIDNT_FINISH)).toBeTruthy();
    expect(view.getByText('2 guides · 1 downloaded · 0 taught')).toBeTruthy();

    // Once the connection is back, Download all fetches the one that failed and then goes away.
    fs.seedDownload(KNOTS.url, KNOTS_BODY);
    rtl.fireEvent.press(view.getByText('Download all'));
    await rtl.waitFor(() => { expect(view.getByText(`1 guide, ${formatBytes(KNOTS.bytes)} in all. They download one at a time.`)).toBeTruthy(); });
    rtl.fireEvent.press(view.getAllByText('Download').at(-1)!); // the sheet's, drawn after the rows
    await rtl.waitFor(() => { expect(view.getByText('2 guides · 2 downloaded · 0 taught')).toBeTruthy(); }, { timeout: 4000 });
    expect(view.queryByText('Download all')).toBeNull();
  }, 30000);
});
