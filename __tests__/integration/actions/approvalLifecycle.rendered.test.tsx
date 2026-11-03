/**
 * Approval lifecycle (UI integration, heavy entry point): an approval card belongs to its chat and to its
 * turn. Stop (from this chat or another one) and deleting the chat decline it, so the action never runs and
 * the next send works. Two gated calls show one card at a time. LiteRT, whose native tool loop times a tool
 * call out, never shows a card, and a call for a tool the turn did not offer never runs.
 *
 * Real ChatScreen + HomeScreen + tool loop + approval service and card; only the native engine leaves and
 * the OS Linking module are faked (nativeBoundary).
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

const toolCallText = (name: string, args: Record<string, unknown>) => `<tool_call>${JSON.stringify({ name, arguments: args })}</tool_call>`;
const DRAFT = { to: 'bob@example.com', subject: 'Hi', body: 'Hello' };
const FIRST = { to: 'ann@example.com', subject: 'First', body: 'One' };
const SECOND = { to: 'cal@example.com', subject: 'Second', body: 'Two' };

type Harness = Awaited<ReturnType<typeof setupChatScreen>>;

/** llama chat with draft_email on, the model's draft_email calls (one message) waiting on the first card. */
async function chatWithCard(drafts = [DRAFT]): Promise<Harness> {
  const h = await setupChatScreen({ engine: 'llama' });
  h.enableToolViaUI('draft_email'); h.render();
  await h.send('email them', { text: `Drafting. ${drafts.map(d => toolCallText('draft_email', d)).join('')}` });
  await h.rtl.waitFor(() => h.view!.getByTestId('approval-card'));
  return h;
}

async function pressStop(h: Harness) {
  await h.rtl.act(async () => { h.rtl.fireEvent.press(h.view!.getByTestId('stop-button')); });
  await h.rtl.waitFor(() => { expect(h.view!.queryByTestId('stop-button')).toBeNull(); }, { timeout: 4000 });
}

/** The chat's own delete menu: settings sheet -> Delete Conversation -> confirm. */
async function deleteOpenChat(h: Harness) {
  const id = h.conversationId!;
  h.rtl.fireEvent.press(h.view!.getByTestId('chat-settings-icon'));
  h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByText('Delete Conversation')));
  h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByText('Delete')));
  await h.rtl.waitFor(() => {
    expect(h.useChatStore.getState().conversations.some((c: { id: string }) => c.id === id)).toBe(false);
  });
}

async function expectToolResultShows(h: Harness, text: RegExp) {
  h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByTestId('tool-result-label-draft_email')));
  await h.rtl.waitFor(() => { expect(h.view!.getByText(text)).toBeTruthy(); });
}

describe('approval lifecycle', () => {
  it('stop declines', async () => {
    const h = await chatWithCard();
    await pressStop(h);
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
    expect(h.boundary.linking.openURL).not.toHaveBeenCalled();

    // The next send works at once: one new reply, one completion, and the stopped turn never comes back.
    const bubblesBefore = h.view!.queryAllByTestId('assistant-message').length;
    const completionsBefore = h.boundary.llama!.calls.completion.length;
    await h.send('never mind', { text: 'Okay, no email.' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Okay, no email\./)).not.toBeNull(); }, { timeout: 4000 });
    await h.settle(700);
    expect(h.view!.queryAllByTestId('assistant-message')).toHaveLength(bubblesBefore + 1);
    expect(h.boundary.llama!.calls.completion).toHaveLength(completionsBefore + 1);
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
    expect(h.boundary.linking.openURL).not.toHaveBeenCalled();

    // A stop ends that turn's cards only (unlike a delete): the chat's next turn can ask again.
    await h.send('email bob after all', { text: toolCallText('draft_email', DRAFT) });
    await h.rtl.waitFor(() => h.view!.getByTestId('approval-card'));
  });

  it('stop from another chat', async () => {
    const h = await chatWithCard();
    const chatA = h.conversationId!;
    await h.openChat(null);
    await pressStop(h);
    await h.openChat(chatA);
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
    await expectToolResultShows(h, /The user declined this action/);
    expect(h.boundary.linking.openURL).not.toHaveBeenCalled();
  });

  it('stop answers every call of the message', async () => {
    const h = await chatWithCard([FIRST, SECOND]);
    await pressStop(h);
    // Each stored call pairs with a declined result (remote APIs reject an unanswered call); neither ran.
    const labels = await h.rtl.waitFor(() => {
      const found = h.view!.getAllByTestId('tool-result-label-draft_email');
      expect(found).toHaveLength(2);
      return found;
    });
    labels.forEach(label => h.rtl.fireEvent.press(label));
    await h.rtl.waitFor(() => { expect(h.view!.getAllByText(/The user declined this action/)).toHaveLength(2); });
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
    expect(h.boundary.linking.openURL).not.toHaveBeenCalled();
  });

  it('one card at a time', async () => {
    const h = await chatWithCard([FIRST, SECOND]);
    expect(h.view!.getAllByTestId('approval-card')).toHaveLength(1);
    expect(h.view!.getByText(/Subject: First/)).toBeTruthy();
    expect(h.view!.queryByText(/Subject: Second/)).toBeNull();

    h.boundary.llama!.scriptCompletion({ text: 'Both drafts are open.' }); // scripts are sticky
    h.rtl.fireEvent.press(h.view!.getByTestId('approval-approve'));
    await h.rtl.waitFor(() => { expect(h.view!.getByText(/Subject: Second/)).toBeTruthy(); });
    expect(h.view!.getAllByTestId('approval-card')).toHaveLength(1);
    expect(h.boundary.linking.openURL).toHaveBeenCalledTimes(1);

    h.rtl.fireEvent.press(h.view!.getByTestId('approval-approve'));
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Both drafts are open\./)).not.toBeNull(); }, { timeout: 4000 });
    expect(h.boundary.linking.openURL).toHaveBeenCalledTimes(2);
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
  });

  it('stays with its conversation', async () => {
    const h = await chatWithCard();
    const chatA = h.conversationId!;
    await h.openChat(null);
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
    await h.openChat(chatA);
    await h.rtl.waitFor(() => h.view!.getByTestId('approval-card'));

    h.boundary.llama!.scriptCompletion({ text: 'Left it alone.' });
    h.rtl.fireEvent.press(h.view!.getByTestId('approval-decline'));
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Left it alone\./)).not.toBeNull(); }, { timeout: 4000 });
  });

  it('delete declines every call of the message', async () => {
    const h = await chatWithCard([FIRST, SECOND]);
    const completions = h.boundary.llama!.calls.completion.length;
    h.boundary.llama!.scriptCompletion({ text: 'Deleted chat follow-up.' }); // the deleted chat's turn moves on with it
    await deleteOpenChat(h);
    // Both calls are declined (the second never asks for a card nobody can see), so that turn ends.
    await h.rtl.waitFor(() => { expect(h.boundary.llama!.calls.completion).toHaveLength(completions + 1); }, { timeout: 4000 });

    await h.openChat(null);
    await h.send('hello', { text: 'Fresh start here.' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Fresh start here\./)).not.toBeNull(); }, { timeout: 6000 });
    expect(h.view!.queryByText(/Deleted chat follow-up\./)).toBeNull();
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
    expect(h.boundary.linking.openURL).not.toHaveBeenCalled();
  });

  // Guard for the finalize gate: deleting a chat mid-reply stops llama directly (not the user's Stop), so the
  // turn ends interrupted but still live. It must still end, or every later send waits in the queue forever.
  it('delete mid-reply still frees the next send', async () => {
    const h = await setupChatScreen({ engine: 'llama' });
    h.enableToolViaUI('calculator'); h.render();
    h.boundary.llama!.scriptCompletion({ text: 'Partial answer and the rest', pauseAfter: 'Partial answer' });
    await h.tapSend('long question');
    await h.rtl.waitFor(() => { expect(h.useChatStore.getState().isStreaming).toBe(true); }, { timeout: 4000 });
    await deleteOpenChat(h);

    await h.openChat(null);
    await h.send('hello', { text: 'Fresh reply.' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Fresh reply\./)).not.toBeNull(); }, { timeout: 5000 });
  });

  it('litert never shows a card', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    h.enableToolViaUI('draft_email'); h.render();
    await h.send('email bob', { toolCalls: [{ name: 'draft_email', arguments: DRAFT }], content: 'I could not open a draft.' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByTestId('tool-result-label-draft_email')).not.toBeNull(); }, { timeout: 4000 });
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
    await expectToolResultShows(h, /declined|not available/);
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/I could not open a draft\./)).not.toBeNull(); }, { timeout: 4000 });
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
    expect(h.boundary.linking.openURL).not.toHaveBeenCalled();
  });

  it('a text tool call for a tool that is off never runs', async () => {
    const h = await setupChatScreen({ engine: 'llama' });
    h.enableToolViaUI('calculator'); h.render(); // draft_email stays off
    await h.send('email bob', { text: `Drafting. ${toolCallText('draft_email', DRAFT)}` });
    await h.rtl.waitFor(() => { expect(h.view!.queryByTestId('tool-result-label-draft_email')).not.toBeNull(); }, { timeout: 4000 });
    h.boundary.llama!.scriptCompletion({ text: 'Email drafts are off.' }); // before the follow-up completion
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
    await expectToolResultShows(h, /This tool is not available right now\./);
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Email drafts are off\./)).not.toBeNull(); }, { timeout: 4000 });
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
    expect(h.boundary.linking.openURL).not.toHaveBeenCalled();
  });
});
