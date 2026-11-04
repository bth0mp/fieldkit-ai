/**
 * RENDERED INTEGRATION — a turn counts as running from the user's send, not only once the model generates.
 *
 * When the text model is not in memory (after an app restart or an eviction), a send first loads it, which takes
 * seconds on the phone. During that load another chat's send must wait in the queue and its Retry must be
 * refused, as while a reply is written; otherwise both turns run and one is lost. A message that waited behind a
 * turn whose load failed is sent once that turn ends.
 *
 * Real ChatScreen, chat input, action menu, generationService (queue), chatStore, speechService and the feature
 * bootstrap. Faked ONLY at the device boundary: the llama engine (boundary.llama), whose model load the tests
 * hold open (scriptMultimodalHold, holdNextInit) and whose stream they hold with pauseAfter, and the
 * FieldkitSpeech module (boundary.speech).
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

/** Wait until nothing on screen carries `testID` (compared with null, so a failing poll prints a boolean). */
async function waitUntilGone(h: Harness, testID: string): Promise<void> {
  await h.rtl.waitFor(() => expect(h.view!.queryByTestId(testID) === null).toBe(true), TIMEOUT);
}

/** Open a chat screen on `conversationId`, or on a new chat without one, as the chat list and New Chat do. */
async function openChat(h: Harness, conversationId?: string): Promise<void> {
  require('../../harness/chatHarness').routeHolder.params = conversationId ? { conversationId } : {};
  h.render();
  await h.rtl.waitFor(() => expect(h.useChatStore.getState().activeConversationId).toBe(conversationId ?? null), TIMEOUT);
}

/** Chat Y: an earlier conversation with a reply. Returns its id. */
async function earlierChat(h: Harness): Promise<string> {
  await h.send('hi', { text: 'Other chat.' });
  await h.rtl.waitFor(() => expect(h.view!.queryByText(/Other chat\./)).not.toBeNull(), TIMEOUT);
  await waitUntilGone(h, 'stop-button');
  return h.conversationId!;
}

/** The text model is no longer in memory, as after an app restart or an eviction: the next send loads it. */
async function evictTextModel(h: Harness): Promise<void> {
  const { activeModelService } = require('../../../src/services/activeModelService');
  await h.rtl.act(async () => { await activeModelService.unloadTextModel(true); });
}

/**
 * Back from the chat on screen and into chat `conversationId`. The harness navigation mock registers no
 * listeners, so beforeRemove cannot be fired by a gesture: the test calls the audio stop hook as beforeRemove
 * does, then points the route at that chat without remounting the screen, so the real switch effect runs while
 * the turn in the chat left behind goes on.
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

/** Chat Y with a reply, then a new chat X on screen whose next send has to load the model. */
async function chatYThenNewChatX(h: Harness, opts: { readAloud?: boolean } = {}): Promise<string> {
  if (opts.readAloud) require('../../../src/features').activateFieldkitFeatures();
  h.render();
  const chatY = await earlierChat(h);
  h.view!.unmount();
  await openChat(h);
  if (opts.readAloud) {
    h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByTestId('quick-settings-button')));
    h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByTestId('quick-read-aloud')));
    await h.rtl.waitFor(() => expect(h.boundary.speech!.calls.setVoice).toEqual(['en-us-offline']), TIMEOUT);
  }
  await evictTextModel(h);
  return chatY;
}

/** In chat Y the user sends while chat X's model still loads: the message waits in the queue. */
async function sendIsQueued(h: Harness, text: string): Promise<void> {
  await h.tapSend(text);
  const queued = await h.rtl.waitFor(() => h.view!.getByTestId('queue-indicator'), TIMEOUT);
  expect(h.rtl.within(queued).queryByText('1 queued')).not.toBeNull();
}

describe('a turn counts as running while its model loads (rendered)', () => {
  it('a send in another chat waits for the turn, and each chat gets its reply, read aloud only on screen', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    const chatY = await chatYThenNewChatX(h, { readAloud: true });
    // Chat X: the send loads the model, and the load takes a while.
    h.boundary.llama!.scriptMultimodalHold();
    h.boundary.llama!.scriptCompletion({ text: 'One here. Two here. Three here.', pauseAfter: 'Two here.' });
    await h.tapSend('question for X');
    await h.rtl.waitFor(() => expect(h.boundary.llama!.multimodalHoldActive()).toBe(true), TIMEOUT);
    const chatX = h.conversationId!;
    await leaveFor(h, chatY);
    await sendIsQueued(h, 'question for Y');
    expect(contents(h, chatY)).toEqual(['hi', 'Other chat.']);

    // The model finishes loading: X's reply is written off screen and is not read over chat Y.
    await h.rtl.act(async () => { h.boundary.llama!.releaseMultimodalHold(); });
    await h.rtl.waitFor(() => expect(h.useChatStore.getState().streamingMessage).toMatch(/Two here\./), TIMEOUT);
    expect(h.useChatStore.getState().streamingForConversationId).toBe(chatX);
    await h.settle(200);
    expect(spoken(h)).toEqual([]);

    // Y's reply is scripted once X's completion has started (the fake holds one script at a time).
    h.boundary.llama!.scriptCompletion({ text: 'Yes here. All done.', pauseAfter: 'Yes here. A' });
    h.boundary.llama!.releaseStream();
    // Then Y's queued message is sent, and its reply is read aloud in chat Y.
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Yes here.']), TIMEOUT);
    expect(h.useChatStore.getState().streamingForConversationId).toBe(chatY);
    expect(contents(h, chatX)).toEqual(['question for X', 'One here. Two here. Three here.']);
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Yes here.', 'All done.']), TIMEOUT);
    await waitUntilGone(h, 'stop-button');
    await h.settle(200);

    expect(contents(h, chatY)).toEqual(['hi', 'Other chat.', 'question for Y', 'Yes here. All done.']);
    expect(contents(h, chatX)).toEqual(['question for X', 'One here. Two here. Three here.']);
    expect(h.view!.queryByTestId('queue-indicator')).toBeNull();
    expect(h.view!.queryByText('No response')).toBeNull();
    expect(spoken(h)).toEqual(['Yes here.', 'All done.']);
  }, 40000);

  it('Retry in another chat is refused and keeps the reply; once the turn is over, Retry works', async () => {
    const h = await setupChatScreen({ engine: 'llama' });
    const chatY = await chatYThenNewChatX(h);
    h.boundary.llama!.scriptMultimodalHold();
    h.boundary.llama!.scriptCompletion({ text: 'Reply for X.' });
    await h.tapSend('question for X');
    await h.rtl.waitFor(() => expect(h.boundary.llama!.multimodalHoldActive()).toBe(true), TIMEOUT);
    const chatX = h.conversationId!;
    await leaveFor(h, chatY);

    // In chat Y the user long-presses Y's reply and taps Retry while X's model still loads.
    await h.openActionMenu('assistant', 'longpress');
    h.rtl.fireEvent.press(h.view!.getByTestId('action-retry'));
    await h.rtl.waitFor(() => expect(h.view!.queryByText('A reply is still being written')).not.toBeNull(), TIMEOUT);
    expect(h.view!.queryByText('Wait for it to finish, then try again.')).not.toBeNull();
    expect(h.view!.queryByText(/Other chat\./)).not.toBeNull();
    h.rtl.fireEvent.press(h.view!.getByText('OK'));

    // The model finishes loading and X's reply is written.
    await h.rtl.act(async () => { h.boundary.llama!.releaseMultimodalHold(); });
    await h.rtl.waitFor(() => expect(contents(h, chatX)).toEqual(['question for X', 'Reply for X.']), TIMEOUT);
    expect(contents(h, chatY)).toEqual(['hi', 'Other chat.']);
    await waitUntilGone(h, 'stop-button');

    // Retry in chat Y now writes Y's reply again.
    h.boundary.llama!.scriptCompletion({ text: 'Other again.' });
    await h.openActionMenu('assistant', 'longpress');
    h.rtl.fireEvent.press(h.view!.getByTestId('action-retry'));
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/Other again\./)).not.toBeNull(), TIMEOUT);
    await waitUntilGone(h, 'stop-button');
    await h.settle(200);
    expect(h.view!.queryByText(/Other chat\./)).toBeNull();
    expect(contents(h, chatY)).toEqual(['hi', 'Other again.']);
    expect(contents(h, chatX)).toEqual(['question for X', 'Reply for X.']);
    expect(h.view!.queryByText('No response')).toBeNull();
  }, 40000);

  it('a message queued behind a turn whose model fails to load is sent and gets its reply', async () => {
    const h = await setupChatScreen({ engine: 'llama' });
    const chatY = await chatYThenNewChatX(h);
    // Chat X: the load takes a while and then fails (every attempt of that one load).
    h.boundary.llama!.holdNextInit();
    h.boundary.llama!.failNextInits(3);
    await h.tapSend('question for X');
    await h.rtl.waitFor(() => expect(h.boundary.llama!.initHoldActive()).toBe(true), TIMEOUT);
    const chatX = h.conversationId!;
    await leaveFor(h, chatY);
    await sendIsQueued(h, 'question for Y');

    // X's load fails, so its turn ends without a reply; Y's queued message is sent and its reply is written.
    h.boundary.llama!.scriptCompletion({ text: 'Reply for Y.' });
    await h.rtl.act(async () => { h.boundary.llama!.releaseInit(); });
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/Failed to load model/)).not.toBeNull(), TIMEOUT);
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/Reply for Y\./)).not.toBeNull(), TIMEOUT);
    await waitUntilGone(h, 'stop-button');
    await h.settle(200);
    expect(contents(h, chatY)).toEqual(['hi', 'Other chat.', 'question for Y', 'Reply for Y.']);
    expect(contents(h, chatX)).toEqual(['question for X']);
    expect(h.view!.queryByTestId('queue-indicator')).toBeNull();
  }, 40000);

  // Guard for Stop ending the running turn: a stopped LiteRT tool turn never settles (its tool loop waits for a
  // completion event that the stop unsubscribes), so if only its end released it, every later send would wait.
  it('after Stop on a LiteRT reply, the next send is written at once', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    h.render();
    h.boundary.litert!.scriptPartialThenHang('Looking at it');
    await h.tapSend('describe this');
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/Looking at it/)).not.toBeNull(), TIMEOUT);
    await h.rtl.act(async () => { h.rtl.fireEvent.press(h.view!.getByTestId('stop-button')); });
    await waitUntilGone(h, 'stop-button');

    await h.send('and now?', { content: 'Here it is.' });
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/Here it is\./)).not.toBeNull(), TIMEOUT);
    expect(h.view!.queryByTestId('queue-indicator')).toBeNull();
  }, 40000);
});
