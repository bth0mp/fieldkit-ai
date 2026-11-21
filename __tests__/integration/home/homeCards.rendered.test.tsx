/**
 * Home cards (rendered): the Field kit card opens each tool, the Your library card counts guides, Kiwix files
 * and projects the way their own screens do, and the Phone card shows free storage, downloaded models and the
 * gallery, leaving out only the storage line when the phone cannot report it.
 *
 * Real HomeScreen, GuideLibraryScreen, guide library service, Kiwix store and stores. Device leaves only: what
 * setupChatScreen installs (memfs behind react-native-fs with getFSInfo, the llama engine, sqlite), AsyncStorage
 * as the phone's storage, and the navigation mock.
 */
import { createHash } from 'crypto';
import { setupChatScreen } from '../../harness/chatHarness';
import { GB } from '../../harness/nativeBoundary';
import { CATALOGUE_URL } from '../../../src/features/guideLibrary/catalogue';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const TIMEOUT = { timeout: 6000 };
const PARTIAL = { exact: false };
const makeNav = () => ({ navigate: jest.fn(), goBack: () => {}, setOptions: () => {}, addListener: () => () => {} });
const asyncStorage = () => {
  const m = require('@react-native-async-storage/async-storage');
  return m.default ?? m;
};

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const BOWLINE = 'To tie a bowline, form a small overhand loop in the standing part.';
const WATER_TEXT = 'Boil water for one minute before drinking it.';
const guide = (id: string, title: string, body: string) => ({
  id, title, category: 'fieldcraft', publisher: 'Test publisher', year: 2020, licence: 'Public domain',
  licenceNote: 'US government work (17 U.S.C. 105).', url: `https://guides.example.gov/${id}.pdf`,
  bytes: Buffer.byteLength(body), sha256: sha256(body), pages: 12, hasText: true,
});
const KNOTS = guide('test-knots', 'Test knots', BOWLINE);
const WATER = guide('test-water', 'Test water', WATER_TEXT);
const CATALOGUE = JSON.stringify({
  version: 1, updated: '2026-11-17', categories: [{ id: 'fieldcraft', name: 'Fieldcraft and knots' }], guides: [KNOTS, WATER],
});
const keywordVector = (text: string) => [0.1, ...['bowline', 'boil'].map(k => (text.toLowerCase().includes(k) ? 1 : 0))];

describe('Home cards (rendered)', () => {
  beforeEach(async () => { await asyncStorage().clear(); });

  it('opens each field kit tool from Home', async () => {
    const h = await setupChatScreen({ engine: 'llama', sqlite: true });
    const { HomeScreen } = require('../../../src/screens/HomeScreen');
    const nav = makeNav();
    const home = h.rtl.render(h.React.createElement(HomeScreen, { navigation: nav }));

    for (const [id, label, route] of [
      ['home-kit-guides', 'Guides', 'GuideLibrary'],
      ['home-kit-signals', 'Signals', 'QuickReference'],
      ['home-kit-calc', 'Calc', 'Calculators'],
      ['home-kit-lists', 'Lists', 'Checklists'],
    ]) {
      expect(home.getByTestId(id)).toHaveTextContent(label);
      h.rtl.fireEvent.press(home.getByTestId(id));
      expect(nav.navigate).toHaveBeenLastCalledWith(route);
    }
  }, 30000);

  it('counts the library the way its own screens do', async () => {
    const h = await setupChatScreen({ engine: 'llama', pdf: true, sqlite: true });
    const { React, rtl, boundary } = h;
    const fs = boundary.fs!;
    fs.seedAsset('models/all-MiniLM-L6-v2-Q8_0.gguf', 'GGUF');
    boundary.llama!.scriptEmbedding(keywordVector);
    fs.seedDownload(CATALOGUE_URL, CATALOGUE);

    // The user downloads two guides in the Guide library and teaches the assistant one of them.
    const { GuideLibraryScreen } = require('../../../src/screens/GuideLibraryScreen');
    const library = rtl.render(React.createElement(GuideLibraryScreen, {}));
    await rtl.waitFor(() => { expect(library.getByTestId('guide-library-refresh')).not.toBeBusy(); expect(library.getByText('Test knots')).toBeTruthy(); }, TIMEOUT);
    for (const [entry, body] of [[KNOTS, BOWLINE], [WATER, WATER_TEXT]] as const) {
      fs.seedDownload(entry.url, body);
      rtl.fireEvent.press(library.getByTestId(`guide-download-${entry.id}`));
      await rtl.waitFor(() => { expect(library.getByTestId(`guide-open-${entry.id}`)).toBeTruthy(); }, TIMEOUT);
    }
    const { Switch } = require('react-native');
    const teach = () => library.UNSAFE_getAllByType(Switch).find((s: { props: { testID?: string } }) => s.props.testID === 'guide-teach-test-knots')!;
    rtl.fireEvent(teach(), 'valueChange', true);
    await rtl.waitFor(() => { expect(teach().props.value).toBe(true); expect(teach().props.disabled).toBeFalsy(); }, TIMEOUT);
    library.unmount();

    // Three Kiwix files, as the phone saved them.
    const files = Object.fromEntries(['a', 'b', 'c'].map(id => [id, { id, uri: `content://k/${id}.zim`, fileName: `${id}.zim`, title: id, description: '', bytes: 1, category: 'general' }]));
    await asyncStorage().setItem('@fieldkit/kiwix_files', JSON.stringify({ state: { files, folders: [], removed: [], refused: [] }, version: 0 }));
    await require('../../../src/services/kiwix/kiwixStore').useKiwixStore.persist.rehydrate();

    const { HomeScreen } = require('../../../src/screens/HomeScreen');
    const { useProjectStore } = require('../../../src/stores/projectStore');
    const nav = makeNav();
    const home = rtl.render(React.createElement(HomeScreen, { navigation: nav }));

    await rtl.waitFor(() => expect(home.getByTestId('home-library-guides')).toHaveTextContent('2 on phone, 1 taught', PARTIAL), TIMEOUT);
    expect(home.getByTestId('home-library-guides')).toHaveTextContent('Plus 6 that come with the app', PARTIAL);
    expect(home.getByTestId('home-library-kiwix')).toHaveTextContent('3 files', PARTIAL);
    expect(home.getByTestId('home-library-projects')).toHaveTextContent(String(useProjectStore.getState().projects.length), PARTIAL);
    for (const [id, route] of [['guides', 'GuideLibrary'], ['kiwix', 'KiwixFiles'], ['projects', 'ProjectsTab']]) {
      rtl.fireEvent.press(home.getByTestId(`home-library-${id}`));
      expect(nav.navigate).toHaveBeenLastCalledWith(route);
    }
  }, 30000);

  it('shows free storage and the downloaded models, and leaves the gallery out with no images', async () => {
    const h = await setupChatScreen({ engine: 'llama', sqlite: true, fsInfo: { freeSpace: 41 * GB, totalSpace: 256 * GB } });
    const { HomeScreen } = require('../../../src/screens/HomeScreen');
    const nav = makeNav();
    const home = h.rtl.render(h.React.createElement(HomeScreen, { navigation: nav }));

    await h.rtl.waitFor(() => expect(home.getByTestId('home-phone-storage')).toHaveTextContent('41.00 GB free of 256.00 GB'), TIMEOUT);
    expect(home.getByTestId('home-phone-models')).toHaveTextContent('1 downloaded', PARTIAL);
    expect(home.queryByTestId('home-phone-gallery')).toBeNull();
    h.rtl.fireEvent.press(home.getByTestId('home-phone-models'));
    expect(nav.navigate).toHaveBeenLastCalledWith('ModelsTab');
  }, 30000);

  it('drops only the storage line when the phone cannot report its storage', async () => {
    const h = await setupChatScreen({ engine: 'llama', sqlite: true, fsInfo: 'fail' });
    const { HomeScreen } = require('../../../src/screens/HomeScreen');
    const home = h.rtl.render(h.React.createElement(HomeScreen, { navigation: makeNav() }));

    await h.rtl.waitFor(() => expect(home.getByTestId('home-phone-models')).toHaveTextContent('1 downloaded', PARTIAL), TIMEOUT);
    // The read rejects: wait until it has been asked, then check it left no line behind.
    await h.rtl.waitFor(() => expect(require('react-native-fs').getFSInfo).toHaveBeenCalled(), TIMEOUT);
    await h.settle();
    expect(home.queryByTestId('home-phone-storage')).toBeNull();
  }, 30000);
});
