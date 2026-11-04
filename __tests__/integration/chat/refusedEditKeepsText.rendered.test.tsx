/**
 * RENDERED INTEGRATION — an edit refused while another reply is written keeps what the user typed.
 *
 * Only one reply is written at a time, so Save & Resend in one chat while another chat's reply is written is
 * refused with "A reply is still being written". The editor stays open with the typed text, so the user can tap
 * Save again once that reply is done instead of typing the edit again.
 *
 * Real ChatScreen, message action menu and edit sheet, generationService and chatStore. Faked ONLY at the device
 * boundary: the llama engine (boundary.llama), whose stream the test holds open with pauseAfter.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

type Harness = Awaited<ReturnType<typeof setupChatScreen>>;

const TIMEOUT = { timeout: 4000 };
const EDIT_PLACEHOLDER = 'Enter message...';
const contents = (h: Harness, conversationId: string): string[] =>
  h.useChatStore.getState().getConversationMessages(conversationId).map((m: { content: string }) => String(m.content));

/** Wait until nothing on screen carries `testID` (compared with null, so a failing poll prints a boolean). */
async function waitUntilGone(h: Harness, testID: string): Promise<void> {
  await h.rtl.waitFor(() => expect(h.view!.queryByTestId(testID) === null).toBe(true), TIMEOUT);
}

/**
 * Back from the chat on screen and into chat `conversationId`. The harness navigation mock registers no
 * listeners, so beforeRemove cannot be fired by a gesture: the test calls the audio stop hook as beforeRemove
 * does, then points the route at that chat without remounting the screen, so the real switch effect runs while
 * the reply in the chat left behind is written on.
 */
async function leaveFor(h: Harness, conversationId: string): Promise<void> {
  const { callHook, HOOKS } = require('../../../src/bootstrap/hookRegistry');
  callHook(HOOKS.audioStop);
  const { ChatScreen } = require('../../../src/screens/ChatScreen');
  await h.rtl.act(async () => {
    require('../../harness/chatHarness').routeHolder.params = { conversationId };
    h.view!.rerender(h.React.createElement(ChatScreen, {}));
  });
  await h.rtl.waitFor(() => expect(h.useChatStore.getState().activeConversationId).toBe(conversationId), TIMEOUT);
}

describe('a refused edit (rendered)', () => {
  it('keeps the editor open with the typed text, and Save sends it once the other reply is written', async () => {
    const h = await setupChatScreen({ engine: 'llama' });
    h.render();
    // Chat Y: an earlier conversation with a reply.
    await h.send('hi', { text: 'Other chat.' });
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/Other chat\./)).not.toBeNull(), TIMEOUT);
    await waitUntilGone(h, 'stop-button');
    const chatY = h.conversationId!;
    // Chat X: a new chat whose reply is still being written when the user goes back to chat Y.
    h.view!.unmount();
    require('../../harness/chatHarness').routeHolder.params = {};
    h.render();
    h.boundary.llama!.scriptCompletion({ text: 'X starts. X ends.', pauseAfter: 'X starts.' });
    await h.tapSend('question for X');
    await h.rtl.waitFor(() => expect(h.useChatStore.getState().streamingMessage).toMatch(/X starts\./), TIMEOUT);
    const chatX = h.conversationId!;
    await leaveFor(h, chatY);

    // In chat Y the user edits their message and taps Save & Resend: refused, with the reason.
    await h.openActionMenu('user', 'longpress');
    h.rtl.fireEvent.press(h.view!.getByTestId('action-edit'));
    const input = await h.rtl.waitFor(() => h.view!.getByPlaceholderText(EDIT_PLACEHOLDER), TIMEOUT);
    h.rtl.fireEvent.changeText(input, 'hello there');
    h.rtl.fireEvent.press(h.view!.getByText('SAVE & RESEND'));
    await h.rtl.waitFor(() => expect(h.view!.queryByText('A reply is still being written')).not.toBeNull(), TIMEOUT);
    // The editor stays open (past its closing animation), and nothing in chat Y changed.
    await h.settle(600);
    expect(h.view!.queryByPlaceholderText(EDIT_PLACEHOLDER)).not.toBeNull();
    expect(contents(h, chatY)).toEqual(['hi', 'Other chat.']);
    h.rtl.fireEvent.press(h.view!.getByText('OK'));

    // X's reply is written.
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(contents(h, chatX)).toEqual(['question for X', 'X starts. X ends.']), TIMEOUT);
    await waitUntilGone(h, 'stop-button');

    // Save again, without typing anything: the text typed before is sent, and the editor closes.
    h.boundary.llama!.scriptCompletion({ text: 'Edited reply.' });
    h.rtl.fireEvent.press(h.view!.getByText('SAVE & RESEND'));
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/Edited reply\./)).not.toBeNull(), TIMEOUT);
    await waitUntilGone(h, 'stop-button');
    await h.rtl.waitFor(() => expect(h.view!.queryByPlaceholderText(EDIT_PLACEHOLDER) === null).toBe(true), TIMEOUT);
    expect(contents(h, chatY)).toEqual(['hello there', 'Edited reply.']);
    expect(h.view!.queryByText(/Other chat\./)).toBeNull();
  }, 40000);
});
