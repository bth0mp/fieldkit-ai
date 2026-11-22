/**
 * A chat that read the calendar is never sent to a remote model (UI integration, heavy entry point). With a
 * remote model active, sending in such a chat, regenerating its last answer and enhancing an image prompt
 * from it all stop before any request leaves the phone. Send and regenerate say why and offer a new chat or
 * the on-device model; the image is made from the original prompt with a note that enhancement was skipped.
 * A clean chat still talks to the remote model, which is never offered the calendar read, and an on-device
 * model still enhances prompts in a private chat.
 *
 * Real ChatScreen + generation service + image service; only the native llama and diffusion leaves and the
 * remote server's HTTP stream are faked (nativeBoundary, remoteHarness).
 */
import { setupChatScreen } from '../../harness/chatHarness';
import { installRemoteModel, installRemoteStream } from '../../harness/remoteHarness';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

const REPLY_SSE =
  'data: {"choices":[{"delta":{"content":"Remote reply."}}]}\n\n' +
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
  'data: [DONE]\n\n';
const NOTICE_TITLE = 'This chat contains calendar data';
const NOTICE_BODY = "Calendar details read in this chat stay on your phone, so it can't be sent to a remote model.";
const PRIVATE_ID = 'private-chat';

type Harness = Awaited<ReturnType<typeof setupChatScreen>>;

/** A chat restored from an earlier session that read the calendar: one question, one answer, marked private. */
async function restorePrivateChat(h: Harness) {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default
    ?? require('@react-native-async-storage/async-storage');
  const now = new Date().toISOString();
  const conversation = {
    id: PRIVATE_ID, title: 'Friday', modelId: 'm', createdAt: now, updatedAt: now, containsPrivateData: true,
    messages: [
      { id: 'u1', role: 'user', content: 'what is on friday', timestamp: 1 },
      { id: 'a1', role: 'assistant', content: 'You see the dentist at two.', timestamp: 2 },
    ],
  };
  await AsyncStorage.setItem('local-llm-chat-storage', JSON.stringify({ state: { conversations: [conversation], activeConversationId: PRIVATE_ID }, version: 0 }));
  await h.useChatStore.persist.rehydrate();
  require('../../harness/chatHarness').routeHolder.params = { conversationId: PRIVATE_ID };
}

/** The chat-completion bodies the app sent (JSON with `messages`). Another request, such as a probe, carries
 *  no chat and is no leak. */
function chatCompletionBodies(sendSpy: jest.SpyInstance): string[] {
  return sendSpy.mock.calls.map(args => String(args[0])).filter(body => {
    try { return Array.isArray(JSON.parse(body).messages); } catch { return false; }
  });
}

const isEnhancementRequest = (p: { messages?: Array<{ role: string; content?: string }> }) =>
  !!p.messages?.some(m => m.role === 'system' && /image generation prompt/i.test(m.content || ''));

/** Activate a downloaded image model and force image mode, the way the user does. */
async function forceImageMode(h: Harness) {
  await h.placeImageModel({ backend: 'coreml' });
  const { activeModelService } = require('../../../src/services/activeModelService');
  await activeModelService.loadImageModel('sd');
  await h.cycleImageMode(); // auto -> ON(force)
  await h.rtl.waitFor(() => { expect(h.view!.queryByTestId('image-mode-force-badge')).not.toBeNull(); });
}

// Rendered chat suites take seconds per test; the first one also pays the first render.
jest.setTimeout(40000);

describe('a private chat stays off remote models', () => {
  it('refuses every remote path', async () => {
    const h = await setupChatScreen({ engine: 'llama', platform: 'android' });
    await installRemoteModel({ caps: { supportsToolCalling: true } });
    installRemoteStream(REPLY_SSE);
    const sendSpy = jest.spyOn((global as unknown as { XMLHttpRequest: { prototype: { send: () => void } } }).XMLHttpRequest.prototype, 'send');
    await restorePrivateChat(h);
    h.render();
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/You see the dentist at two\./)).not.toBeNull(); });

    // Send: the notice, and nothing leaves the phone.
    await h.tapSend('next question');
    await h.rtl.waitFor(() => { expect(h.view!.getByText(NOTICE_TITLE)).toBeTruthy(); });
    expect(h.view!.getByText(NOTICE_BODY)).toBeTruthy();
    expect(chatCompletionBodies(sendSpy)).toEqual([]);
    // "Use the on-device model" opens the Models screen on its Text tab.
    h.rtl.fireEvent.press(h.view!.getByText('Use the on-device model'));
    expect(mockNavigate).toHaveBeenCalledWith('Models', { initialTab: 'text' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(NOTICE_TITLE)).toBeNull(); });

    // Regenerate: the same notice, still nothing sent.
    await h.regenerateLast({ text: 'never used' });
    await h.rtl.waitFor(() => { expect(h.view!.getByText(NOTICE_TITLE)).toBeTruthy(); });
    expect(chatCompletionBodies(sendSpy)).toEqual([]);
    h.rtl.fireEvent.press(h.view!.getByText('Use the on-device model'));
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(NOTICE_TITLE)).toBeNull(); });

    // Image-prompt enhancement: skipped with a note; the image comes from the original prompt.
    h.useAppStore.getState().updateSettings({ enhanceImagePrompts: true });
    await forceImageMode(h);
    await h.tapSend('draw it');
    await h.rtl.waitFor(() => { expect(h.boundary.diffusion.calls.generateImage.length).toBe(1); }, { timeout: 6000 });
    expect(h.boundary.diffusion.calls.generateImage[0].prompt).toBe('draw it');
    expect(chatCompletionBodies(sendSpy)).toEqual([]);
    await h.rtl.waitFor(() => { expect(h.view!.getByText('Prompt enhancement skipped')).toBeTruthy(); });
    expect(h.view!.queryByText(/Enhancing your prompt/)).toBeNull();
  });

  it('start a new chat from the notice', async () => {
    const h = await setupChatScreen({ engine: 'llama', platform: 'android' });
    await installRemoteModel({ caps: { supportsToolCalling: true } });
    installRemoteStream(REPLY_SSE);
    const sendSpy = jest.spyOn((global as unknown as { XMLHttpRequest: { prototype: { send: () => void } } }).XMLHttpRequest.prototype, 'send');
    await restorePrivateChat(h);
    h.render();

    await h.tapSend('next question');
    h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByText('Start a new chat')));
    await h.rtl.waitFor(() => { expect(h.conversationId).not.toBe(PRIVATE_ID); });
    expect(h.conversationId).toBeTruthy();
    // The new chat holds no calendar data, so it talks to the remote model.
    await h.tapSend('hello');
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Remote reply\./)).not.toBeNull(); }, { timeout: 6000 });
    const chats = chatCompletionBodies(sendSpy);
    expect(chats).toHaveLength(1);
    expect(chats[0]).not.toContain('dentist');
  });

  it('private tool hidden on remote', async () => {
    const h = await setupChatScreen({ engine: 'llama', platform: 'android', calendar: { permission: 'granted' } });
    await installRemoteModel({ caps: { supportsToolCalling: true } });
    installRemoteStream(REPLY_SSE);
    const sendSpy = jest.spyOn((global as unknown as { XMLHttpRequest: { prototype: { send: () => void } } }).XMLHttpRequest.prototype, 'send');
    h.enableToolViaUI('read_calendar_events');
    await h.rtl.waitFor(() => { expect(h.useAppStore.getState().settings.enabledTools).toContain('read_calendar_events'); });
    h.enableToolViaUI('calculator');
    h.render();

    await h.tapSend('hello');
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Remote reply\./)).not.toBeNull(); }, { timeout: 6000 });
    const [chat] = chatCompletionBodies(sendSpy);
    const names = (JSON.parse(chat).tools ?? []).map((t: { function: { name: string } }) => t.function.name);
    expect(names).toContain('calculator');
    expect(names).not.toContain('read_calendar_events');
  });

  it('local enhancement still runs in a private chat', async () => {
    const h = await setupChatScreen({ engine: 'llama', platform: 'android' });
    await restorePrivateChat(h);
    h.render();
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/You see the dentist at two\./)).not.toBeNull(); });
    h.useAppStore.getState().updateSettings({ enhanceImagePrompts: true });
    await forceImageMode(h);

    h.boundary.llama!.scriptCompletion({ text: 'a watercolor of a dentist office' });
    await h.tapSend('draw it');
    await h.rtl.waitFor(() => { expect(h.boundary.diffusion.calls.generateImage.length).toBe(1); }, { timeout: 6000 });
    const enhancement = h.boundary.llama!.calls.completion.map(c => c[0] as { messages?: Array<{ role: string; content?: string }> }).find(isEnhancementRequest);
    expect(enhancement).toBeDefined();
    expect(h.boundary.diffusion.calls.generateImage[0].prompt).toBe('a watercolor of a dentist office');
    expect(h.view!.queryByText('Prompt enhancement skipped')).toBeNull();
  });
});
