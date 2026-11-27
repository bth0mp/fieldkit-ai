/**
 * Deleting a chat deletes the images made in it, from every screen that can delete a chat.
 *
 * Home's Recent list and a project's chat list used to remove the chat alone: its images stayed on the
 * phone's disk and in the Gallery. One chat with two generated images is seeded, one with its file on the
 * disk and one whose file is already gone (the native module rejects that one). The chat is deleted through
 * the real swipe button and dialog; then the file is gone and the Gallery shows nothing.
 *
 * Real HomeScreen, ProjectChatsScreen, GalleryScreen, stores and services. Fakes only at the device boundary:
 * the file system and the diffusion native module (nativeBoundary).
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

jest.setTimeout(30000);

const TITLE = 'Sketch a lighthouse';
const NAV = { navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} };

async function seedChatWithImages(projectId?: string) {
  const t = await setupChatScreen({ engine: 'llama' });
  const { useChatStore, useAppStore } = require('../../../src/stores');
  const now = new Date().toISOString();
  const conversationId = 'chat-with-images';
  useChatStore.setState({
    conversations: [{
      id: conversationId, title: TITLE, modelId: 'm', projectId, createdAt: now, updatedAt: now,
      messages: [{ id: 'u1', role: 'user', content: TITLE, timestamp: 1 }],
    }],
    activeConversationId: null,
  });
  const image = (id: string) => ({
    id, prompt: id, imagePath: `/generated_images/${id}.png`, width: 512, height: 512, steps: 8, seed: 1,
    modelId: 'sd', createdAt: now, conversationId,
  });
  t.boundary.diffusion.seedImage('img-on-disk'); // img-lost has no file: the native module rejects it
  useAppStore.setState({ generatedImages: [image('img-on-disk'), image('img-lost')] });
  return t;
}

async function expectGalleryEmpty(t: Awaited<ReturnType<typeof setupChatScreen>>) {
  const { GalleryScreen } = require('../../../src/screens/GalleryScreen');
  const gallery = t.rtl.render(t.React.createElement(GalleryScreen));
  await t.rtl.waitFor(() => { expect(gallery.getByText('No generated images yet')).toBeTruthy(); });
  gallery.unmount();
}

describe('deleting a chat deletes its images (rendered)', () => {
  it('deleting from Home removes the chat\'s images', async () => {
    const t = await seedChatWithImages();
    const { HomeScreen } = require('../../../src/screens/HomeScreen');
    const home = t.rtl.render(t.React.createElement(HomeScreen, { navigation: NAV }));
    await t.rtl.waitFor(() => { expect(home.getByText(TITLE)).toBeTruthy(); });
    expect(await t.boundary.diffusion.hasImage('img-on-disk')).toBe(true);

    t.rtl.fireEvent.press(home.getByTestId('delete-conversation-button'));
    expect(home.getByText(`Delete "${TITLE}"? This will also delete all images generated in this chat.`)).toBeTruthy();
    t.rtl.fireEvent.press(home.getByText('Delete'));

    await t.rtl.waitFor(() => { expect(home.queryByText(TITLE)).toBeNull(); });
    await t.rtl.waitFor(async () => { expect(await t.boundary.diffusion.hasImage('img-on-disk')).toBe(false); });
    home.unmount();
    await expectGalleryEmpty(t);
  });

  it('deleting from a project\'s chat list removes the chat\'s images', async () => {
    const t = await seedChatWithImages('p1');
    require('../../../src/stores').useProjectStore.getState().createProject({ id: 'p1', name: 'Boat trip', description: '', systemPrompt: '', icon: '#000' });
    require('../../harness/chatHarness').routeHolder.params = { projectId: 'p1' };
    const { ProjectChatsScreen } = require('../../../src/screens/ProjectChatsScreen');
    const list = t.rtl.render(t.React.createElement(ProjectChatsScreen));
    await t.rtl.waitFor(() => { expect(list.getByText(TITLE)).toBeTruthy(); });

    t.rtl.fireEvent.press(list.getByTestId('delete-conversation-button'));
    t.rtl.fireEvent.press(list.getByText('Delete'));

    await t.rtl.waitFor(() => { expect(list.queryByText(TITLE)).toBeNull(); });
    await t.rtl.waitFor(async () => { expect(await t.boundary.diffusion.hasImage('img-on-disk')).toBe(false); });
    list.unmount();
    await expectGalleryEmpty(t);
  });
});
