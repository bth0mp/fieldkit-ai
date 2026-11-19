/**
 * Guide library entry points (rendered) — the Field guides knowledge base screen and Settings each carry a
 * row that opens the Guide library, no other project's knowledge base does, and the licences screen says
 * where downloaded guides are credited. The entry points only navigate: opening them fetches nothing.
 *
 * Real screens; the device boundary is memfs + the react-native-fs fake (to prove nothing downloads), and
 * the navigation mock, whose `navigate` is captured here.
 */
import { setupChatScreen } from '../../harness/chatHarness';

const mockNavigate = jest.fn();
// Whether the screen is focused, as the navigator reports it. Tests blur and focus it like a push and a back.
const mockFocus = { focused: true, listeners: new Set<() => void>() };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => require('react').useSyncExternalStore(
    (onChange: () => void) => { mockFocus.listeners.add(onChange); return () => { mockFocus.listeners.delete(onChange); }; },
    () => mockFocus.focused,
  ),
}));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));
jest.mock('../../../src/components/AnimatedListItem', () => ({
  AnimatedListItem: ({ children, onPress, style, testID }: any) => {
    const { TouchableOpacity } = require('react-native');
    const React = require('react');
    return React.createElement(TouchableOpacity, { style, onPress, testID }, children);
  },
}));

const openRoute = (params: Record<string, unknown>) => { require('../../harness/chatHarness').routeHolder.params = params; };
const setFocused = (focused: boolean) => { mockFocus.focused = focused; mockFocus.listeners.forEach(l => l()); };

describe('Guide library entry points (rendered)', () => {
  beforeEach(() => { mockNavigate.mockClear(); mockFocus.focused = true; });

  it('the knowledge base of a library project offers the Guide library and opens it without downloading anything', async () => {
    const h = await setupChatScreen({ engine: 'llama', pdf: true, sqlite: true });
    const { React, rtl, boundary } = h;
    const LIBRARY_PROJECT_ID = 'library-medical';
    const { KnowledgeBaseScreen } = require('../../../src/screens/KnowledgeBaseScreen');

    // Empty state: nothing has been added yet.
    openRoute({ projectId: LIBRARY_PROJECT_ID });
    const kb = rtl.render(React.createElement(KnowledgeBaseScreen, {}));
    await rtl.waitFor(() => { expect(kb.queryByText('No documents yet')).not.toBeNull(); });
    expect(kb.queryByText('Guide library')).not.toBeNull();
    expect(kb.queryByText('Download more free guides')).not.toBeNull();

    rtl.fireEvent.press(kb.getByTestId('kb-open-guide-library'));
    expect(mockNavigate).toHaveBeenCalledWith('GuideLibrary');

    // Opening the screen and pressing the row fetched nothing.
    expect(boundary.fs!.module.downloadFile).not.toHaveBeenCalled();
  }, 30000);

  it('back on the knowledge base of a library project, it lists a guide taught meanwhile', async () => {
    const h = await setupChatScreen({ engine: 'llama', pdf: true, sqlite: true });
    const { React, rtl, boundary } = h;
    const fs = boundary.fs!;
    fs.seedAsset('models/all-MiniLM-L6-v2-Q8_0.gguf', 'GGUF');
    boundary.llama!.scriptEmbedding(() => [0.1, 1]);
    const { ragService } = require('../../../src/services/rag');
    const LIBRARY_PROJECT_ID = 'library-medical';
    const index = async (name: string, text: string) => {
      const path = `${fs.DocumentDirectoryPath}/guide-library/${name}`;
      await (fs.module.writeFile as (p: string, c: string) => Promise<void>)(path, text);
      await ragService.indexDocument({ projectId: LIBRARY_PROJECT_ID, filePath: path, fileName: name, fileSize: text.length, bundled: true });
    };
    await index('First guide.pdf', 'How to tie a bowline.');
    const { KnowledgeBaseScreen } = require('../../../src/screens/KnowledgeBaseScreen');
    openRoute({ projectId: LIBRARY_PROJECT_ID });
    const kb = rtl.render(React.createElement(KnowledgeBaseScreen, {}));
    await rtl.waitFor(() => { expect(kb.getByText('First guide.pdf')).toBeTruthy(); });
    expect(kb.getByText('Guide library')).toBeTruthy();

    // The user opens the Guide library, a guide is taught there, and they come back.
    rtl.fireEvent.press(kb.getByTestId('kb-open-guide-library'));
    rtl.act(() => { setFocused(false); });
    await index('Second guide.pdf', 'Boil water for one minute.');
    rtl.act(() => { setFocused(true); });
    await rtl.waitFor(() => {
      expect(kb.getByText('First guide.pdf')).toBeTruthy();
      expect(kb.getByText('Second guide.pdf')).toBeTruthy();
    });
    expect(kb.getByText('Guide library')).toBeTruthy();
  }, 30000);

  it('a knowledge base for any other project does not offer the Guide library', async () => {
    const h = await setupChatScreen({ engine: 'llama', pdf: true, sqlite: true });
    const { React, rtl } = h;
    const { KnowledgeBaseScreen } = require('../../../src/screens/KnowledgeBaseScreen');

    openRoute({ projectId: 'some-other-project' });
    const kb = rtl.render(React.createElement(KnowledgeBaseScreen, {}));
    await rtl.waitFor(() => { expect(kb.queryByText('No documents yet')).not.toBeNull(); });
    expect(kb.queryByTestId('kb-open-guide-library')).toBeNull();
    expect(kb.queryByText('Download more free guides')).toBeNull();
  }, 30000);

  it('Settings offers the Guide library and opens it', async () => {
    const { React, rtl } = await setupChatScreen({ engine: 'llama', pdf: true, sqlite: true });
    const { SettingsScreen } = require('../../../src/screens/SettingsScreen');
    const view = rtl.render(React.createElement(SettingsScreen));
    expect(view.queryByText('Free guides to download and use offline')).not.toBeNull();
    rtl.fireEvent.press(view.getByTestId('settings-guide-library'));
    expect(mockNavigate).toHaveBeenCalledWith('GuideLibrary');
  }, 30000);

  it('the licences screen says where downloaded guides are credited', async () => {
    const { React, rtl } = await setupChatScreen({ engine: 'llama', pdf: true, sqlite: true });
    const { OpenSourceLicensesScreen } = require('../../../src/screens/OpenSourceLicensesScreen');
    const view = rtl.render(React.createElement(OpenSourceLicensesScreen));
    expect(view.queryByText(/Guides you download from the Guide library are listed there with their licences\./)).not.toBeNull();
  }, 30000);
});
