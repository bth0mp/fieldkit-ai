/**
 * RENDERED INTEGRATION — "Speak" in the assistant message action menu, over the system speech engine.
 *
 * Real ChatScreen + real ChatMessage/ActionMenuSheet + the real feature bootstrap (activateFieldkitFeatures),
 * speechService, speechStore and speechText. Faked ONLY at the device boundary: the FieldkitSpeech native
 * module (boundary.speech) and the llama engine.
 *
 * The user's view: Speak is offered when the device can speak offline, speaks the answer and nothing else
 * (no reasoning, no markdown, no code, no tool-call markup), speaks long replies in engine-sized pieces, and
 * disappears when there is no usable offline voice. Nothing is ever spoken with a network voice.
 */
import { setupChatScreen } from '../../harness/chatHarness';
import type { SpeechVoice } from '../../../src/services/speech/speechTypes';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

const toolCallText = (name: string, args: Record<string, unknown>) => `<tool_call>${JSON.stringify({ name, arguments: args })}</tool_call>`;

const networkVoice: SpeechVoice = { id: 'en-us-network', name: 'English US (network)', language: 'en-US', networkRequired: true, notInstalled: false, quality: 500 };
const missingVoice: SpeechVoice = { id: 'missingD', name: 'English US (not installed)', language: 'en-US', networkRequired: false, notInstalled: true, quality: 400 };

type Harness = Awaited<ReturnType<typeof setupChatScreen>>;

const speechPhase = (): string => {
  const { useSpeechStore } = require('../../../src/stores');
  return useSpeechStore.getState().phase;
};

/** Open the last assistant message's action menu and press Speak. */
async function pressSpeak(h: Harness): Promise<void> {
  await h.openActionMenu('assistant', 'longpress');
  h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByTestId('action-speak')));
}

/** Reopen the action menu; assert it is open (Copy present) and report whether Speak is offered. */
async function speakOffered(h: Harness): Promise<boolean> {
  await h.openActionMenu('assistant', 'longpress');
  await h.rtl.waitFor(() => expect(h.view!.queryByTestId('action-copy')).not.toBeNull());
  return h.view!.queryByTestId('action-speak') !== null;
}

/** Mount the chat with the feature bootstrap active and one assistant reply on screen. */
async function chatWithReply(
  h: Harness,
  reply: string,
  visible: RegExp,
  opts: { disableDefaultTools?: boolean } = {},
): Promise<void> {
  if (opts.disableDefaultTools) {
    // The default tools are on; flipping them off lets tool-call markup arrive as leaked text.
    for (const id of ['web_search', 'read_url', 'search_knowledge_base']) h.enableToolViaUI(id);
  }
  require('../../../src/features').activateFieldkitFeatures();
  h.render();
  await h.send('hi', { text: reply });
  await h.rtl.waitFor(() => expect(h.view!.queryByText(visible)).not.toBeNull());
}

describe('Speak from the action menu (rendered)', () => {
  it('speaks only the answer', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await chatWithReply(
      h,
      `<think>secret plan</think>The answer is **42**.\n\n\`\`\`js\nx()\n\`\`\`\n${toolCallText('web_search', {})}`,
      /The answer is/,
      { disableDefaultTools: true },
    );
    await pressSpeak(h);
    await h.rtl.waitFor(() => expect(h.boundary.speech!.calls.speak.length).toBeGreaterThan(0));
    const spoken = h.boundary.speech!.calls.speak.map(c => c.text).join(' ');
    expect(spoken).toContain('The answer is 42.');
    expect(spoken).not.toMatch(/secret plan|\*\*|`|x\(\)|tool_call|web_search|"name"/);
    expect(h.boundary.speech!.calls.setVoice).toEqual(['en-us-offline']);
  }, 20000);

  it('no offline voice: nothing is spoken and Speak is no longer offered', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: { voices: [networkVoice, missingVoice] } });
    await chatWithReply(h, 'The answer is 42.', /The answer is/);
    await pressSpeak(h);
    await h.rtl.waitFor(() => expect(speechPhase()).toBe('unavailable'));
    expect(h.boundary.speech!.calls.speak).toEqual([]);
    expect(h.boundary.speech!.calls.setVoice).toEqual([]);
    expect(await speakOffered(h)).toBe(false);
  }, 20000);

  it('long reply chunks to the engine limit', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: { maxInputLength: 60 } });
    const reply = 'Here is the first short sentence. A second one follows right here. '
      + 'this long sentence has many small words and it keeps going without any break at all so the engine must cut it at the spaces between words until it is done. '
      + 'Another brief line. The end.';
    await chatWithReply(h, reply, /Here is the first/);
    await pressSpeak(h);
    await h.rtl.waitFor(() => expect(h.boundary.speech!.calls.speak.length).toBeGreaterThanOrEqual(7));
    const chunks = h.boundary.speech!.calls.speak.map(c => c.text);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(60);
    expect(chunks.join(' ')).toBe(
      'Here is the first short sentence. A second one follows right here. '
      + 'this long sentence has many small words and it keeps going without any break at all so the engine must cut it at the spaces between words until it is done. '
      + 'Another brief line. The end.',
    );
  }, 20000);

  it('repeated sentence: identical sentences get distinct utterance ids', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await chatWithReply(h, 'Yes. Yes. Done.', /Done\./);
    await pressSpeak(h);
    await h.rtl.waitFor(() => expect(h.boundary.speech!.calls.speak.length).toBe(3));
    const ids = h.boundary.speech!.calls.speak.map(c => c.utteranceId);
    expect(new Set(ids).size).toBe(3);
  }, 20000);

  it('module absent: Speak is not offered', async () => {
    const h = await setupChatScreen({ engine: 'llama' });
    await chatWithReply(h, 'The answer is 42.', /The answer is/);
    expect(await speakOffered(h)).toBe(false);
  }, 20000);

  it('no engine: nothing is spoken and Speak is no longer offered', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: { bound: false } });
    await chatWithReply(h, 'The answer is 42.', /The answer is/);
    await pressSpeak(h);
    await h.rtl.waitFor(() => expect(speechPhase()).toBe('unavailable'));
    expect(h.boundary.speech!.calls.speak).toEqual([]);
    expect(await speakOffered(h)).toBe(false);
  }, 20000);

  it('a new turn while the engine is still starting up cancels the pending reply', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await chatWithReply(h, 'The answer is 42.', /The answer is/);
    h.boundary.speech!.holdNextInit();
    await pressSpeak(h);
    await h.rtl.waitFor(() => expect(h.boundary.speech!.module.init).toHaveBeenCalled());

    // The user sends the next message: the screen silences speech for the new turn (HOOKS.audioStop).
    await h.send('and again', { text: 'Okay then.' });
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/Okay then\./)).not.toBeNull());
    h.boundary.speech!.releaseInit();

    await h.rtl.waitFor(() => expect(speechPhase()).toBe('ready'));
    expect(h.boundary.speech!.calls.speak).toEqual([]);
  }, 20000);
});
