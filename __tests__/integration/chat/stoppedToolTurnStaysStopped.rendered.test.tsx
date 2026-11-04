/**
 * RENDERED INTEGRATION — a tool turn stopped in its post-tool pause stays stopped.
 *
 * After a tool round the tool loop waits a moment before the next completion (on-device llama settles its
 * context). If the user taps Stop then, while a message waits in the queue for another chat, that message is
 * sent at once and its turn starts. The stopped turn must not wake up and run another completion: its tokens
 * would land in the new reply, or its busy-engine retry would stop the new reply mid-way.
 *
 * Real ChatScreen, HomeScreen, chat input, generationService (queue, turn token), tool loop and the calculator
 * tool, chatStore. Faked ONLY at the device boundary: the llama engine (boundary.llama), whose stream the test
 * holds with pauseAfter.
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
const toolCallText = (name: string, args: Record<string, unknown>) => `<tool_call>${JSON.stringify({ name, arguments: args })}</tool_call>`;
const messages = (h: Harness, conversationId: string): Array<{ role: string; content: string }> =>
  h.useChatStore.getState().getConversationMessages(conversationId);
const contents = (h: Harness, conversationId: string): string[] => messages(h, conversationId).map(m => String(m.content));

describe('a tool turn stopped in its post-tool pause (rendered)', () => {
  it('starts no further completion, and the queued turn gets its whole reply', async () => {
    const h = await setupChatScreen({ engine: 'llama' });
    h.enableToolViaUI('calculator'); h.render();

    // Chat X: the model calls the calculator; its stream is held so the user can leave for chat Y.
    h.boundary.llama!.scriptCompletion({ text: `Let me work it out. ${toolCallText('calculator', { expression: '2+2' })}`, pauseAfter: 'Let me' });
    await h.tapSend('what is 2+2');
    await h.rtl.waitFor(() => expect(h.useChatStore.getState().streamingMessage).toMatch(/Let me/), TIMEOUT);
    const chatX = h.conversationId!;

    // Chat Y: the user's send waits in the queue behind X.
    await h.openChat(null);
    await h.tapSend('question for Y');
    const indicator = await h.rtl.waitFor(() => h.view!.getByTestId('queue-indicator'), TIMEOUT);
    expect(h.rtl.within(indicator).queryByText('1 queued')).not.toBeNull();
    const chatY = h.conversationId!;
    const completions = h.boundary.llama!.calls.completion.length;

    // Y's reply is held mid-way, so a stopped X that woke up would collide with it.
    h.boundary.llama!.scriptCompletion({ text: 'Reply for Y here.', pauseAfter: 'Reply for Y' });
    h.boundary.llama!.releaseStream();
    // X's calculator runs, then X waits before its next completion: the user taps Stop in that pause.
    await h.rtl.waitFor(() => expect(messages(h, chatX).some(m => m.role === 'tool')).toBe(true), TIMEOUT);
    await h.rtl.act(async () => { h.rtl.fireEvent.press(h.view!.getByTestId('stop-button')); });

    // Y's queued message is sent at once; its reply streams while X's pause runs out.
    await h.rtl.waitFor(() => expect(h.boundary.llama!.calls.completion.length).toBe(completions + 1), TIMEOUT);
    await h.settle(700);
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(contents(h, chatY)).toEqual(['question for Y', 'Reply for Y here.']), TIMEOUT);
    await h.settle(1500); // past the busy-engine retry backoff a woken X would wait out

    expect(h.boundary.llama!.calls.completion).toHaveLength(completions + 1);
    expect(contents(h, chatY)).toEqual(['question for Y', 'Reply for Y here.']);
    const replies = h.view!.queryAllByTestId('assistant-message');
    expect(replies).toHaveLength(1);
    expect(h.rtl.within(replies[0]).queryByText('Reply for Y here.')).not.toBeNull();
    expect(contents(h, chatX).some(c => c.includes('Reply for Y'))).toBe(false);
  }, 40000);
});
