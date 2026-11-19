/**
 * Kiwix files (rendered): a download split into parts (.zimaa, .zimab ...) is named under "Not added" with the
 * reason, once per download, when its folder is added; the row goes when the parts are gone and the folder is
 * checked again; and picking one part with "Add Kiwix file" gives the same reason, not "can't be opened any more".
 *
 * Real stack: KiwixFilesScreen, kiwixService with its store and ZIM reader, the library projects. Device leaves
 * only: the document picker, the folder listing and the content:// reads (installNativeBoundary({ documents })).
 */
import { setupChatScreen } from '../../harness/chatHarness';
import { buildZim, WIKIMED } from '../../harness/zimFixture';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, [effect]),
  useIsFocused: () => true,
}));

const TREE = 'content://com.android.externalstorage.documents/tree/primary%3AAndroid%2Fmedia%2Forg.kiwix.kiwixmobile';
const SPLIT = "Fieldkit can't read a Kiwix file that is split into parts (.zimaa, .zimab and so on). Use the single .zim file instead.";

describe('Kiwix files (rendered): a download split into parts', () => {
  it('is named once under "Not added" with the reason, and the row goes when the parts do', async () => {
    const h = await setupChatScreen({ engine: 'llama', sqlite: true, documents: true });
    const { React, rtl, boundary } = h;
    const docs = boundary.documents!;
    const picker = require('@react-native-documents/picker');

    // DEVICE BOUNDARY: the granted folder holds one whole file and one download in two parts.
    const whole = buildZim(WIKIMED);
    docs.seed(`${TREE}/wikimed.zim`, whole);
    docs.seed(`${TREE}/wikipedia_en_all_maxi.zimaa`, whole.subarray(0, 200));
    docs.seed(`${TREE}/wikipedia_en_all_maxi.zimab`, whole.subarray(200));
    picker.pickDirectory.mockResolvedValue({ uri: TREE, bookmarkStatus: 'success', bookmark: 'b' });
    const { KiwixFilesScreen } = require('../../../src/screens/KiwixFilesScreen');

    const screen = rtl.render(React.createElement(KiwixFilesScreen, {}));
    rtl.fireEvent.press(screen.getByText('Add Kiwix folder'));
    await rtl.waitFor(() => { expect(screen.getByText('First aid and medical (1)')).toBeTruthy(); }, { timeout: 4000 });

    // The split download is explained, in one row.
    await rtl.waitFor(() => { expect(screen.getByText('Not added')).toBeTruthy(); });
    expect(screen.getByText('wikipedia_en_all_maxi.zimaa')).toBeTruthy();
    expect(screen.getByText(SPLIT)).toBeTruthy();
    expect(screen.queryByText('wikipedia_en_all_maxi.zimab')).toBeNull();

    // The user deletes the parts in a file manager and checks the folder again: nothing is left to explain.
    docs.remove(`${TREE}/wikipedia_en_all_maxi.zimaa`);
    docs.remove(`${TREE}/wikipedia_en_all_maxi.zimab`);
    rtl.fireEvent.press(screen.getByText('Check for new files'));
    await rtl.waitFor(() => { expect(screen.queryByText('Not added')).toBeNull(); });
    expect(screen.getByText('First aid and medical (1)')).toBeTruthy();

    // Picking a single part says the same thing about that part.
    picker.pick.mockResolvedValueOnce([{ uri: `${TREE}/other.zimab`, name: 'other.zimab', size: 1, bookmarkStatus: 'success', bookmark: 'b' }]);
    rtl.fireEvent.press(screen.getByText('Add Kiwix file'));
    await rtl.waitFor(() => { expect(screen.getByText('other.zimab')).toBeTruthy(); });
    expect(screen.getByText(SPLIT)).toBeTruthy();
    expect(screen.queryByText("This Kiwix file can't be opened any more.")).toBeNull();
  });

  it('a file whose download stopped part way is named as damaged, with what to do about it', async () => {
    const h = await setupChatScreen({ engine: 'llama', sqlite: true, documents: true });
    const { React, rtl, boundary } = h;
    const whole = buildZim(WIKIMED);
    boundary.documents!.seed(`${TREE}/wikimed.zim`, whole);
    boundary.documents!.seed(`${TREE}/half.zim`, whole.subarray(0, Math.floor(whole.length / 2)));
    require('@react-native-documents/picker').pickDirectory.mockResolvedValue({ uri: TREE, bookmarkStatus: 'success', bookmark: 'b' });
    const { KiwixFilesScreen } = require('../../../src/screens/KiwixFilesScreen');

    const screen = rtl.render(React.createElement(KiwixFilesScreen, {}));
    rtl.fireEvent.press(screen.getByText('Add Kiwix folder'));
    await rtl.waitFor(() => { expect(screen.getByText('First aid and medical (1)')).toBeTruthy(); }, { timeout: 4000 });
    await rtl.waitFor(() => { expect(screen.getByText('half.zim')).toBeTruthy(); });
    expect(screen.getByText('This Kiwix file is damaged or incomplete. Download it again in Kiwix.')).toBeTruthy();
    expect(screen.queryByText("This Kiwix file can't be opened any more.")).toBeNull();
  });
});
