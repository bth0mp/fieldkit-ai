/**
 * RENDERED INTEGRATION — a message queued in one chat is sent in that chat only.
 *
 * While chat X waits on an approval card, the user sends "a" in chat Y and then "b" in chat Z: both wait in the
 * queue. When X's turn ends, Y gets "a" and its reply, and then Z gets "b" and its reply; the queue never merges
 * them into one send. A message queued in a chat the user then deletes is never sent, and the next chat in the
 * queue still gets its reply.
 *
 * Real ChatScreen, HomeScreen, chat input, generationService (queue), tool loop, approval service and card,
 * chatStore. Faked ONLY at the device boundary: the llama engine (boundary.llama), whose stream the test holds
 * with pauseAfter so it can script the next completion (the fake holds one script at a time).
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
const DRAFT = { to: 'bob@example.com', subject: 'Hi', body: 'Hello' };
const contents = (h: Harness, conversationId: string): string[] =>
  h.useChatStore.getState().getConversationMessages(conversationId).map((m: { content: string }) => String(m.content));

/** Chat X: the model's draft_email call waits on its approval card. Returns X's id. */
async function chatWaitingOnCard(h: Harness): Promise<string> {
  h.enableToolViaUI('draft_email'); h.render();
  await h.send('email bob', { text: `Drafting. ${toolCallText('draft_email', DRAFT)}` });
  await h.rtl.waitFor(() => h.view!.getByTestId('approval-card'));
  return h.conversationId!;
}

/** New Chat, then a send that waits in the queue (`queued` messages in it afterwards). Returns the chat's id. */
async function queueInNewChat(h: Harness, text: string, queued: number): Promise<string> {
  await h.openChat(null);
  await h.tapSend(text);
  const indicator = await h.rtl.waitFor(() => h.view!.getByTestId('queue-indicator'), TIMEOUT);
  expect(h.rtl.within(indicator).queryByText(`${queued} queued`)).not.toBeNull();
  return h.conversationId!;
}

/** Back in chat X, decline its card; X's follow-up reply is held at its end so the test can script the next one. */
async function declineInChat(h: Harness, chatX: string): Promise<number> {
  await h.openChat(chatX);
  await h.rtl.waitFor(() => h.view!.getByTestId('approval-card'));
  const before = h.boundary.llama!.calls.completion.length;
  h.boundary.llama!.scriptCompletion({ text: 'Left it alone.', pauseAfter: 'Left it alone.' });
  h.rtl.fireEvent.press(h.view!.getByTestId('approval-decline'));
  await completionStarted(h, before + 1);
  return before + 1;
}

async function completionStarted(h: Harness, count: number): Promise<void> {
  await h.rtl.waitFor(() => expect(h.boundary.llama!.calls.completion.length).toBe(count), TIMEOUT);
}

/** The chat's own delete menu: settings sheet -> Delete Conversation -> confirm. */
async function deleteOpenChat(h: Harness): Promise<void> {
  const id = h.conversationId!;
  h.rtl.fireEvent.press(h.view!.getByTestId('chat-settings-icon'));
  h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByText('Delete Conversation')));
  h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByText('Delete')));
  await h.rtl.waitFor(() => {
    expect(h.useChatStore.getState().conversations.some((c: { id: string }) => c.id === id)).toBe(false);
  });
}

/** Open chat `conversationId`: it shows exactly one user message `sent` and one reply `reply`. */
async function expectChatShows(h: Harness, conversationId: string, sent: string, reply: RegExp): Promise<void> {
  await h.openChat(conversationId);
  const bubbles = await h.rtl.waitFor(() => {
    const found = h.view!.queryAllByTestId('user-message');
    expect(found).toHaveLength(1);
    return found;
  }, TIMEOUT);
  expect(h.rtl.within(bubbles[0]).queryByText(sent)).not.toBeNull();
  expect(h.view!.queryAllByTestId('assistant-message')).toHaveLength(1);
  expect(h.rtl.within(h.view!.getByTestId('assistant-message')).queryByText(reply)).not.toBeNull();
}

describe('a queued message is sent in its own chat (rendered)', () => {
  it('two chats queued behind a card each get their own message and reply, in order', async () => {
    const h = await setupChatScreen({ engine: 'llama' });
    const chatX = await chatWaitingOnCard(h);
    const chatY = await queueInNewChat(h, 'a', 1);
    const chatZ = await queueInNewChat(h, 'b', 2);
    const xFollowUp = await declineInChat(h, chatX);

    // X's turn ends, so Y's message is sent: "a" alone, and Z's stays queued.
    h.boundary.llama!.scriptCompletion({ text: 'Reply for Y.', pauseAfter: 'Reply for Y.' });
    h.boundary.llama!.releaseStream();
    await completionStarted(h, xFollowUp + 1);
    expect(contents(h, chatY)).toEqual(['a']);
    expect(contents(h, chatZ)).toEqual([]);

    // Y's turn ends, so Z's message is sent.
    h.boundary.llama!.scriptCompletion({ text: 'Reply for Z.' });
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(contents(h, chatZ)).toEqual(['b', 'Reply for Z.']), TIMEOUT);
    expect(contents(h, chatY)).toEqual(['a', 'Reply for Y.']);
    await h.settle(300);
    expect(h.boundary.llama!.calls.completion).toHaveLength(xFollowUp + 2);

    await expectChatShows(h, chatY, 'a', /Reply for Y\./);
    await expectChatShows(h, chatZ, 'b', /Reply for Z\./);
    expect(h.view!.queryByTestId('queue-indicator')).toBeNull();
  }, 40000);

  it('a message queued in a chat that is then deleted is never sent; the next queued chat gets its reply', async () => {
    const h = await setupChatScreen({ engine: 'llama' });
    const chatX = await chatWaitingOnCard(h);
    const chatY = await queueInNewChat(h, 'a', 1);
    const chatZ = await queueInNewChat(h, 'b', 2);
    await h.openChat(chatY);
    await deleteOpenChat(h);
    const xFollowUp = await declineInChat(h, chatX);

    h.boundary.llama!.scriptCompletion({ text: 'Reply for Z.' });
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(contents(h, chatZ)).toEqual(['b', 'Reply for Z.']), TIMEOUT);
    await h.settle(300);
    // One completion for Z, none for the deleted chat's message.
    expect(h.boundary.llama!.calls.completion).toHaveLength(xFollowUp + 1);
    expect(h.useChatStore.getState().conversations.some((c: { id: string }) => c.id === chatY)).toBe(false);
    await expectChatShows(h, chatZ, 'b', /Reply for Z\./);
    expect(h.view!.queryByTestId('queue-indicator')).toBeNull();
  }, 40000);
});
