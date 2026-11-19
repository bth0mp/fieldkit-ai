/**
 * Moving off the Field guides project (rendered) — an install from before the library projects has every guide
 * in one "Field guides" project. At launch its documents move, with their embeddings, into the project of their
 * category (a bundled guide by name, a library guide by its catalogue entry, anything the user added to General
 * reference), and the Field guides project goes. Its chats stay, unfiled.
 *
 * Real stack: ragService.indexDocument → chunking → embedding → real SQL, the project and chat stores, the real
 * KnowledgeBaseScreen and ProjectsScreen. Device leaves only: memfs, the native PDF extractor, the llama.rn
 * embedding context and op-sqlite on node:sqlite.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));

const openRoute = (params: Record<string, unknown>) => { require('../../harness/chatHarness').routeHolder.params = params; };

describe('moving off the Field guides project (rendered)', () => {
  it('puts each document in its category project, keeps its embeddings and unfiles the chats', async () => {
    const h = await setupChatScreen({ engine: 'llama', pdf: true, sqlite: true });
    const { React, rtl, boundary } = h;
    const fs = boundary.fs!;
    fs.seedAsset('models/all-MiniLM-L6-v2-Q8_0.gguf', 'GGUF');
    boundary.llama!.scriptEmbedding(() => [0.1, 1]);
    const { ragService } = require('../../../src/services/rag');
    const { useProjectStore, useChatStore } = require('../../../src/stores');
    const { bundledCatalogue } = require('../../../src/features/guideLibrary/catalogue');
    const { GUIDE_LIBRARY_DIR } = require('../../../src/features/guideLibrary/guideLibraryService');
    const powerGuide = bundledCatalogue.guides.find((g: { category: string }) => g.category === 'power');
    const libraryName = `${powerGuide.title} (${powerGuide.publisher}).pdf`;

    // An older install: one Field guides project holding a bundled guide, a library guide and the user's own file.
    useProjectStore.getState().createProject({ id: 'field-guides', name: 'Field guides', description: '', systemPrompt: '' });
    const index = async (path: string, name: string, text: string) => {
      await (fs.module.writeFile as (p: string, c: string) => Promise<void>)(path, text);
      return ragService.indexDocument({ projectId: 'field-guides', filePath: path, fileName: name, fileSize: text.length, bundled: true });
    };
    const ids = [
      await index(`${fs.DocumentDirectoryPath}/field-guides/atp-3-50-21-survival.pdf`, 'Survival (US Army ATP 3-50.21).pdf', 'How to tie a bowline.'),
      await index(`${GUIDE_LIBRARY_DIR}/${powerGuide.id}.pdf`, libraryName, 'A battery stores charge.'),
      await index(`${fs.DocumentDirectoryPath}/my-notes.txt`, 'my-notes.txt', 'Water filter is in the shed.'),
    ];
    const chatId = useChatStore.getState().createConversation('m', 'Knots chat', 'field-guides');

    // Next launch.
    const { moveOffFieldGuidesProject } = require('../../../src/features/library/moveFieldGuides');
    await moveOffFieldGuidesProject();

    const { KnowledgeBaseScreen } = require('../../../src/screens/KnowledgeBaseScreen');
    const shows = async (projectId: string, name: string) => {
      openRoute({ projectId });
      const kb = rtl.render(React.createElement(KnowledgeBaseScreen, {}));
      await rtl.waitFor(() => { expect(kb.queryByText(name)).not.toBeNull(); }, { timeout: 4000 });
      kb.unmount();
    };
    await shows('library-fieldcraft', 'Survival (US Army ATP 3-50.21).pdf');
    await shows('library-power', libraryName);
    await shows('library-general', 'my-notes.txt');

    // The same documents moved, embeddings and all: nothing was indexed again.
    for (const id of ids) expect(await ragService.hasEmbeddings(id)).toBe(true);

    const { ProjectsScreen } = require('../../../src/screens/ProjectsScreen');
    const projects = rtl.render(React.createElement(ProjectsScreen, {}));
    await rtl.waitFor(() => { expect(projects.queryByText('Fieldcraft, knots and survival')).not.toBeNull(); });
    expect(projects.queryByText('Field guides')).toBeNull();
    projects.unmount();

    const chat = useChatStore.getState().conversations.find((c: { id: string }) => c.id === chatId);
    expect(chat?.projectId).toBeUndefined();

    // A later launch does nothing more.
    useProjectStore.getState().createProject({ id: 'field-guides', name: 'Field guides', description: '', systemPrompt: '' });
    await moveOffFieldGuidesProject();
    expect(useProjectStore.getState().getProject('field-guides')).toBeDefined();
  }, 40000);
});
