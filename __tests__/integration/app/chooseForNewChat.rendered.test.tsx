/**
 * Every other way in to choosing a model (rendered): a new chat started with no model in use (the raised + button,
 * Chats' New, Chats' empty state) goes to the Models screen, Use opens the new chat there, and Back from the chat
 * is the tab the user came from; Back from Models without choosing creates no chat. The "No Model" alert in a
 * project, the "No Image Model" alert in the composer and the chat settings line each offer Open Models, and Back
 * is the screen it was opened from. Storage settings says models are deleted in the Download Manager.
 *
 * Real AppNavigator, tabs, Chat, Projects, Models and Storage screens, services and stores. Device leaves only: the
 * Hugging Face network at `global.fetch`, the llama engine, the phone's RAM, disk and the connection at NetInfo.
 */
import { bootHome, type ModelsAppOptions } from '../../harness/modelsApp';
import { resetDeviceMemory } from '../../harness/deviceMemory';
import { GB } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const TIMEOUT = { timeout: 4000 };
const FIRST = { id: 'first', name: 'First', fileSize: 1 * GB };
const SD_ONE = { id: 'sd1', name: 'SD One', size: 1 * GB, backend: 'coreml' as const, style: '' };

// The harness resets modules when it boots the app, so everything of ours is required after that.
let t: Awaited<ReturnType<typeof bootHome>>;
const stores = () => require('../../../src/stores');
const press = (el: any) => t.rtl.fireEvent.press(el);
const shown = (id: string) => t.ui.queryByTestId(id) !== null;
const find = (text: string) => t.rtl.waitFor(() => t.ui.getByText(text), TIMEOUT);
const chatBack = () => press(t.rtl.within(t.ui.getByTestId('chat-screen')).UNSAFE_getAllByProps({ name: 'arrow-left' })[0]);
const wait = (check: () => boolean) => t.rtl.waitFor(() => expect(check()).toBe(true), TIMEOUT);
const route = () => t.nav.getCurrentRoute().name;

async function boot(opts: Partial<ModelsAppOptions>, inUse: { text?: string; image?: string } = {}) {
  t = await bootHome({ totalGB: 12, ...opts });
  t.rtl.act(() => { stores().useAppStore.setState({ activeModelId: inUse.text ?? null, activeImageModelId: inUse.image ?? null }); });
}

/** The app opens its download screen with no model, so the phone starts with one and loses it once Home is up. */
async function withNoDownloads() {
  const storage = require('@react-native-async-storage/async-storage');
  await (storage.default ?? storage).setItem('@local_llm/downloaded_models', '[]');
  t.rtl.act(() => { stores().useAppStore.setState({ downloadedModels: [] }); });
}

async function openChatsTab() {
  press(t.ui.getByTestId('chats-tab'));
  await wait(() => t.ui.getByTestId('chats-tab').props.accessibilityState?.selected === true);
}

/** A new chat opened from here, with the chat's input showing. */
const newChatWith = async (start: string, how: string) => {
  if (start === 'chats-tab') await openChatsTab();
  if (how === 'new-chat-button') press(t.ui.getByTestId('new-chat-button'));
  else if (how === 'New') press(t.ui.getByText('New'));
  else press(t.ui.getByTestId('chats-open-models'));
};

afterEach(() => resetDeviceMemory());

describe('Every other way in to choosing a model (rendered)', () => {
  it.each([
    ['the + button', 'chats-tab', 'new-chat-button'],
    ['the + button from Home', 'home-tab', 'new-chat-button'],
    ['Chats, New', 'chats-tab', 'New'],
    ['Chats, empty state', 'chats-tab', 'chats-open-models'],
  ])('%s with no model: Models, Use, a new chat, and Back is the tab it came from', async (_name, start, how) => {
    await boot({ models: [FIRST] });
    await newChatWith(start, how);
    await wait(() => shown('your-models-text'));
    expect(shown('chat-input')).toBe(false);
    press(t.ui.getByLabelText('Use First'));
    await wait(() => shown('chat-input'));
    expect(shown('models-screen')).toBe(false);
    chatBack();
    await wait(() => !shown('chat-screen') && t.ui.getByTestId(start).props.accessibilityState?.selected === true);
    expect(shown('models-screen')).toBe(false);
  });

  it('Use on a remote model whose server does not answer: the alert comes, Models stays and no chat is started', async () => {
    await boot({ models: [FIRST] });
    stores().useRemoteServerStore.setState({
      servers: [{ id: 's1', name: 'Study PC', endpoint: 'http://localhost:1234', providerType: 'openai-compatible', createdAt: '2026-11-01T00:00:00.000Z' }],
      discoveredModels: { s1: [{ id: 'llama3', name: 'llama3', serverId: 's1', lastUpdated: '2026-11-01T00:00:00.000Z', capabilities: {} }] },
    });
    const hfFetch = (global as any).fetch;
    (global as any).fetch = jest.fn(async (url: string, init?: unknown) => {
      if (String(url).startsWith('http://localhost:1234')) throw new TypeError('Network request failed');
      return hfFetch(url, init);
    });
    press(t.ui.getByTestId('new-chat-button'));
    await wait(() => shown('your-models-text'));
    press(await t.rtl.waitFor(() => t.ui.getByLabelText('Use llama3'), TIMEOUT));
    await find('Failed to connect to remote model: Network request failed');
    expect(shown('models-screen')).toBe(true);
    expect(shown('chat-screen')).toBe(false);
    expect(stores().useChatStore.getState().conversations).toHaveLength(0);
    expect(stores().useRemoteServerStore.getState().activeServerId).toBeNull();
  });

  it('the same trip choosing an image model on the Image tab opens a new chat', async () => {
    await boot({ models: [FIRST], imageModels: [SD_ONE] });
    await openChatsTab();
    press(t.ui.getByTestId('new-chat-button'));
    await wait(() => shown('your-models-text'));
    press(t.ui.getByText('Image Models'));
    press(await t.rtl.waitFor(() => t.ui.getByLabelText('Use SD One'), TIMEOUT));
    await wait(() => shown('chat-input'));
    expect(stores().useAppStore.getState().activeImageModelId).toBe('sd1');
  });

  it('Back from Models without choosing returns to the tab and opens no chat', async () => {
    await boot({ models: [FIRST] });
    await openChatsTab();
    press(t.ui.getByTestId('new-chat-button'));
    await wait(() => shown('models-screen'));
    press(t.ui.getByTestId('models-back'));
    await wait(() => !shown('models-screen'));
    expect(shown('chat-screen')).toBe(false);
    expect(t.ui.getByTestId('chats-tab').props.accessibilityState?.selected).toBe(true);
    expect(stores().useChatStore.getState().conversations).toHaveLength(0);
  });

  it.each([['the + button', 'new-chat-button'], ['New', 'New']])('%s with a model in use opens a chat directly', async (_name, how) => {
    await boot({ models: [FIRST] }, { text: 'first' });
    await newChatWith('chats-tab', how);
    await wait(() => shown('chat-input'));
    expect(shown('models-screen')).toBe(false);
  });

  it('Chats with no chats and no model says where to choose one; with a model it offers New Chat', async () => {
    await boot({ models: [FIRST] });
    await openChatsTab();
    await find('Choose or download a model on the Models screen to start chatting.');
    expect(t.rtl.within(t.ui.getByTestId('chats-open-models')).getByText('Open Models')).toBeTruthy();
    t.rtl.act(() => { stores().useAppStore.setState({ activeModelId: 'first' }); });
    await find('Start a new conversation to begin chatting with your local AI.');
    expect(shown('chats-open-models')).toBe(false);
    expect(t.ui.getByText('New Chat')).toBeTruthy();
  });

  it('a screen reader hears that New and + open Models when no model is in use, and not otherwise', async () => {
    await boot({ models: [FIRST] });
    expect(t.ui.getByTestId('new-chat-button').props.accessibilityHint).toBe('Opens Models to choose a model first');
    await openChatsTab();
    expect(t.ui.getByLabelText('New chat. Opens Models')).toBeTruthy();
    t.rtl.act(() => { stores().useAppStore.setState({ activeModelId: 'first' }); });
    await wait(() => t.ui.queryByLabelText('New chat. Opens Models') === null);
    expect(t.ui.getByTestId('new-chat-button').props.accessibilityHint).toBeUndefined();
  });

  it.each([['ProjectDetail', 'New', 'project-detail-screen'], ['ProjectChats', 'project-chats-new', 'project-chats-screen']])(
    '%s, no model: the alert has Open Models, and Back is the project', async (screen, button, id) => {
      await boot({ models: [FIRST] });
      await withNoDownloads();
      const project = stores().useProjectStore.getState().createProject({ name: 'Trip', description: '', systemPrompt: '' });
      t.rtl.act(() => { t.nav.navigate(screen, { projectId: project.id }); });
      await wait(() => shown(id));
      const inScreen = t.rtl.within(t.ui.getByTestId(id));
      press(button === 'New' ? inScreen.getByText('New') : inScreen.getByTestId(button));
      await find('Please download a model first from the Models screen.');
      press(await find('Open Models'));
      await wait(() => shown('your-models-text'));
      press(t.ui.getByTestId('models-back'));
      await wait(() => !shown('models-screen'));
      expect(route()).toBe(screen);
      expect(stores().useChatStore.getState().conversations).toHaveLength(0);
    });

  it('the project alert Cancel stays on the project', async () => {
    await boot({ models: [FIRST] });
    await withNoDownloads();
    const project = stores().useProjectStore.getState().createProject({ name: 'Trip', description: '', systemPrompt: '' });
    t.rtl.act(() => { t.nav.navigate('ProjectDetail', { projectId: project.id }); });
    await wait(() => shown('project-detail-screen'));
    press(t.rtl.within(t.ui.getByTestId('project-detail-screen')).getByText('New'));
    press(await find('Cancel'));
    await wait(() => t.ui.queryByText('Open Models') === null);
    expect(route()).toBe('ProjectDetail');
  });

  async function chatWithoutImageModel() {
    await boot({ models: [FIRST] }, { text: 'first' });
    press(t.ui.getByTestId('new-chat-button'));
    await wait(() => shown('chat-input'));
  }

  it('the composer image toggle alert, no image model: Open Models opens Image, and Back is the chat', async () => {
    await chatWithoutImageModel();
    press(t.ui.getByTestId('quick-settings-button'));
    press(await t.rtl.waitFor(() => t.ui.getByTestId('quick-image-mode'), TIMEOUT));
    await find('Download an image generation model from the Models screen to enable this feature.');
    press(await find('Open Models'));
    await wait(() => shown('your-models-image'));
    expect(shown('your-models-text')).toBe(false);
    press(t.ui.getByTestId('models-back'));
    await wait(() => !shown('models-screen'));
    expect(route()).toBe('Chat');
  });

  it('the chat settings line, no image model: Open Models closes the sheet, opens Image, and Back is the chat with the sheet closed', async () => {
    await chatWithoutImageModel();
    press(t.ui.getByTestId('chat-settings-icon'));
    press(await find('IMAGE GENERATION'));
    press(await find('None selected'));
    const line = await find('No image models downloaded. Open Models to download one.');
    expect(t.ui.getByTestId('open-image-models').props.accessibilityRole).toBe('button');
    press(line);
    await wait(() => shown('your-models-image'));
    expect(t.ui.queryByText('Chat Settings') === null).toBe(true);
    press(t.ui.getByTestId('models-back'));
    await wait(() => !shown('models-screen'));
    expect(route()).toBe('Chat');
    expect(t.ui.queryByText('Chat Settings') === null).toBe(true);
  });

  it('Storage settings says models are deleted in the Download Manager', async () => {
    await boot({ models: [FIRST] });
    t.rtl.act(() => { t.nav.navigate('StorageSettings'); });
    expect(await find('To free up space, you can delete models in the Download Manager.')).toBeTruthy();
    expect(t.ui.queryByText(/Models tab/) === null).toBe(true);
  });
});
