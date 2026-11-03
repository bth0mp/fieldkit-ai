/**
 * RENDERED INTEGRATION — the Speak button in an assistant reply's meta row, over the system speech engine.
 *
 * Real ChatScreen + real MessageRenderer/ChatMessage + the real feature bootstrap (activateFieldkitFeatures),
 * speechService and speechStore. Faked ONLY at the device boundary: the FieldkitSpeech native module
 * (boundary.speech) and the llama engine.
 *
 * The user's view: a finished reply carries a Speak button; tapping it reads the reply aloud and turns the
 * button into Stop speaking; tapping that (or sending the next message, or leaving the app) silences it; it
 * goes back to Speak when the speech ends; and it is not shown when the device cannot speak offline.
 */
import { setupChatScreen } from '../../harness/chatHarness';
import type { SpeechVoice } from '../../../src/services/speech/speechTypes';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

const networkVoice: SpeechVoice = { id: 'en-us-network', name: 'English US (network)', language: 'en-US', networkRequired: true, notInstalled: false, quality: 500 };

type Harness = Awaited<ReturnType<typeof setupChatScreen>>;

/** Mount the chat with the feature bootstrap active and one assistant reply on screen. */
async function chatWithReply(h: Harness, reply: string, visible: RegExp): Promise<void> {
  require('../../../src/features').activateFieldkitFeatures();
  h.render();
  await h.send('hi', { text: reply });
  await h.rtl.waitFor(() => expect(h.view!.queryByText(visible)).not.toBeNull());
}

const stopCalls = (h: Harness): number => h.boundary.speech!.module.stop.mock.calls.length;
const spokenIds = (h: Harness): string[] => h.boundary.speech!.calls.speak.map(c => c.utteranceId);

/** Tap the button that currently carries `label`. */
async function tap(h: Harness, label: string): Promise<void> {
  h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByLabelText(label)));
}

/** The engine starts and finishes each utterance, as the phone's speech engine does. */
async function finishUtterances(h: Harness, utteranceIds: string[]): Promise<void> {
  await h.rtl.act(async () => {
    for (const utteranceId of utteranceIds) {
      h.boundary.speech!.emit('FieldkitSpeech_start', { utteranceId });
      h.boundary.speech!.emit('FieldkitSpeech_done', { utteranceId });
    }
  });
}

/** Mount a reply and tap Speak until the button says Stop speaking and every sentence is queued. */
async function speaking(h: Harness, reply: string, visible: RegExp, sentences: number): Promise<void> {
  await chatWithReply(h, reply, visible);
  await tap(h, 'Speak');
  await h.rtl.waitFor(() => expect(h.boundary.speech!.calls.speak.length).toBe(sentences));
  await h.rtl.waitFor(() => expect(h.view!.queryByLabelText('Stop speaking')).not.toBeNull());
}

describe('Speak button on assistant replies (rendered)', () => {
  it('tap speaks, tap again stops, done returns to idle', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await chatWithReply(h, 'One. Two.', /One\. Two\./);
    expect(h.view!.getAllByTestId(/^speak-button-/)).toHaveLength(1);

    await tap(h, 'Speak');
    await h.rtl.waitFor(() => expect(h.boundary.speech!.calls.speak).toHaveLength(2));
    await h.rtl.waitFor(() => expect(h.view!.queryByLabelText('Stop speaking')).not.toBeNull());

    const before = stopCalls(h);
    await tap(h, 'Stop speaking');
    expect(stopCalls(h)).toBe(before + 1);
    await h.rtl.waitFor(() => expect(h.view!.queryByLabelText('Speak')).not.toBeNull());
    expect(h.view!.queryByLabelText('Stop speaking')).toBeNull();

    await tap(h, 'Speak');
    await h.rtl.waitFor(() => expect(h.boundary.speech!.calls.speak).toHaveLength(4));
    await h.rtl.waitFor(() => expect(h.view!.queryByLabelText('Stop speaking')).not.toBeNull());
    await finishUtterances(h, spokenIds(h).slice(2));
    await h.rtl.waitFor(() => expect(h.view!.queryByLabelText('Speak')).not.toBeNull());
    expect(h.view!.queryByLabelText('Stop speaking')).toBeNull();
  }, 20000);

  it('stop during init: nothing is spoken and the button is back to Speak', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await chatWithReply(h, 'One. Two.', /One\. Two\./);
    h.boundary.speech!.holdNextInit();

    await tap(h, 'Speak');
    await h.rtl.waitFor(() => expect(h.boundary.speech!.module.init).toHaveBeenCalled());
    await h.rtl.waitFor(() => expect(h.view!.queryByLabelText('Stop speaking')).not.toBeNull());

    await tap(h, 'Stop speaking');
    await h.rtl.waitFor(() => expect(h.view!.queryByLabelText('Speak')).not.toBeNull());
    await h.rtl.act(async () => { h.boundary.speech!.releaseInit(); });

    await h.rtl.waitFor(() => expect(h.boundary.speech!.module.getVoices).toHaveBeenCalled());
    expect(h.boundary.speech!.calls.speak).toEqual([]);
    expect(h.view!.queryByLabelText('Speak')).not.toBeNull();
    expect(h.view!.queryByLabelText('Stop speaking')).toBeNull();
  }, 20000);

  it('background stops speech', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await speaking(h, 'One. Two.', /One\. Two\./, 2);

    const before = stopCalls(h);
    await h.rtl.act(async () => { h.boundary.emitAppStateChange('background'); });

    expect(stopCalls(h)).toBe(before + 1);
    await h.rtl.waitFor(() => expect(h.view!.queryByLabelText('Speak')).not.toBeNull());
    expect(h.view!.queryByLabelText('Stop speaking')).toBeNull();
  }, 20000);

  it('new send stops speech', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    await speaking(h, 'One. Two.', /One\. Two\./, 2);

    const before = stopCalls(h);
    await h.send('next', { text: 'Three.' });
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/Three\./)).not.toBeNull());

    expect(stopCalls(h)).toBeGreaterThan(before);
    await h.rtl.waitFor(() => expect(h.view!.getAllByLabelText('Speak')).toHaveLength(2));
    expect(h.view!.queryByLabelText('Stop speaking')).toBeNull();
  }, 20000);

  it('no offline voice: nothing is spoken and the button goes away', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: { voices: [networkVoice] } });
    await chatWithReply(h, 'The answer is 42.', /The answer is/);

    await tap(h, 'Speak');
    await h.rtl.waitFor(() => expect(h.view!.queryAllByTestId(/^speak-button-/)).toHaveLength(0));
    expect(h.boundary.speech!.calls.speak).toEqual([]);
    expect(h.boundary.speech!.calls.setVoice).toEqual([]);
  }, 20000);

  it('module absent: there is no button', async () => {
    const h = await setupChatScreen({ engine: 'llama' });
    await chatWithReply(h, 'The answer is 42.', /The answer is/);
    expect(h.view!.queryAllByTestId(/^speak-button-/)).toHaveLength(0);
  }, 20000);
});
