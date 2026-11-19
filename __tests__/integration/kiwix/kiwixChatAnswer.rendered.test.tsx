/**
 * Kiwix files (rendered): from the Guide library the user opens Kiwix files and adds the folder Kiwix downloads
 * into; each file is sorted into its category project, which lists it in its knowledge base. That project's chat
 * names the file in the system prompt, and the model's search_knowledge_base call returns the article's text,
 * which the user can open in the tool result and which reaches the model's next turn. The user then moves a file
 * to another category, and a deleted category project takes its files with it.
 *
 * Real stack: GuideLibraryScreen, KiwixFilesScreen, KnowledgeBaseScreen and ChatScreen; kiwixService with its
 * store and ZIM reader, the library projects, the tool registry and handler. Device leaves only: the document
 * picker, the folder listing and the content:// reads (installNativeBoundary({ documents })), the llama.rn
 * context, op-sqlite on node:sqlite, and the navigation mock, whose `navigate` is captured here.
 */
import { setupChatScreen } from '../../harness/chatHarness';
import { buildZim, WIKIMED } from '../../harness/zimFixture';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  // The screen is focused while it is mounted: a focus effect runs on mount, like the first focus.
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, [effect]),
  useIsFocused: () => true,
}));

const TREE = 'content://com.android.externalstorage.documents/tree/primary%3AAndroid%2Fmedia%2Forg.kiwix.kiwixmobile';
const WIKIVOYAGE = { ...WIKIMED, name: 'wikivoyage_en_all', title: 'Wikivoyage test', description: 'Travel guides', tags: 'wikivoyage', articles: [{ path: 'Trail', title: 'Trail', html: '<p>Stay on the marked trail.</p>' }], redirects: [] };
const toolCallText = (name: string, args: Record<string, unknown>) => `<tool_call>${JSON.stringify({ name, arguments: args })}</tool_call>`;
const openRoute = (params: Record<string, unknown>) => { require('../../harness/chatHarness').routeHolder.params = params; };

describe('Kiwix files (rendered)', () => {
  it('adds the Kiwix folder, answers a medical question from WikiMed, then moves and drops files', async () => {
    const h = await setupChatScreen({ engine: 'llama', sqlite: true, documents: true });
    const { React, rtl, boundary } = h;

    // DEVICE BOUNDARY: the folder Kiwix downloads into, which the user grants with the folder picker.
    boundary.documents!.seed(`${TREE}/wikimed.zim`, buildZim(WIKIMED));
    boundary.documents!.seed(`${TREE}/wikivoyage.zim`, buildZim(WIKIVOYAGE));
    require('@react-native-documents/picker').pickDirectory.mockResolvedValue({ uri: TREE, bookmarkStatus: 'success', bookmark: 'b' });
    const { GuideLibraryScreen } = require('../../../src/screens/GuideLibraryScreen');
    const { KiwixFilesScreen } = require('../../../src/screens/KiwixFilesScreen');
    const { KnowledgeBaseScreen } = require('../../../src/screens/KnowledgeBaseScreen');
    const { useKiwixStore } = require('../../../src/services/kiwix/kiwixStore');
    const { useProjectStore } = require('../../../src/stores');

    // The Guide library has a Kiwix files row.
    const library = rtl.render(React.createElement(GuideLibraryScreen, {}));
    rtl.fireEvent.press(await rtl.waitFor(() => library.getByTestId('guide-library-open-kiwix')));
    expect(mockNavigate).toHaveBeenCalledWith('KiwixFiles');
    library.unmount();

    // The user adds the folder; each file lands in its category, collapsed until opened.
    const files = rtl.render(React.createElement(KiwixFilesScreen, {}));
    rtl.fireEvent.press(files.getByText('Add Kiwix folder'));
    await rtl.waitFor(() => { expect(files.getByText('First aid and medical (1)')).toBeTruthy(); }, { timeout: 4000 });
    expect(files.getByText('Hiking and travel (1)')).toBeTruthy();
    expect(files.queryByText('WikiMed test')).toBeNull();
    rtl.fireEvent.press(files.getByText('First aid and medical (1)'));
    expect(files.getByText('WikiMed test')).toBeTruthy();
    files.unmount();

    // The medical project's knowledge base lists the file.
    const wikimedId = Object.values(useKiwixStore.getState().files as Record<string, { id: string; title: string }>).find(f => f.title === 'WikiMed test')!.id;
    openRoute({ projectId: 'library-medical' });
    const kb = rtl.render(React.createElement(KnowledgeBaseScreen, {}));
    await rtl.waitFor(() => { expect(kb.getByTestId(`kb-kiwix-${wikimedId}`)).toBeTruthy(); });
    expect(kb.getByText('WikiMed test')).toBeTruthy();
    kb.unmount();

    // A chat in the medical project; the model looks the question up.
    openRoute({ projectId: 'library-medical' });
    h.render();
    await h.send('How do I treat a burn?', { text: toolCallText('search_knowledge_base', { query: 'burn' }) });
    await rtl.waitFor(() => { expect(boundary.llama!.calls.completion.length).toBeGreaterThan(0); }, { timeout: 6000 });
    boundary.llama!.scriptCompletion({ text: 'Cool it under running water.' });
    await rtl.waitFor(() => { expect(h.view!.queryByText(/Cool it under running water/)).not.toBeNull(); }, { timeout: 6000 });

    // The tool result shows which file and article it came from, and the article's text.
    rtl.fireEvent.press(await rtl.waitFor(() => h.view!.getByTestId('tool-result-label-search_knowledge_base')));
    await rtl.waitFor(() => { expect(h.view!.getByText(/\[WikiMed test\] Burn/)).toBeTruthy(); });
    expect(h.view!.getByText(/Cool the burn under cool running water/)).toBeTruthy();

    // The system prompt named the file, and the article reached the model's next turn.
    expect(JSON.stringify(boundary.llama!.calls.completion[0])).toContain('Kiwix files: WikiMed test');
    expect(JSON.stringify(boundary.llama!.calls.completion.at(-1))).toContain('Cool the burn under cool running water');
    h.view!.unmount();

    // Back on Kiwix files, the user moves WikiMed to General reference through the category sheet.
    const again = rtl.render(React.createElement(KiwixFilesScreen, {}));
    rtl.fireEvent.press(again.getByText('First aid and medical (1)'));
    rtl.fireEvent.press(again.getByText('WikiMed test'));
    rtl.fireEvent.press(await rtl.waitFor(() => again.getByTestId('kiwix-category-general')));
    await rtl.waitFor(() => { expect(again.getByText('General reference (1)')).toBeTruthy(); });
    expect(again.queryByText('First aid and medical (1)')).toBeNull();
    again.unmount();

    // The user deletes the travel project; when the screen is next shown, its file is gone too.
    useProjectStore.getState().deleteProject('library-travel');
    const afterDelete = rtl.render(React.createElement(KiwixFilesScreen, {}));
    await rtl.waitFor(() => { expect(afterDelete.queryByText('Hiking and travel (1)')).toBeNull(); });
    expect(afterDelete.getByText('General reference (1)')).toBeTruthy();
  }, 40000);
});
