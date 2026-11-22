/**
 * Choosing a model from a chat (rendered): the header names the model in use and opens the Models screen, where
 * Use marks the model and comes back to the chat with the new name, the half-typed message kept and the composer
 * matching the new model. A message that needs a text model when none was ever chosen waits while the Models
 * screen is open and is sent once, in its own chat, when a model is chosen.
 *
 * Real AppNavigator, Home, Chat and Models screens, services and stores. Device leaves only: the Hugging Face and
 * LAN network at `global.fetch`, the remote server's stream at XMLHttpRequest, the llama and LiteRT engines, the
 * phone's RAM and the connection at NetInfo.
 */
import { bootHome, type ModelsAppOptions } from '../../harness/modelsApp';
import { resetDeviceMemory } from '../../harness/deviceMemory';
import { installRemoteStream } from '../../harness/remoteHarness';
import { GB } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

jest.setTimeout(40000);

const TIMEOUT = { timeout: 4000 };
const FIRST = { id: 'first', name: 'First', fileSize: 1 * GB };
const SECOND = { id: 'second', name: 'Second', fileSize: 1 * GB };
const SD_ONE = { id: 'sd1', name: 'SD One', size: 1 * GB, backend: 'coreml' as const, style: '' };
const LITERT_A = { id: 'a', name: 'Lite A', engine: 'litert' as const, fileName: 'a.litertlm', fileSize: 1 * GB, liteRTVision: false };
const LITERT_B = { id: 'b', name: 'Lite B', engine: 'litert' as const, fileName: 'b.litertlm', fileSize: 1 * GB, liteRTVision: true };
const WITH_PHOTO = 'Type a message or add an image...';
const settle = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const reply = (text: string) =>
  `data: {"choices":[{"delta":{"content":"${text}"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`;

// The harness resets modules when it boots the app, so everything of ours is required after that.
let t: Awaited<ReturnType<typeof bootHome>>;
let lan: Record<string, string[]>;
const stores = () => require('../../../src/stores');
const state = () => stores().useAppStore.getState();
const press = (el: any) => t.rtl.fireEvent.press(el);
const shown = (id: string) => t.ui.queryByTestId(id) !== null;
const byLabel = (label: string) => t.rtl.waitFor(() => t.ui.getByLabelText(label), TIMEOUT);
const byText = (text: string) => t.rtl.waitFor(() => t.ui.getByText(text), TIMEOUT);
const header = () => t.ui.getByTestId('model-loaded-indicator');
const input = () => t.ui.getByTestId('chat-input');
const pathOf = (fileName: string) => `${t.boundary.fs!.DocumentDirectoryPath}/models/${fileName}`;
/** How many messages the user sees as sent (the chat's title is the first message too, so text alone would count it). */
const userBubbles = (_text: string) => t.ui.queryAllByTestId('user-message').length;

async function boot(opts: Partial<ModelsAppOptions>, inUse: { text?: string; image?: string } = {}) {
  t = await bootHome({ totalGB: 12, ...opts });
  t.rtl.act(() => { state().setActiveModelId(inUse.text ?? null); state().setActiveImageModelId(inUse.image ?? null); });
  // LAN servers answer for the hosts in `lan`; everything else goes on to the Hugging Face fake.
  lan = {};
  const hfFetch = (global as any).fetch;
  (global as any).fetch = jest.fn(async (url: string, init?: unknown) => {
    const host = Object.keys(lan).find(h => String(url).startsWith(h));
    if (!host) return hfFetch(url, init);
    if (!String(url).includes('/v1/models')) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ object: 'list', data: lan[host].map(id => ({ id, object: 'model', owned_by: 'local' })) }) };
  });
}

/** Adds a server through the real Add Server screen (opened from Home), then returns to Home. */
async function addServer(name: string, host: string, models: string[]) {
  const { rtl, ui, nav } = t;
  lan[host] = models;
  rtl.act(() => { nav.navigate('RemoteServers'); });
  rtl.fireEvent.press(await rtl.waitFor(() => ui.getByText(/^Add (Another )?Server$/), TIMEOUT));
  rtl.fireEvent.changeText(await rtl.waitFor(() => ui.getByPlaceholderText('e.g., Ollama on my laptop'), TIMEOUT), name);
  rtl.fireEvent.changeText(ui.getByPlaceholderText('http://192.168.1.50:7878'), host);
  rtl.fireEvent.press(ui.getByText('Test Connection'));
  await rtl.waitFor(() => expect(ui.queryByText(/Connected \(/)).not.toBeNull(), TIMEOUT);
  const buttons = ui.getAllByText('Add Server');
  rtl.fireEvent.press(buttons[buttons.length - 1]);
  await rtl.waitFor(() => expect(ui.queryByText(name)).not.toBeNull(), TIMEOUT);
  rtl.act(() => { nav.goBack(); });
  await rtl.waitFor(() => expect(shown('home-screen')).toBe(true), TIMEOUT);
}

/** The app opens its download screen with no model, so the phone starts with one and loses it once Home is up. */
async function withNoDownloads() {
  const storage = require('@react-native-async-storage/async-storage');
  await (storage.default ?? storage).setItem('@local_llm/downloaded_models', '[]');
  t.rtl.act(() => { state().setDownloadedModels([]); });
}

/** Opens a new chat with the raised New chat button. */
async function newChat() {
  press(t.ui.getByTestId('new-chat-button'));
  await t.rtl.waitFor(() => expect(shown('chat-input')).toBe(true), TIMEOUT);
}

/** Opens a chat that already has a message in it (so it shows with no model in use). */
async function chatWithHistory(modelId: string) {
  const chat = stores().useChatStore.getState();
  const id = chat.createConversation(modelId, 'Earlier');
  chat.addMessage(id, { role: 'user', content: 'earlier question' });
  chat.addMessage(id, { role: 'assistant', content: 'earlier answer' });
  t.rtl.act(() => { t.nav.navigate('Chat', { conversationId: id }); });
  await t.rtl.waitFor(() => expect(shown('chat-input')).toBe(true), TIMEOUT);
  return id as string;
}

const type = (text: string) => t.rtl.fireEvent.changeText(input(), text);
const send = (text: string) => { type(text); press(t.ui.getByTestId('send-button')); };
const openFromHeader = async (tab: 'your-models-text' | 'your-models-image' = 'your-models-text') => {
  press(t.ui.getByTestId('model-selector'));
  await t.rtl.waitFor(() => expect(shown(tab === 'your-models-text' ? 'models-screen' : tab)).toBe(true), TIMEOUT);
  if (tab === 'your-models-text' && !shown(tab)) press(await byText('Text Models'));
  await t.rtl.waitFor(() => expect(shown(tab)).toBe(true), TIMEOUT);
};
/** The chat with only an image model in use: a message needing a text model has gone to the Models screen. */
async function messageWaiting(text = 'hello', withServer = false) {
  await boot({ models: [FIRST, SECOND], imageModels: [SD_ONE] }, { image: 'sd1' });
  if (withServer) await addServer('Study PC', 'http://localhost:1234', ['llama3']);
  await newChat();
  send(text);
  await t.rtl.waitFor(() => expect(shown('your-models-text')).toBe(true), TIMEOUT);
}

afterEach(() => resetDeviceMemory());

describe('Choosing a model from a chat (rendered)', () => {
  it('the header names the model, opens Models, and Use comes back with the new name and the half-typed message kept', async () => {
    await boot({ models: [FIRST, SECOND] }, { text: 'first' });
    await newChat();
    type('half a thou');
    expect(header()).toHaveTextContent('First');
    press(t.ui.getByTestId('model-selector'));
    press(await byLabel('Use Second'));
    await t.rtl.waitFor(() => expect(header()).toHaveTextContent('Second'), TIMEOUT);
    expect(shown('models-screen')).toBe(false);
    expect(input().props.value).toBe('half a thou');
  });

  it('a chat with messages: "No model" with none; "Image model" with only an image model, which opens Image', async () => {
    await boot({ models: [FIRST], imageModels: [SD_ONE] });
    await chatWithHistory('first');
    expect(header()).toHaveTextContent('No model');
    t.rtl.act(() => { state().setActiveImageModelId('sd1'); });
    expect(header()).toHaveTextContent('Image model');
    press(t.ui.getByTestId('model-selector'));
    await t.rtl.waitFor(() => expect(shown('your-models-image')).toBe(true), TIMEOUT);
    expect(shown('your-models-text')).toBe(false);
  });

  it.each([['remote', true], ['phone', false]])('header, a %s model in use: cloud mark is %s', async (kind, mark) => {
    await boot({ models: [FIRST] }, { text: 'first' });
    if (kind === 'remote') {
      await addServer('Study PC', 'http://localhost:1234', ['llama3']);
      press(t.ui.getByTestId('models-summary'));
      press(await byLabel('Use llama3'));
      await t.rtl.waitFor(() => expect(shown('models-screen')).toBe(false), TIMEOUT);
    }
    await newChat();
    expect(header()).toHaveTextContent(kind === 'remote' ? 'llama3' : 'First');
    expect(shown('model-remote-mark')).toBe(mark);
  });

  it('a screen reader hears the model and that it opens Models; a long name stays on one line and shrinks', async () => {
    const LONG = 'A very long model name that would not fit on a small phone beside the project and the settings button';
    await boot({ models: [{ ...FIRST, name: LONG }] }, { text: 'first' });
    await newChat();
    const button = t.ui.getByTestId('model-selector');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe(`${LONG}. Opens Models`);
    expect(header().props.numberOfLines).toBe(1);
    expect(t.rtl.within(button).UNSAFE_getAllByProps({ numberOfLines: 1 }).length).toBeGreaterThan(0);
    const flat = (style: unknown) => Object.assign({}, ...[style].flat(3).filter(Boolean));
    expect(flat(header().props.style).flexShrink).toBe(1);
    expect(flat(button.props.style).flexShrink).toBe(1);
    expect(shown('chat-settings-icon')).toBe(true);
  });

  it('LiteRT to LiteRT from a chat: the next message loads and is answered by the second file', async () => {
    await boot({ models: [LITERT_A, LITERT_B] }, { text: 'a' });
    const { litert } = t.boundary;
    litert.scriptTurn({ content: 'From A.' });
    await newChat();
    send('one');
    await t.rtl.waitFor(() => expect(t.ui.queryByText('From A.') !== null).toBe(true), TIMEOUT);
    await openFromHeader();
    press(await byLabel('Use Lite B'));
    await t.rtl.waitFor(() => expect(header()).toHaveTextContent('Lite B'), TIMEOUT);
    litert.scriptTurn({ content: 'From B.' });
    send('two');
    await t.rtl.waitFor(() => expect(t.ui.queryByText('From B.') !== null).toBe(true), TIMEOUT);
    expect(litert.module.loadModel.mock.calls.map((c: unknown[]) => c[0])).toEqual([pathOf('a.litertlm'), pathOf('b.litertlm')]);
    const lastLoad = Math.max(...litert.module.loadModel.mock.invocationCallOrder);
    const sends = litert.module.sendMessage.mock.invocationCallOrder;
    expect(sends[sends.length - 1]).toBeGreaterThan(lastLoad);
  });

  it('LiteRT without vision to LiteRT with it: the composer takes a photo before the first message', async () => {
    await boot({ models: [LITERT_A, LITERT_B] }, { text: 'a' });
    await newChat();
    expect(t.ui.queryByPlaceholderText(WITH_PHOTO) === null).toBe(true);
    await openFromHeader();
    press(await byLabel('Use Lite B'));
    await t.rtl.waitFor(() => expect(t.ui.queryByPlaceholderText(WITH_PHOTO) !== null).toBe(true), TIMEOUT);
    expect(t.boundary.litert.module.sendMessage).not.toHaveBeenCalled();
  });

  it.each(['a phone model', 'a remote model'])('a message with no text model ever chosen goes to Models and is sent once after Use on %s', async (kind) => {
    const remoteModel = kind === 'a remote model';
    await messageWaiting('hello', remoteModel);
    if (remoteModel) installRemoteStream(reply('Hi there.'));
    else t.boundary.llama!.scriptCompletion({ text: 'Hi there.' });
    press(await byLabel(remoteModel ? 'Use llama3' : 'Use First'));
    await t.rtl.waitFor(() => expect(userBubbles('hello')).toBe(1), TIMEOUT);
    expect(await byText('Hi there.')).toBeTruthy();
    await settle(300);
    expect(userBubbles('hello')).toBe(1);
    expect(shown('models-screen')).toBe(false);
  });

  it('coming back without choosing leaves it waiting; choosing later from the header sends it once', async () => {
    await messageWaiting();
    t.boundary.llama!.scriptCompletion({ text: 'Hi there.' });
    press(t.ui.getByTestId('models-back'));
    await t.rtl.waitFor(() => expect(shown('models-screen')).toBe(false), TIMEOUT);
    await settle(300);
    expect(userBubbles('hello')).toBe(0);
    await openFromHeader();
    press(await byLabel('Use First'));
    await t.rtl.waitFor(() => expect(userBubbles('hello')).toBe(1), TIMEOUT);
    expect(await byText('Hi there.')).toBeTruthy();
    await settle(300);
    expect(userBubbles('hello')).toBe(1);
  });

  it('a waiting message is not sent into another conversation opened meanwhile', async () => {
    await messageWaiting();
    press(t.ui.getByTestId('models-back'));
    await t.rtl.waitFor(() => expect(shown('models-screen')).toBe(false), TIMEOUT);
    const other = await chatWithHistory('first');
    t.boundary.llama!.scriptCompletion({ text: 'Hi there.' });
    await openFromHeader();
    press(await byLabel('Use First'));
    await t.rtl.waitFor(() => expect(shown('models-screen')).toBe(false), TIMEOUT);
    await settle(500);
    expect(t.ui.queryByText('hello') === null).toBe(true);
    expect(stores().useChatStore.getState().getConversationMessages(other).map((m: any) => m.content)).toEqual(['earlier question', 'earlier answer']);
    expect(t.boundary.llama!.calls.completion).toHaveLength(0);
  });

  it('Use then Back at once: the message is sent once, and Back is not taken twice', async () => {
    await messageWaiting();
    t.boundary.llama!.scriptCompletion({ text: 'Hi there.' });
    press(await byLabel('Use First'));
    press(t.ui.getByTestId('models-back'));
    await t.rtl.waitFor(() => expect(userBubbles('hello')).toBe(1), TIMEOUT);
    expect(await byText('Hi there.')).toBeTruthy();
    await settle(500);
    expect(userBubbles('hello')).toBe(1);
    expect(shown('chat-input')).toBe(true);
  });

  it('once sent it is not sent again when the model changes twice more', async () => {
    await messageWaiting();
    t.boundary.llama!.scriptCompletion({ text: 'Hi there.' });
    press(await byLabel('Use First'));
    await t.rtl.waitFor(() => expect(userBubbles('hello')).toBe(1), TIMEOUT);
    await byText('Hi there.');
    await openFromHeader();
    press(await byLabel('Unload First'));
    await t.rtl.waitFor(() => expect(state().activeModelId).toBeNull(), TIMEOUT);
    press(await byLabel('Use Second'));
    await t.rtl.waitFor(() => expect(header()).toHaveTextContent('Second'), TIMEOUT);
    await settle(500);
    expect(userBubbles('hello')).toBe(1);
    expect(t.boundary.llama!.calls.completion).toHaveLength(1);
  });

  it('leaving the chat while a message waits: a model chosen later sends nothing', async () => {
    await messageWaiting();
    press(t.ui.getByTestId('models-back'));
    await t.rtl.waitFor(() => expect(shown('models-screen')).toBe(false), TIMEOUT);
    press(t.rtl.within(t.ui.getByTestId('chat-screen')).UNSAFE_getAllByProps({ name: 'arrow-left' })[0]);
    await t.rtl.waitFor(() => expect(shown('chat-screen')).toBe(false), TIMEOUT);
    press(t.ui.getByTestId('models-summary'));
    press(await byText('Text Models'));
    press(await byLabel('Use First'));
    await t.rtl.waitFor(() => expect(t.ui.getByTestId('model-chip-label')).toHaveTextContent('First'), TIMEOUT);
    await settle(500);
    expect(t.boundary.llama!.calls.completion).toHaveLength(0);
    expect(stores().useChatStore.getState().conversations.every((c: any) => c.messages.length === 0)).toBe(true);
  });

  it.each([['Select Model', 1], ['Open Models', 0]])('No Model Selected, button "%s" (%d models), opens Models', async (label, count) => {
    await boot({ models: [FIRST] });
    if (!count) await withNoDownloads();
    t.rtl.act(() => { t.nav.navigate('Chat', {}); });
    await byText('No Model Selected');
    press(await byText(label));
    await t.rtl.waitFor(() => expect(shown('your-models-text')).toBe(true), TIMEOUT);
  });

  it('No Model Selected with nothing downloaded points at the Models screen', async () => {
    await boot({ models: [FIRST] });
    await withNoDownloads();
    t.rtl.act(() => { t.nav.navigate('Chat', {}); });
    expect(await byText('Download a text or image model from the Models screen to get started.')).toBeTruthy();
  });

  it('Reload after a settings change shows the loading bar and opens nothing', async () => {
    await boot({ models: [FIRST] }, { text: 'first' });
    const { activeModelService } = require('../../../src/services/activeModelService');
    await t.rtl.act(() => activeModelService.loadTextModel('first'));
    await newChat();
    t.rtl.act(() => { state().updateSettings({ nThreads: 3 }); });
    t.boundary.llama!.holdNextInit();
    press(await t.rtl.waitFor(() => t.ui.getByTestId('reload-model-banner'), TIMEOUT));
    await byText('Loading First...');
    expect(shown('models-screen')).toBe(false);
    await t.rtl.waitFor(() => expect(t.boundary.llama!.module.initLlama.mock.calls.length).toBe(2), TIMEOUT); // held inside the load
    t.boundary.llama!.releaseInit();
    await t.rtl.waitFor(() => expect(t.ui.queryByText('Loading First...') === null).toBe(true), TIMEOUT);
    expect(shown('models-screen')).toBe(false);
  });

  it('a failed load on send leaves no model in use', async () => {
    await boot({ models: [FIRST] }, { text: 'first' });
    await newChat();
    t.boundary.llama!.scriptInitFailure();
    send('hello');
    await t.rtl.waitFor(() => expect(t.ui.queryByText(/Failed to load model/) !== null).toBe(true), TIMEOUT);
    expect(state().activeModelId).toBeNull();
  });

  it('Use on a model too big for memory: the refusal comes with the message, and Load Anyway loads it', async () => {
    const BIG = { id: 'big', name: 'Big', fileSize: 20 * GB };
    await boot({ models: [FIRST, BIG] }, { text: 'first' });
    const { llmService } = require('../../../src/services/llm');
    await newChat();
    await openFromHeader();
    press(await byLabel('Use Big'));
    await t.rtl.waitFor(() => expect(header()).toHaveTextContent('Big'), TIMEOUT);
    for (const words of ['Insufficient Memory', 'Load Anyway']) expect(t.ui.queryByText(words) === null).toBe(true);
    t.boundary.llama!.scriptCompletion({ text: 'Hi there.' });
    send('hello');
    press(await byText('Load Anyway'));
    await t.rtl.waitFor(() => expect(llmService.isModelLoaded()).toBe(true), TIMEOUT);
    expect(await byText('Hi there.')).toBeTruthy();
  });

});
