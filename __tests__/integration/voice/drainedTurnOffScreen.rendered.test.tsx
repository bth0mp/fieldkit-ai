/**
 * RENDERED INTEGRATION — a queued send that is answered while the user is in another chat is not read aloud there.
 *
 * With "Read replies aloud" on, the user sends in chat Y while chat X still writes its reply, so Y's message waits
 * in the queue. The user then opens chat Z. When X's turn ends, Y's message is sent and its reply is written off
 * screen: it is not read over chat Z. A later send in chat Z is read aloud as usual.
 *
 * Real ChatScreen, chat input (quick settings), generationService (queue), chatStore, speechService and the
 * feature bootstrap. Faked ONLY at the device boundary: the FieldkitSpeech module (boundary.speech) and the llama
 * engine (boundary.llama), whose stream the test holds with pauseAfter.
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
/** What the speech engine was asked to say, in order. */
const spoken = (h: Harness): string[] => h.boundary.speech!.calls.speak.map(call => call.text);
const contents = (h: Harness, conversationId: string): string[] =>
  h.useChatStore.getState().getConversationMessages(conversationId).map((m: { content: string }) => String(m.content));

async function waitUntilGone(h: Harness, testID: string): Promise<void> {
  await h.rtl.waitFor(() => expect(h.view!.queryByTestId(testID) === null).toBe(true), TIMEOUT);
}

/** Back from the chat on screen: the navigation mock fires no beforeRemove, so call the audio stop hook it calls. */
function backStopsSpeech(): void {
  const { callHook, HOOKS } = require('../../../src/bootstrap/hookRegistry');
  callHook(HOOKS.audioStop);
}

/** Back, then open chat `conversationId` from the chat list (Home's Recent list). */
async function backToChat(h: Harness, conversationId: string | null): Promise<void> {
  backStopsSpeech();
  await h.openChat(conversationId);
}

describe('a drained turn in another chat (rendered)', () => {
  it('is not read over the chat on screen; a later send there is', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    require('../../../src/features').activateFieldkitFeatures();
    h.render();
    // Chat Z: an earlier conversation.
    await h.send('hi', { text: 'Other chat.' });
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/Other chat\./)).not.toBeNull(), TIMEOUT);
    await waitUntilGone(h, 'stop-button');
    const chatZ = h.conversationId!;

    // Chat X: read-aloud on, and a reply that is still being written.
    await h.openChat(null);
    h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByTestId('quick-settings-button')));
    h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByTestId('quick-read-aloud')));
    await h.rtl.waitFor(() => expect(h.boundary.speech!.calls.setVoice).toEqual(['en-us-offline']), TIMEOUT);
    h.boundary.llama!.scriptCompletion({ text: 'One here. Two here. Three here.', pauseAfter: 'Two here.' });
    await h.tapSend('question for X');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['One here.']), TIMEOUT);

    // Chat Y: the user's send waits in the queue behind X.
    await backToChat(h, null);
    await h.tapSend('question for Y');
    const indicator = await h.rtl.waitFor(() => h.view!.getByTestId('queue-indicator'), TIMEOUT);
    expect(h.rtl.within(indicator).queryByText('1 queued')).not.toBeNull();
    const chatY = h.conversationId!;

    // Chat Z is on screen when X ends and Y's message is sent.
    await backToChat(h, chatZ);
    h.boundary.llama!.scriptCompletion({ text: 'Yes here. All done.', pauseAfter: 'Yes here. A' });
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(h.useChatStore.getState().streamingMessage).toMatch(/Yes here\. A/), TIMEOUT);
    expect(h.useChatStore.getState().streamingForConversationId).toBe(chatY);
    await h.settle(200);
    expect(spoken(h)).toEqual(['One here.']);
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(contents(h, chatY)).toEqual(['question for Y', 'Yes here. All done.']), TIMEOUT);
    await waitUntilGone(h, 'stop-button');
    await h.settle(200);
    expect(spoken(h)).toEqual(['One here.']);

    // A send in chat Z, on screen, is read aloud.
    h.boundary.llama!.scriptCompletion({ text: 'Next one. Next two.', pauseAfter: 'Next one. N' });
    await h.tapSend('again');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['One here.', 'Next one.']), TIMEOUT);
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['One here.', 'Next one.', 'Next two.']), TIMEOUT);
    expect(contents(h, chatZ)).toEqual(['hi', 'Other chat.', 'again', 'Next one. Next two.']);
  }, 40000);
});
