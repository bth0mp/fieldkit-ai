/**
 * Field guides (rendered) — the public-domain guides shipped in the APK land in a "Field guides" project on
 * first launch, and a question asked in that project's chat reaches the model together with the matching
 * passage from the right guide.
 *
 * Real stack: the real first-launch seeding (copy out of the APK → ragService.indexDocument → documentService →
 * chunking → embedding → real SQL), the real KnowledgeBaseScreen, and the real ChatScreen send path with its
 * project RAG injection. Device leaves only: memfs + APK assets (the real file names from
 * android/app/src/main/assets/guides), the native PDF extractor (a file's contents are its text layer), the
 * llama.rn context (keyword embedding vectors so ranking is predictable), and op-sqlite on node:sqlite.
 */
import { readdirSync } from 'fs';
import { join } from 'path';
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));

const BOWLINE = 'To tie a bowline, form a small overhand loop in the standing part, pass the running end up through the loop, around behind the standing part and back down through the loop.';
// The text layer each shipped PDF gets in this test, keyed by a word in its asset file name.
const TEXT_BY_ASSET: Record<string, string> = {
  survival: BOWLINE,
  ships: 'Close a clean cut with a suture or skin closure strips within twelve hours of the injury.',
  'first-aid': 'Apply a tourniquet two to three inches above the wound, never over a joint.',
  hygiene: 'Dig a cat-hole latrine at least thirty metres from any water source.',
  solar: 'A solar array charges the pump controller; size the array for the worst month.',
  'direct-current': 'A battery is two or more cells connected together to supply direct current.',
};
const KEYWORDS = ['bowline', 'suture', 'tourniquet', 'latrine', 'solar', 'battery'];
const keywordVector = (text: string) => [0.1, ...KEYWORDS.map(k => (text.toLowerCase().includes(k) ? 1 : 0))];
// The route the navigation mock serves: its require runs in the module registry the harness reset to.
const openRoute = (params: Record<string, unknown>) => { require('../../harness/chatHarness').routeHolder.params = params; };

describe('Field guides (rendered)', () => {
  it('a Field guides chat sends the bowline passage from the survival manual with the question', async () => {
    const h = await setupChatScreen({ engine: 'llama', pdf: true, sqlite: true });
    const { React, rtl, boundary } = h;

    // DEVICE BOUNDARY: what the APK ships — the embedding model and every guide PDF, by their real file names.
    const shipped = readdirSync(join(__dirname, '../../../android/app/src/main/assets/guides'));
    boundary.fs!.seedAsset('models/all-MiniLM-L6-v2-Q8_0.gguf', 'GGUF');
    for (const file of shipped) {
      const key = Object.keys(TEXT_BY_ASSET).find(k => file.includes(k));
      if (!key) throw new Error(`no test text for shipped guide ${file}`);
      // The survival manual is far over the 5MB limit for picked files, as the real one (23MB) is.
      boundary.fs!.seedAsset(`guides/${file}`, key === 'survival' ? `${BOWLINE}\n\n${'\n'.repeat(6 * 1024 * 1024)}` : TEXT_BY_ASSET[key]);
    }
    boundary.llama!.scriptEmbedding(keywordVector);

    // App launch: the boot step that prepares the bundled guides.
    const { seedFieldGuides, FIELD_GUIDES_PROJECT_ID } = require('../../../src/features/fieldGuides/fieldGuides');
    const { KnowledgeBaseScreen } = require('../../../src/screens/KnowledgeBaseScreen');
    await seedFieldGuides();

    // The user opens the Field guides project's knowledge base and sees every shipped guide.
    openRoute({ projectId: FIELD_GUIDES_PROJECT_ID });
    const kb = rtl.render(React.createElement(KnowledgeBaseScreen, {}));
    await rtl.waitFor(() => { expect(kb.queryByText('Survival (US Army ATP 3-50.21).pdf')).not.toBeNull(); }, { timeout: 4000 });
    expect(kb.queryByText("Ship's Medicine Chest and Medical Aid at Sea (US Public Health Service).pdf")).not.toBeNull();
    expect(kb.queryAllByText(/\.pdf$/)).toHaveLength(shipped.length);
    kb.unmount();

    // ...then starts a chat in that project and asks how to tie a bowline.
    openRoute({ projectId: FIELD_GUIDES_PROJECT_ID });
    h.render();
    await h.send('How do I tie a bowline?', { text: 'Form a small loop, pass the end up through it, around the standing part and back down.' });
    await rtl.waitFor(() => { expect(h.view!.queryByText(/around the standing part and back down/)).not.toBeNull(); }, { timeout: 6000 });

    // The model received the survival manual's passage, labelled with its guide.
    const sent = JSON.stringify(boundary.llama!.calls.completion.at(-1));
    expect(sent).toContain('[Source: Survival (US Army ATP 3-50.21).pdf (part 1)]');
    expect(sent).toContain('pass the running end up through the loop');
  }, 30000);
});
