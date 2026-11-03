/**
 * RENDERED INTEGRATION — "Read replies aloud": the assistant's reply is spoken sentence by sentence while it
 * streams, over the system speech engine.
 *
 * Real ChatScreen + real chat input (quick-settings popover), generationService, chatStore, speechService,
 * speechStore, speechText and the real feature bootstrap (activateFieldkitFeatures). Faked ONLY at the device
 * boundary: the FieldkitSpeech native module (boundary.speech) and the llama engine (boundary.llama), whose
 * stream the tests hold open with `pauseAfter` and release with `releaseStream`.
 *
 * The user's view: switch "Read replies aloud" on in the quick settings, send a message, and hear each
 * finished sentence of the reply as it arrives, the last piece once the reply is complete, and never the
 * reasoning, code, markup or a half-written sentence. Stop and a new message cut the speech off, and the
 * next reply is read again.
 *
 * Replies are held open with pauseAfter. A reply the fake streams in one go is finished before the screen
 * redraws, so the screen never reports that streaming ended and the last sentence would wait forever; a real
 * reply takes seconds and the screen sees it stream.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

type Harness = Awaited<ReturnType<typeof setupChatScreen>>;

const toolCallText = (name: string, args: Record<string, unknown>) => `<tool_call>${JSON.stringify({ name, arguments: args })}</tool_call>`;

/** What the engine was asked to say, in order. */
const spoken = (h: Harness): string[] => h.boundary.speech!.calls.speak.map(call => call.text);
const stopCalls = (h: Harness): number => h.boundary.speech!.module.stop.mock.calls.length;
const TIMEOUT = { timeout: 4000 };

/** Turn the built-in tools off so tool-call markup arrives as leaked text instead of running a tool round. */
function switchDefaultToolsOff(h: Harness): void {
  for (const id of ['web_search', 'read_url', 'search_knowledge_base']) h.enableToolViaUI(id);
}

/** Mount the chat with the feature bootstrap active. */
function mountChat(h: Harness): void {
  require('../../../src/features').activateFieldkitFeatures();
  h.render();
}

/** Open the quick settings and tap "Read replies aloud". */
async function tapReadAloud(h: Harness): Promise<void> {
  if (!h.view!.queryByTestId('quick-read-aloud')) {
    h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByTestId('quick-settings-button')));
  }
  h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByTestId('quick-read-aloud')));
}

/** Mount the chat, switch read-aloud on and wait until the speech engine is ready. */
async function readAloudChat(h: Harness, opts: { toolsOff?: boolean } = {}): Promise<void> {
  if (opts.toolsOff) switchDefaultToolsOff(h);
  mountChat(h);
  await tapReadAloud(h);
  await h.rtl.waitFor(() => expect(h.boundary.speech!.calls.setVoice).toEqual(['en-us-offline']), TIMEOUT);
}

/**
 * Round 1 of a tool turn: a short lead-in, then a calculator call, held after 'Okay.' so 'Let me check.' is
 * read. 'Okay.' is the round's last piece: it is read once the chat moves on to round 2.
 */
async function holdToolRoundOne(h: Harness): Promise<void> {
  const call = toolCallText('calculator', { expression: '2+2' });
  h.boundary.llama!.scriptCompletion({ text: `Let me check. Okay. ${call}`, pauseAfter: 'Okay.' });
  await h.tapSend('what is 2 + 2');
  await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Let me check.']), TIMEOUT);
}

/** Let round 1 finish so the calculator runs, then hold round 2 once 'It is sunny. B' is on screen. */
async function holdToolRoundTwo(h: Harness): Promise<void> {
  h.boundary.llama!.scriptCompletion({ text: 'It is sunny. Bye', pauseAfter: 'It is sunny. B' });
  h.boundary.llama!.releaseStream();
  await h.rtl.waitFor(() => expect(h.view!.queryByText(/It is sunny\. B/)).not.toBeNull(), TIMEOUT);
}

/**
 * Wait until nothing on screen carries `testID`. The check compares with null, so a poll that fails prints a
 * boolean: printing the element itself formats its whole fiber tree and blocks the test for seconds.
 */
async function waitUntilGone(h: Harness, testID: string): Promise<void> {
  await h.rtl.waitFor(() => expect(h.view!.queryByTestId(testID) === null).toBe(true), TIMEOUT);
}

/** Let the held reply finish and wait until the turn is over (the stop button is gone). */
async function finishTurn(h: Harness): Promise<void> {
  h.boundary.llama!.releaseStream();
  await waitUntilGone(h, 'stop-button');
  await h.settle(200);
}

/** Press the stop button, as the user does while a reply is streaming. */
async function pressStop(h: Harness): Promise<void> {
  const stop = await h.rtl.waitFor(() => h.view!.getByTestId('stop-button'), TIMEOUT);
  await h.rtl.act(async () => { h.rtl.fireEvent.press(stop); });
  await waitUntilGone(h, 'stop-button');
}

/** Tap "Read replies aloud" and wait until the row shows the new state. */
async function setReadAloud(h: Harness, on: boolean): Promise<void> {
  await tapReadAloud(h);
  await h.rtl.waitFor(() => expect(h.view!.getByTestId('quick-read-aloud').props.accessibilityState).toMatchObject({ checked: on }), TIMEOUT);
}

/** Wait until no reply is generating, including one in a chat the screen does not show. */
async function waitUntilIdle(h: Harness): Promise<void> {
  const { generationService } = require('../../../src/services/generationService');
  await h.rtl.waitFor(() => expect(generationService.getState().isGenerating).toBe(false), TIMEOUT);
}

/**
 * What Back does to speech. The harness navigation mock registers no listeners, so beforeRemove cannot be
 * fired by a gesture: the test calls the registered audio stop hook, as beforeRemove does.
 */
function backStopsSpeech(h: Harness): void {
  const before = stopCalls(h);
  const { callHook, HOOKS } = require('../../../src/bootstrap/hookRegistry');
  callHook(HOOKS.audioStop);
  expect(stopCalls(h)).toBeGreaterThan(before);
}

/** Back from the chat: speech stops (see backStopsSpeech) and the screen is removed. */
function goBack(h: Harness): void {
  backStopsSpeech(h);
  h.view!.unmount();
}

/** Open a chat screen on `conversationId`, or on a new chat without one, as the chat list and New Chat do. */
async function openChat(h: Harness, conversationId?: string): Promise<void> {
  require('../../harness/chatHarness').routeHolder.params = conversationId ? { conversationId } : {};
  h.render();
  await h.rtl.waitFor(() => expect(h.useChatStore.getState().activeConversationId).toBe(conversationId ?? null), TIMEOUT);
}

/** The next message is read aloud: 'Next one.' while its reply streams and 'Next two.' when it ends. */
async function nextReplyIsRead(h: Harness): Promise<void> {
  const before = spoken(h);
  h.boundary.llama!.scriptCompletion({ text: 'Next one. Next two.', pauseAfter: 'Next one. N' });
  await h.tapSend('again');
  await h.rtl.waitFor(() => expect(spoken(h)).toEqual([...before, 'Next one.']), TIMEOUT);
  h.boundary.llama!.releaseStream();
  await h.rtl.waitFor(() => expect(spoken(h)).toEqual([...before, 'Next one.', 'Next two.']), TIMEOUT);
}

/** A reply in the chat on screen, held after its second sentence, so only 'One here.' is read. */
async function holdReply(h: Harness): Promise<void> {
  h.boundary.llama!.scriptCompletion({ text: 'One here. Two here. Three here. Four here.', pauseAfter: 'Two here.' });
  await h.tapSend('q');
  await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['One here.']), TIMEOUT);
}

/**
 * Back from the chat on screen and into chat `conversationId`: the test calls the audio stop hook (see
 * backStopsSpeech) and, without remounting the screen, points the route at that chat, so the real useChatScreen
 * switch effect runs, while a reply in the chat left behind generates on.
 */
async function backToChat(h: Harness, conversationId: string): Promise<void> {
  backStopsSpeech(h);
  const { ChatScreen } = require('../../../src/screens/ChatScreen');
  await h.rtl.act(async () => {
    require('../../harness/chatHarness').routeHolder.params = { conversationId };
    h.view!.rerender(h.React.createElement(ChatScreen, {}));
  });
  await h.rtl.waitFor(() => expect(h.useChatStore.getState().activeConversationId).toBe(conversationId), TIMEOUT);
}

/**
 * Chat X holds a reply: by default a tool turn in round 1, once 'Let me check.' was read. The user goes back and
 * opens chat Y, an earlier conversation (see backToChat): the switch ends the generation session while X's turn
 * generates on.
 */
async function leaveTurnForOtherChat(h: Harness, holdTurn = holdToolRoundOne): Promise<{ leftChat: string; otherChat: string }> {
  mountChat(h);
  // Chat Y: an earlier conversation whose reply arrived while read-aloud was off.
  await h.send('hi', { text: 'Other chat.' });
  await h.rtl.waitFor(() => expect(h.view!.queryByText(/Other chat\./)).not.toBeNull(), TIMEOUT);
  await waitUntilGone(h, 'stop-button');
  const otherChat = h.conversationId!;
  // The user opens a new chat, switches read-aloud on and asks something.
  h.view!.unmount();
  await openChat(h);
  await tapReadAloud(h);
  await h.rtl.waitFor(() => expect(h.boundary.speech!.calls.setVoice).toEqual(['en-us-offline']), TIMEOUT);
  await holdTurn(h);
  const leftChat = h.conversationId!;
  expect(leftChat).not.toBe(otherChat);
  await backToChat(h, otherChat);
  return { leftChat, otherChat };
}

/** The left turn's round 2 streams off screen and the turn ends: none of it is read over the chat on screen. */
async function leftTurnEndsUnheard(h: Harness, leftChat: string): Promise<void> {
  h.boundary.llama!.scriptCompletion({ text: 'It is sunny. Bye now.', pauseAfter: 'It is sunny. B' });
  h.boundary.llama!.releaseStream();
  await h.rtl.waitFor(() => expect(h.useChatStore.getState().streamingMessage).toMatch(/It is sunny\. B/), TIMEOUT);
  await h.settle(200);
  expect(spoken(h)).toEqual(['Let me check.']);
  h.boundary.llama!.releaseStream();
  await waitUntilIdle(h);
  const leftMessages = h.useChatStore.getState().getConversationMessages(leftChat);
  expect(leftMessages[leftMessages.length - 1].content).toMatch(/Bye now\./);
  await h.settle(200);
  expect(spoken(h)).toEqual(['Let me check.']);
}

/** Play one LiteRT native event, then give the 50 ms token batching time to hand it on. */
async function nativeEvent(h: Harness, event: string, payload: string): Promise<void> {
  await h.rtl.act(async () => { h.boundary.litertEvents.emit(event, payload); });
  await h.settle(100);
}

/**
 * In chat Y the user long-presses Y's reply and taps Retry while chat X still writes its reply off screen. Retry
 * is refused before anything is deleted: Y's reply stays and an alert says why.
 */
async function retryRefusedWhileOtherChatWrites(h: Harness): Promise<void> {
  await h.openActionMenu('assistant', 'longpress');
  h.rtl.fireEvent.press(h.view!.getByTestId('action-retry'));
  expect(h.view!.queryByText(/Other chat\./)).not.toBeNull();
  await h.rtl.waitFor(() => expect(h.view!.queryByText('A reply is still being written')).not.toBeNull(), TIMEOUT);
  expect(h.view!.queryByText('Wait for it to finish, then try again.')).not.toBeNull();
}

describe('Read replies aloud (rendered)', () => {
  it('is off until switched on: the reply is not spoken', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    mountChat(h);
    await h.send('hi', { text: 'Quiet one. Quiet two.' });
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/Quiet one\. Quiet two\./)).not.toBeNull(), TIMEOUT);
    await h.settle(200);
    expect(spoken(h)).toEqual([]);

    await tapReadAloud(h);
    await h.rtl.waitFor(() => expect(h.view!.getByTestId('quick-read-aloud').props.accessibilityState).toMatchObject({ checked: true }), TIMEOUT);
    await tapReadAloud(h);
    await h.rtl.waitFor(() => expect(h.view!.getByTestId('quick-read-aloud').props.accessibilityState).toMatchObject({ checked: false }), TIMEOUT);
  }, 20000);

  it('speaks sentence by sentence and the remainder once', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await readAloudChat(h);

    // Two finished sentences are on screen; the second may still grow ("Second one. 3"), so only the first is read.
    h.boundary.llama!.scriptCompletion({ text: 'First one. Second one. Last bit', pauseAfter: 'Second one.' });
    await h.tapSend('q');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['First one.']), TIMEOUT);

    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['First one.', 'Second one.', 'Last bit']), TIMEOUT);
    await h.settle(200);
    expect(spoken(h)).toEqual(['First one.', 'Second one.', 'Last bit']);
  }, 20000);

  it("the reply's speaker shows Stop speaking while it is read and Speak when it is done", async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await readAloudChat(h);

    h.boundary.llama!.scriptCompletion({ text: 'First one. Second one. Last bit', pauseAfter: 'Second one.' });
    await h.tapSend('q');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['First one.']), TIMEOUT);
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['First one.', 'Second one.', 'Last bit']), TIMEOUT);
    await h.rtl.waitFor(() => expect(h.view!.queryByLabelText('Stop speaking')).not.toBeNull(), TIMEOUT);

    // The engine finishes the first two; the last is still being read.
    const ids = h.boundary.speech!.calls.speak.map(call => call.utteranceId);
    await h.rtl.act(async () => {
      for (const utteranceId of ids.slice(0, 2)) h.boundary.speech!.emit('FieldkitSpeech_done', { utteranceId });
    });
    expect(h.view!.queryByLabelText('Stop speaking')).not.toBeNull();

    await h.rtl.act(async () => { h.boundary.speech!.emit('FieldkitSpeech_done', { utteranceId: ids[2] }); });
    await h.rtl.waitFor(() => expect(h.view!.queryByLabelText('Speak')).not.toBeNull(), TIMEOUT);
    expect(h.view!.queryByLabelText('Stop speaking')).toBeNull();
  }, 20000);

  it('reads a sentence as soon as the next one has started', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await readAloudChat(h);

    h.boundary.llama!.scriptCompletion({ text: 'First one. Second one. Last bit', pauseAfter: 'Second one. L' });
    await h.tapSend('q');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['First one.', 'Second one.']), TIMEOUT);

    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['First one.', 'Second one.', 'Last bit']), TIMEOUT);
  }, 20000);

  it('no code or reasoning mid-stream', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await readAloudChat(h);

    h.boundary.llama!.scriptCompletion({
      text: '<think>Plan A. Plan B.</think>Intro one. Intro two. ```js\nfoo.bar(). baz()\n``` Done. End',
      pauseAfter: 'foo.bar(). b',
    });
    await h.tapSend('q');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Intro one.']), TIMEOUT);
    await h.settle(200);
    expect(spoken(h)).toEqual(['Intro one.']);

    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Intro one.', 'Intro two.', 'Done.', 'End']), TIMEOUT);
    for (const text of spoken(h)) expect(text).not.toMatch(/Plan|foo|baz|`|\*/);
  }, 20000);

  it('no half-written bold mid-stream', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await readAloudChat(h);

    h.boundary.llama!.scriptCompletion({ text: 'Lead in. Next **bold start. And more** done. Fin', pauseAfter: 'bold start. A' });
    await h.tapSend('q');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Lead in.']), TIMEOUT);
    await h.settle(200);
    expect(spoken(h)).toEqual(['Lead in.']);

    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Lead in.', 'Next bold start.', 'And more done.', 'Fin']), TIMEOUT);
    for (const text of spoken(h)) expect(text).not.toMatch(/\*/);
  }, 20000);

  it('stop mid-stream', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await readAloudChat(h);

    h.boundary.llama!.scriptCompletion({ text: 'One here. Two here. Three here. Four here.', pauseAfter: 'Two here.' });
    await h.tapSend('q');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['One here.']), TIMEOUT);

    const before = stopCalls(h);
    await pressStop(h);
    await h.settle(100);
    expect(stopCalls(h)).toBeGreaterThan(before);
    expect(spoken(h)).toEqual(['One here.']);

    h.boundary.llama!.scriptCompletion({ text: 'New reply. Done.', pauseAfter: 'New reply. D' });
    await h.tapSend('again');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['One here.', 'New reply.']), TIMEOUT);
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['One here.', 'New reply.', 'Done.']), TIMEOUT);
  }, 20000);

  it('new send mid-stream', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await readAloudChat(h);

    h.boundary.llama!.scriptCompletion({ text: 'Alpha one. Alpha two. Alpha three.', pauseAfter: 'Alpha two.' });
    await h.tapSend('first');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Alpha one.']), TIMEOUT);

    // The message waits for the running reply; sending it already silences the speech.
    const before = stopCalls(h);
    h.boundary.llama!.scriptCompletion({ text: 'Beta one. Beta two.', pauseAfter: 'Beta one. B' });
    await h.tapSend('next');
    expect(stopCalls(h)).toBeGreaterThan(before);

    // The first reply runs to its end unheard, then the second one starts and is read.
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Alpha one.', 'Beta one.']), TIMEOUT);
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Alpha one.', 'Beta one.', 'Beta two.']), TIMEOUT);
    await h.settle(200);
    expect(spoken(h)).toEqual(['Alpha one.', 'Beta one.', 'Beta two.']);
  }, 20000);

  it('tool-call markup split across tokens', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await readAloudChat(h, { toolsOff: true });

    // Held in the middle of the opening tag: the half tag is a piece of its own, which is never read.
    const call = toolCallText('web_search', { query: 'weather' });
    h.boundary.llama!.scriptCompletion({ text: `One. Two. ${call} Three.`, pauseAfter: '<tool_c' });
    await h.tapSend('q');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['One.', 'Two.']), TIMEOUT);
    await h.settle(200);
    expect(spoken(h)).toEqual(['One.', 'Two.']);

    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['One.', 'Two.', 'Three.']), TIMEOUT);
    await h.settle(200);
    expect(spoken(h)).toEqual(['One.', 'Two.', 'Three.']);
  }, 20000);

  it('tool-call markup: nothing of an unclosed call body is read', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await readAloudChat(h, { toolsOff: true });

    // Held inside the call body, which is not closed yet: none of it is read, and 'Two.' waits as the last piece.
    const call = toolCallText('web_search', { query: 'weather' });
    h.boundary.llama!.scriptCompletion({ text: `One. Two. ${call} Three.`, pauseAfter: '<tool_call>{"name":' });
    await h.tapSend('q');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['One.']), TIMEOUT);
    await h.settle(200);
    expect(spoken(h)).toEqual(['One.']);

    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['One.', 'Two.', 'Three.']), TIMEOUT);
    await h.settle(200);
    expect(spoken(h)).toEqual(['One.', 'Two.', 'Three.']);
    for (const text of spoken(h)) expect(text).not.toMatch(/tool|name|web_search|weather|[{}"<>]/);
  }, 20000);

  it('second tool round speaks in full', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    h.enableToolViaUI('calculator');
    await readAloudChat(h);
    await holdToolRoundOne(h);

    // Round 1 ends with its last piece, 'Okay.'. Round 2 starts as soon as the calculator has run, from an empty
    // text: it is read from its first sentence.
    h.boundary.llama!.scriptCompletion({ text: 'It is sunny. Bye', pauseAfter: 'It is sunny. B' });
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Let me check.', 'Okay.', 'It is sunny.']), TIMEOUT);
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Let me check.', 'Okay.', 'It is sunny.', 'Bye']), TIMEOUT);
    await h.settle(200);
    expect(spoken(h)).toEqual(['Let me check.', 'Okay.', 'It is sunny.', 'Bye']);
  }, 30000);

  it('a tool turn whose first round is only a tool call reads each sentence once', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    h.enableToolViaUI('calculator');
    await readAloudChat(h);

    // Round 1 calls the calculator without a word first. Once the call is closed, the chat strips it.
    h.boundary.llama!.scriptCompletion({ text: toolCallText('calculator', { expression: '2+2' }), pauseAfter: '<tool_call>' });
    await h.tapSend('what is (2+2)*2');
    await h.rtl.waitFor(() => expect(h.useChatStore.getState().streamingMessage).toMatch(/<tool_call>/), TIMEOUT);

    // Round 2 says something and calls the calculator again. Its call is stripped too once it is closed.
    const second = toolCallText('calculator', { expression: '4*2' });
    h.boundary.llama!.scriptCompletion({ text: `It is four. Now times two. ${second}`, pauseAfter: '{"name"' });
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['It is four.']), TIMEOUT);

    // Round 3 answers.
    h.boundary.llama!.scriptCompletion({ text: 'It is eight. Bye now.', pauseAfter: 'It is eight. B' });
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['It is four.', 'Now times two.', 'It is eight.']), TIMEOUT);
    await finishTurn(h);
    expect(spoken(h)).toEqual(['It is four.', 'Now times two.', 'It is eight.', 'Bye now.']);
  }, 30000);

  it('leaving the app during a tool round keeps the rest of that turn silent', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    h.enableToolViaUI('calculator');
    await readAloudChat(h);
    await holdToolRoundOne(h);

    // The user goes to the home screen while round 1 is still streaming.
    const before = stopCalls(h);
    await h.rtl.act(async () => { h.boundary.emitAppStateChange('background'); });
    expect(stopCalls(h)).toBeGreaterThan(before);

    // The turn goes on without the user; round 2 is not read, not even its first sentence.
    await holdToolRoundTwo(h);
    await h.settle(200);
    expect(spoken(h)).toEqual(['Let me check.']);
    await finishTurn(h);
    expect(spoken(h)).toEqual(['Let me check.']);

    // Back in the app, the next reply is read again.
    await h.rtl.act(async () => { h.boundary.emitAppStateChange('active'); });
    h.boundary.llama!.scriptCompletion({ text: 'Next one. Next two.', pauseAfter: 'Next one. N' });
    await h.tapSend('again');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Let me check.', 'Next one.']), TIMEOUT);
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Let me check.', 'Next one.', 'Next two.']), TIMEOUT);
  }, 30000);

  it('Speak on an earlier reply during a tool round reads it to the end, and the turn stays silent', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    h.enableToolViaUI('calculator');
    mountChat(h);
    // An earlier reply, which arrived before read-aloud was switched on, so it was not read.
    await h.send('hi', { text: 'Earlier one. Earlier two.' });
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/Earlier one\. Earlier two\./)).not.toBeNull(), TIMEOUT);
    await tapReadAloud(h);
    await h.rtl.waitFor(() => expect(h.boundary.speech!.calls.setVoice).toEqual(['en-us-offline']), TIMEOUT);
    await holdToolRoundOne(h);

    // While round 1 streams, the user taps Speak on the earlier reply (the only finished reply on screen).
    h.rtl.fireEvent.press(h.view!.getByLabelText('Speak'));
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Let me check.', 'Earlier one.', 'Earlier two.']), TIMEOUT);
    await h.rtl.waitFor(() => expect(h.view!.queryByLabelText('Stop speaking')).not.toBeNull(), TIMEOUT);
    const earlier = h.boundary.speech!.calls.speak.slice(1).map(call => call.utteranceId);

    // Round 2 streams. The earlier reply is still being read: nothing of round 2 is, and its button stays Stop speaking.
    await holdToolRoundTwo(h);
    await h.settle(200);
    expect(spoken(h)).toEqual(['Let me check.', 'Earlier one.', 'Earlier two.']);
    expect(h.view!.queryByLabelText('Stop speaking')).not.toBeNull();

    // The engine finishes the earlier reply: its button is back to Speak.
    await h.rtl.act(async () => {
      for (const utteranceId of earlier) h.boundary.speech!.emit('FieldkitSpeech_done', { utteranceId });
    });
    await h.rtl.waitFor(() => expect(h.view!.queryByLabelText('Stop speaking') === null).toBe(true), TIMEOUT);
    expect(h.view!.queryByLabelText('Speak') === null).toBe(false);

    await finishTurn(h);
    expect(spoken(h)).toEqual(['Let me check.', 'Earlier one.', 'Earlier two.']);
  }, 30000);

  it('leaving a chat during a tool round keeps the rest of that turn silent over the other chat', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    h.enableToolViaUI('calculator');
    const { leftChat } = await leaveTurnForOtherChat(h);
    await leftTurnEndsUnheard(h, leftChat);
    // A message sent in the other chat is read aloud.
    await nextReplyIsRead(h);
  }, 30000);

  it('switching read-aloud on in another chat does not read the turn the user left', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    h.enableToolViaUI('calculator');
    const { leftChat } = await leaveTurnForOtherChat(h);
    // In the other chat, the user switches read-aloud off and on again while the left turn generates on.
    await setReadAloud(h, false);
    await setReadAloud(h, true);
    await leftTurnEndsUnheard(h, leftChat);
    await nextReplyIsRead(h);
  }, 30000);

  it('Retry while another chat still writes its reply is refused and keeps the reply', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    const { leftChat, otherChat } = await leaveTurnForOtherChat(h, holdReply);
    await retryRefusedWhileOtherChatWrites(h);

    // Chat X's reply streams on off screen and ends. None of it is read, and nothing was written in chat Y.
    h.boundary.llama!.releaseStream();
    await waitUntilIdle(h);
    await h.settle(200);
    expect(spoken(h)).toEqual(['One here.']);
    const contents = (id: string) => h.useChatStore.getState().getConversationMessages(id).map((m: { content: string }) => m.content);
    expect(contents(otherChat)).toEqual(['hi', 'Other chat.']);
    expect(contents(leftChat).pop()).toMatch(/Four here\./);
  }, 30000);

  it('Retry works once the other chat has finished its reply', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await leaveTurnForOtherChat(h, holdReply);
    await retryRefusedWhileOtherChatWrites(h);
    h.rtl.fireEvent.press(h.view!.getByText('OK'));
    h.boundary.llama!.releaseStream();
    await waitUntilIdle(h);

    // Chat Y's reply is written again and read aloud.
    h.boundary.llama!.scriptCompletion({ text: 'Other again. Still here.', pauseAfter: 'Other again. S' });
    await h.openActionMenu('assistant', 'longpress');
    h.rtl.fireEvent.press(h.view!.getByTestId('action-retry'));
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['One here.', 'Other again.']), TIMEOUT);
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['One here.', 'Other again.', 'Still here.']), TIMEOUT);
    expect(h.view!.queryByText(/Other chat\./) === null).toBe(true);
  }, 30000);

  it('switching read-aloud off and on again while a reply streams reads the rest of it', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await readAloudChat(h);
    h.boundary.llama!.scriptCompletion({ text: 'One here. Two here. Three here. Four here.', pauseAfter: 'Two here.' });
    await h.tapSend('q');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['One here.']), TIMEOUT);

    await setReadAloud(h, false);
    await setReadAloud(h, true);
    // The reply is read again from its first finished sentence, so 'One here.' is heard twice.
    h.boundary.llama!.releaseStream();
    const expected = ['One here.', 'One here.', 'Two here.', 'Three here.', 'Four here.'];
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(expected), TIMEOUT);
    await h.settle(200);
    expect(spoken(h)).toEqual(expected);
  }, 20000);

  it('after Home during a reply, read-aloud off and on again back in the app reads the rest of it', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await readAloudChat(h);
    h.boundary.llama!.scriptCompletion({ text: 'One here. Two here. Three here. Four here.', pauseAfter: 'Two here.' });
    await h.tapSend('q');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['One here.']), TIMEOUT);

    const before = stopCalls(h);
    await h.rtl.act(async () => { h.boundary.emitAppStateChange('background'); });
    expect(stopCalls(h)).toBeGreaterThan(before);
    await h.rtl.act(async () => { h.boundary.emitAppStateChange('active'); });
    await setReadAloud(h, false);
    await setReadAloud(h, true);
    h.boundary.llama!.releaseStream();
    const expected = ['One here.', 'One here.', 'Two here.', 'Three here.', 'Four here.'];
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(expected), TIMEOUT);
    await h.settle(200);
    expect(spoken(h)).toEqual(expected);
  }, 20000);

  it('switching read-aloud on keeps a reply chosen with Speak playing', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    mountChat(h);
    await h.send('hi', { text: 'Earlier one. Earlier two.' });
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/Earlier one\. Earlier two\./)).not.toBeNull(), TIMEOUT);
    await waitUntilGone(h, 'stop-button');

    // Read-aloud is off. The user taps Speak on the reply, and the engine finishes its first chunk.
    h.rtl.fireEvent.press(h.view!.getByLabelText('Speak'));
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Earlier one.', 'Earlier two.']), TIMEOUT);
    await h.rtl.waitFor(() => expect(h.view!.queryByLabelText('Stop speaking') === null).toBe(false), TIMEOUT);
    const [first, second] = h.boundary.speech!.calls.speak.map(call => call.utteranceId);
    await h.rtl.act(async () => { h.boundary.speech!.emit('FieldkitSpeech_done', { utteranceId: first }); });

    // Read-aloud on: the engine is not stopped, and the reply is still being read.
    const before = stopCalls(h);
    await setReadAloud(h, true);
    await h.settle(100);
    expect(stopCalls(h)).toBe(before);
    expect(h.view!.queryByLabelText('Stop speaking') === null).toBe(false);

    // The engine reads the rest: the reply ends normally and its button is back to Speak.
    await h.rtl.act(async () => { h.boundary.speech!.emit('FieldkitSpeech_done', { utteranceId: second }); });
    await h.rtl.waitFor(() => expect(h.view!.queryByLabelText('Stop speaking') === null).toBe(true), TIMEOUT);
    expect(h.view!.queryByLabelText('Speak') === null).toBe(false);
    expect(spoken(h)).toEqual(['Earlier one.', 'Earlier two.']);
  }, 20000);

  it('a LiteRT reply with a native tool call in the middle reads each sentence once', async () => {
    const h = await setupChatScreen({ engine: 'litert', speech: {} });
    h.enableToolViaUI('calculator');
    await readAloudChat(h);

    // The native engine takes the prompt; the test plays its events: a lead-in, a tool call, then the answer.
    h.boundary.litert.scriptHang();
    await h.tapSend('what is 2 + 2');
    await h.rtl.waitFor(() => expect(h.boundary.litert.module.sendMessage).toHaveBeenCalled(), TIMEOUT);
    await nativeEvent(h, 'litert_token', 'Let me check.');
    await nativeEvent(h, 'litert_token', ' Okay.');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Let me check.']), TIMEOUT);

    // The call and its result are added to the chat while the reply's text streams on.
    const messages = () => h.useChatStore.getState().getConversationMessages(h.conversationId!);
    const count = messages().length;
    await nativeEvent(h, 'litert_tool_call', JSON.stringify({ id: 'tc-0', name: 'calculator', arguments: { expression: '2+2' } }));
    await h.rtl.waitFor(() => expect(messages().length).toBe(count + 2), TIMEOUT);
    await nativeEvent(h, 'litert_token', ' It is four.');
    await nativeEvent(h, 'litert_token', ' Bye now.');
    await nativeEvent(h, 'litert_complete', '{}');
    await waitUntilGone(h, 'stop-button');
    const expected = ['Let me check.', 'Okay.', 'It is four.', 'Bye now.'];
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(expected), TIMEOUT);
    await h.settle(200);
    expect(spoken(h)).toEqual(expected);
  }, 30000);

  it('a chat left early in its reply does not silence the next chat', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await readAloudChat(h);
    // Chat A's reply has only just started ('Sure') when the user goes back and opens a new chat.
    h.boundary.llama!.scriptCompletion({ text: 'Sure. Here is A. More of A. End of A.', pauseAfter: 'Sure' });
    await h.tapSend('question for A');
    await h.rtl.waitFor(() => expect(h.useChatStore.getState().streamingMessage).toMatch(/Sure/), TIMEOUT);
    const chatA = h.conversationId!;
    goBack(h);
    await openChat(h);
    // Chat A finishes off screen.
    h.boundary.llama!.releaseStream();
    await waitUntilIdle(h);
    await h.settle(200);
    expect(spoken(h)).toEqual([]);

    // Chat B: the first piece of its reply ('Paris') is longer than all chat A showed.
    h.boundary.llama!.scriptCompletion({ text: 'Paris is big. It is old. The end.', pauseAfter: 'Paris' });
    await h.tapSend('question for B');
    await h.rtl.waitFor(() => expect(h.useChatStore.getState().streamingMessage).toMatch(/Paris/), TIMEOUT);
    expect(h.conversationId).not.toBe(chatA);
    h.boundary.llama!.releaseStream();
    const expected = ['Paris is big.', 'It is old.', 'The end.'];
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(expected), TIMEOUT);
    await h.settle(200);
    expect(spoken(h)).toEqual(expected);
  }, 30000);

  it('a reply left early, then retried once it finished, is read', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await readAloudChat(h);
    // The user leaves chat A just after its reply started; it finishes off screen.
    h.boundary.llama!.scriptCompletion({ text: 'Sure. Here is A. More of A. End of A.', pauseAfter: 'Sure' });
    await h.tapSend('question for A');
    await h.rtl.waitFor(() => expect(h.useChatStore.getState().streamingMessage).toMatch(/Sure/), TIMEOUT);
    const chatA = h.conversationId!;
    goBack(h);
    h.boundary.llama!.releaseStream();
    await waitUntilIdle(h);

    // Back in chat A from the chat list, the user retries the reply.
    await openChat(h, chatA);
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/End of A\./)).not.toBeNull(), TIMEOUT);
    h.boundary.llama!.scriptCompletion({ text: 'Sure thing. Here it is. Done now.', pauseAfter: 'Here it is. D' });
    await h.openActionMenu('assistant', 'longpress');
    h.rtl.fireEvent.press(h.view!.getByTestId('action-retry'));
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Sure thing.', 'Here it is.']), TIMEOUT);
    h.boundary.llama!.releaseStream();
    const expected = ['Sure thing.', 'Here it is.', 'Done now.'];
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(expected), TIMEOUT);
    await h.settle(200);
    expect(spoken(h)).toEqual(expected);
  }, 30000);

  it('switching read-aloud on while a reply streams reads that reply from its first sentence', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    mountChat(h);
    h.boundary.llama!.scriptCompletion({ text: 'First one. Second one. Third one. Last bit', pauseAfter: 'Second one. T' });
    await h.tapSend('q');
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/Second one\. T/)).not.toBeNull(), TIMEOUT);
    expect(spoken(h)).toEqual([]);

    await tapReadAloud(h);
    await h.rtl.waitFor(() => expect(h.boundary.speech!.calls.setVoice).toEqual(['en-us-offline']), TIMEOUT);
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['First one.', 'Second one.', 'Third one.', 'Last bit']), TIMEOUT);
    await h.settle(200);
    expect(spoken(h)).toEqual(['First one.', 'Second one.', 'Third one.', 'Last bit']);
  }, 20000);

  it('switching read-aloud off while a reply is read stops it', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await readAloudChat(h);
    h.boundary.llama!.scriptCompletion({ text: 'One here. Two here. Three here. Four here.', pauseAfter: 'Two here.' });
    await h.tapSend('q');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['One here.']), TIMEOUT);

    const before = stopCalls(h);
    await tapReadAloud(h);
    await h.rtl.waitFor(() => expect(h.view!.getByTestId('quick-read-aloud').props.accessibilityState).toMatchObject({ checked: false }), TIMEOUT);
    expect(stopCalls(h)).toBeGreaterThan(before);

    await finishTurn(h);
    expect(spoken(h)).toEqual(['One here.']);
  }, 20000);

  it('switching read-aloud off keeps a reply chosen with Speak playing', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    mountChat(h);
    await h.send('hi', { text: 'Earlier one. Earlier two.' });
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/Earlier one\. Earlier two\./)).not.toBeNull(), TIMEOUT);
    await waitUntilGone(h, 'stop-button');
    await tapReadAloud(h);
    await h.rtl.waitFor(() => expect(h.boundary.speech!.calls.setVoice).toEqual(['en-us-offline']), TIMEOUT);

    // No reply streams. The user taps Speak on the reply, and the engine finishes its first chunk.
    h.rtl.fireEvent.press(h.view!.getByLabelText('Speak'));
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Earlier one.', 'Earlier two.']), TIMEOUT);
    await h.rtl.waitFor(() => expect(h.view!.queryByLabelText('Stop speaking') === null).toBe(false), TIMEOUT);
    const [first, second] = h.boundary.speech!.calls.speak.map(call => call.utteranceId);
    await h.rtl.act(async () => { h.boundary.speech!.emit('FieldkitSpeech_done', { utteranceId: first }); });

    // Read-aloud off: the engine is not stopped, and the reply is still being read.
    const before = stopCalls(h);
    await tapReadAloud(h);
    await h.rtl.waitFor(() => expect(h.view!.getByTestId('quick-read-aloud').props.accessibilityState).toMatchObject({ checked: false }), TIMEOUT);
    await h.settle(100);
    expect(stopCalls(h)).toBe(before);
    expect(h.view!.queryByLabelText('Stop speaking') === null).toBe(false);

    // The engine reads the rest: the reply ends normally and its button is back to Speak.
    await h.rtl.act(async () => { h.boundary.speech!.emit('FieldkitSpeech_done', { utteranceId: second }); });
    await h.rtl.waitFor(() => expect(h.view!.queryByLabelText('Stop speaking') === null).toBe(true), TIMEOUT);
    expect(h.view!.queryByLabelText('Speak') === null).toBe(false);
  }, 20000);

  it('control-token-only turn speaks nothing', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    mountChat(h);
    // An earlier reply that was never read aloud: read-aloud was off when it arrived.
    await h.send('hi', { text: 'Earlier reply.' });
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/Earlier reply\./)).not.toBeNull(), TIMEOUT);
    await tapReadAloud(h);
    await h.rtl.waitFor(() => expect(h.boundary.speech!.calls.setVoice).toEqual(['en-us-offline']), TIMEOUT);

    // The turn produces nothing but an end-of-turn token, so no new reply is stored: the earlier one is not read now.
    h.boundary.llama!.scriptCompletion({ text: '<|im_end|>', pauseAfter: '<|im_end|' });
    await h.tapSend('empty');
    await h.rtl.waitFor(() => expect(h.view!.queryByTestId('stop-button')).not.toBeNull(), TIMEOUT);
    h.boundary.llama!.releaseStream();
    await waitUntilGone(h, 'stop-button');
    await h.settle(300);
    expect(spoken(h)).toEqual([]);

    h.boundary.llama!.scriptCompletion({ text: 'Fresh start. Go on.', pauseAfter: 'Fresh start. G' });
    await h.tapSend('next');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Fresh start.']), TIMEOUT);
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Fresh start.', 'Go on.']), TIMEOUT);
  }, 20000);

  it('stop during init while streaming', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    mountChat(h);
    h.boundary.speech!.holdNextInit();
    await tapReadAloud(h);
    await h.rtl.waitFor(() => expect(h.boundary.speech!.module.init).toHaveBeenCalled(), TIMEOUT);

    // The engine is still starting when the first sentences are ready; the user stops the reply before it is up.
    h.boundary.llama!.scriptCompletion({ text: 'Slow one. Slow two. Slow three.', pauseAfter: 'Slow two. S' });
    await h.tapSend('q');
    // Finished sentences are waiting on the engine, which is still starting: none has reached it yet.
    const { useSpeechStore } = require('../../../src/stores/speechStore');
    await h.rtl.waitFor(() => expect(useSpeechStore.getState().speakingMessageId).toBe('streaming'), TIMEOUT);
    expect(h.boundary.speech!.calls.speak).toEqual([]);
    await pressStop(h);
    await h.rtl.act(async () => { h.boundary.speech!.releaseInit(); });
    await h.rtl.waitFor(() => expect(h.boundary.speech!.module.getVoices).toHaveBeenCalled(), TIMEOUT);
    await h.settle(300);
    expect(h.boundary.speech!.calls.speak).toEqual([]);

    h.boundary.llama!.scriptCompletion({ text: 'Next one. Next two.', pauseAfter: 'Next one. N' });
    await h.tapSend('again');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Next one.']), TIMEOUT);
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['Next one.', 'Next two.']), TIMEOUT);
  }, 20000);
});
