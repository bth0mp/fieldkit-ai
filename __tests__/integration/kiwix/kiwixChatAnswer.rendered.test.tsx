/**
 * Kiwix files in a chat (rendered): a Kiwix file the user added sits in its category project; that project's chat
 * names the file in the system prompt, and the model's search_knowledge_base call returns the article's text,
 * which the user can open in the tool result and which reaches the model's next turn.
 *
 * Real stack: kiwixService with its store and ZIM reader, the library projects, the tool registry and handler, and
 * the real ChatScreen send path. Device leaves only: the document picker and the content:// reads
 * (installNativeBoundary({ documents })), the llama.rn context, and op-sqlite on node:sqlite.
 */
import { setupChatScreen } from '../../harness/chatHarness';
import { buildZim, WIKIMED } from '../../harness/zimFixture';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));

const WIKIMED_URI = 'content://com.android.externalstorage.documents/document/primary%3ADownload%2Fwikimed.zim';
const toolCallText = (name: string, args: Record<string, unknown>) => `<tool_call>${JSON.stringify({ name, arguments: args })}</tool_call>`;
const openRoute = (params: Record<string, unknown>) => { require('../../harness/chatHarness').routeHolder.params = params; };

describe('Kiwix files in a chat (rendered)', () => {
  it('a medical chat looks up the burn article in WikiMed and answers from it', async () => {
    const h = await setupChatScreen({ engine: 'llama', sqlite: true, documents: true });
    const { rtl, boundary } = h;

    // DEVICE BOUNDARY: the file Kiwix downloaded, which the user picks with "Add Kiwix file".
    boundary.documents!.seed(WIKIMED_URI, buildZim(WIKIMED));
    const picker = require('@react-native-documents/picker');
    picker.pick.mockResolvedValueOnce([{ uri: WIKIMED_URI, name: 'wikimed.zim', size: 4096, bookmarkStatus: 'success', bookmark: 'b' }]);
    const { kiwixService } = require('../../../src/services/kiwix/kiwixService');
    await kiwixService.addFiles();

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
  }, 30000);
});
