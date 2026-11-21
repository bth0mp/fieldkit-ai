/**
 * Assistant card (rendered): Home names the loaded model on a chip that opens the models manager, takes a
 * question in its ask box and opens a new chat with that question already sent, once. With nothing loaded it
 * shows "No model" and the setup card in place of the ask box. Below it are the two most recently updated chats.
 *
 * Real HomeScreen, ChatScreen, chat input, generation pipeline and chatStore. Device leaves only: what
 * setupChatScreen and installNativeBoundary install (the llama engine fake), AsyncStorage as the phone's
 * storage, and the navigation mock.
 */
import { setupChatScreen } from '../../harness/chatHarness';
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const QUESTION = 'How do I purify creek water?';
const TIMEOUT = { timeout: 4000 };
const makeNav = () => ({ navigate: jest.fn(), goBack: () => {}, setOptions: () => {}, addListener: () => () => {} });
const userTurns = (conversation: { messages: Array<{ role: string; content: string }> }) =>
  conversation.messages.filter((m) => m.role === 'user');

describe('Assistant card (rendered)', () => {
  // AsyncStorage is the phone's storage and outlives a test in this file; each test starts on a fresh phone.
  beforeEach(async () => { await require('@react-native-async-storage/async-storage').clear(); });

  it('names the loaded model and sends a question from Home into a new chat exactly once', async () => {
    const h = await setupChatScreen({ engine: 'llama', sqlite: true });
    const { React, rtl, useChatStore, useAppStore } = h;
    const { HomeScreen } = require('../../../src/screens/HomeScreen');
    const { ChatScreen } = require('../../../src/screens/ChatScreen');
    const nav = makeNav();
    const home = rtl.render(React.createElement(HomeScreen, { navigation: nav }));

    const label = await rtl.waitFor(() => home.getByTestId('model-chip-label'), TIMEOUT);
    expect(label).toHaveTextContent(useAppStore.getState().downloadedModels[0].name);
    expect(label.props.numberOfLines).toBe(1);
    expect(home.getByTestId('home-ask-send').props.accessibilityState.disabled).toBe(true);
    rtl.fireEvent.changeText(home.getByTestId('home-ask-input'), '   ');
    expect(home.getByTestId('home-ask-send').props.accessibilityState.disabled).toBe(true);
    rtl.fireEvent.changeText(home.getByTestId('home-ask-input'), QUESTION);
    rtl.fireEvent.press(home.getByTestId('home-ask-send'));
    expect(nav.navigate).toHaveBeenCalledTimes(1);
    expect(nav.navigate).toHaveBeenCalledWith('Chat', { firstMessage: QUESTION });
    expect(home.getByTestId('home-ask-input').props.value).toBe('');
    home.unmount();

    // Navigation hands the new chat the question; the chat screen sends it as if typed there.
    require('../../harness/chatHarness').routeHolder.params = { firstMessage: QUESTION };
    h.boundary.llama!.scriptCompletion({ text: 'Boil it for one minute.' });
    const chat = h.render();
    await rtl.waitFor(() => expect(chat.getByText(/Boil it for one minute\./)).toBeTruthy(), TIMEOUT);
    chat.rerender(React.createElement(ChatScreen, {}));
    await h.settle();

    // One message from the user, the question. (The chat is also named after it, so the header shows it too.)
    const sent = chat.getAllByTestId('user-message');
    expect(sent).toHaveLength(1);
    expect(rtl.within(sent[0]).getByText(QUESTION)).toBeTruthy();
    expect(userTurns(useChatStore.getState().conversations[0])).toHaveLength(1);
    chat.unmount();
  }, 30000);

  it('a question from Home starts a new chat even when another chat was open', async () => {
    const h = await setupChatScreen({ engine: 'llama', sqlite: true });
    const { React, rtl, useChatStore } = h;
    const { HomeScreen } = require('../../../src/screens/HomeScreen');

    // The user had a chat open before going back to Home (it stays the active chat).
    h.render();
    await h.send('Is the stove lit?', { text: 'Yes.' });
    await rtl.waitFor(() => expect(h.view!.getByText(/Yes\./)).toBeTruthy(), TIMEOUT);
    const earlier = h.conversationId!;
    h.view!.unmount();

    const home = rtl.render(React.createElement(HomeScreen, { navigation: makeNav() }));
    rtl.fireEvent.changeText(await rtl.waitFor(() => home.getByTestId('home-ask-input'), TIMEOUT), QUESTION);
    rtl.fireEvent.press(home.getByTestId('home-ask-send'));
    home.unmount();

    require('../../harness/chatHarness').routeHolder.params = { firstMessage: QUESTION };
    h.boundary.llama!.scriptCompletion({ text: 'Boil it for one minute.' });
    const chat = h.render();
    await rtl.waitFor(() => expect(chat.getByText(/Boil it for one minute\./)).toBeTruthy(), TIMEOUT);
    expect(chat.queryByText('Is the stove lit?')).toBeNull();

    const { conversations, activeConversationId } = useChatStore.getState();
    expect(conversations).toHaveLength(2);
    expect(activeConversationId).not.toBe(earlier);
    const asked = conversations.find((c: { id: string }) => c.id === activeConversationId);
    expect(userTurns(asked).map((m) => m.content)).toEqual([QUESTION]);
    const before = conversations.find((c: { id: string }) => c.id === earlier);
    expect(userTurns(before).map((m) => m.content)).toEqual(['Is the stove lit?']);
    chat.unmount();
  }, 30000);

  it('shows "No model" and the setup card when nothing is loaded', async () => {
    installNativeBoundary();
    const React = require('react');
    const rtl = requireRTL();
    const { HomeScreen } = require('../../../src/screens/HomeScreen');
    const home = rtl.render(React.createElement(HomeScreen, { navigation: makeNav() }));

    expect(home.getByTestId('model-chip-label')).toHaveTextContent('No model');
    expect(home.getByTestId('setup-card')).toBeTruthy();
    expect(home.queryByTestId('home-ask-input')).toBeNull();
    home.unmount();
  }, 30000);

  it('lists the two most recently updated chats', async () => {
    installNativeBoundary();
    const React = require('react');
    const rtl = requireRTL();
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    const { useChatStore } = require('../../../src/stores');
    const { HomeScreen } = require('../../../src/screens/HomeScreen');

    // Saved on the phone: chats made in the order A, B, C (a new chat goes to the front of the list), and
    // updated last in the order B, then A, then C.
    const chat = (id: string, createdAt: string, updatedAt: string) => ({ id, title: id, modelId: 'm', messages: [], createdAt, updatedAt });
    const conversations = [
      chat('C', '2026-11-20T09:00:00.000Z', '2026-11-20T09:30:00.000Z'),
      chat('B', '2026-11-19T09:00:00.000Z', '2026-11-21T08:00:00.000Z'),
      chat('A', '2026-11-18T09:00:00.000Z', '2026-11-20T10:00:00.000Z'),
    ];
    await AsyncStorage.setItem('local-llm-chat-storage', JSON.stringify({ state: { conversations, activeConversationId: null }, version: 0 }));
    await useChatStore.persist.rehydrate();
    const home = rtl.render(React.createElement(HomeScreen, { navigation: makeNav() }));

    expect(rtl.within(home.getByTestId('conversation-item-0')).getByText('B')).toBeTruthy();
    expect(rtl.within(home.getByTestId('conversation-item-1')).getByText('A')).toBeTruthy();
    expect(home.queryByTestId('conversation-item-2')).toBeNull();
    expect(home.getByText('See all (3)')).toBeTruthy();
    home.unmount();
  }, 30000);
});
