/**
 * RENDERED INTEGRATION — read-aloud, an approval card and Stop in one turn.
 *
 * With "Read replies aloud" on, the reply is read as it streams; then the model calls draft_email and the turn
 * waits on its approval card. Stop declines the card: no mail app opens, nothing more of that turn is read and
 * no further completion runs. The next send is read aloud again.
 *
 * Real ChatScreen, chat input (quick settings), generationService, tool loop, approval service and card,
 * speechService and the feature bootstrap. Faked ONLY at the device boundary: the FieldkitSpeech module
 * (boundary.speech), the llama engine (boundary.llama) and the OS Linking module.
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
/** What the speech engine was asked to say, in order. */
const spoken = (h: Harness): string[] => h.boundary.speech!.calls.speak.map(call => call.text);

async function waitUntilGone(h: Harness, testID: string): Promise<void> {
  await h.rtl.waitFor(() => expect(h.view!.queryByTestId(testID) === null).toBe(true), TIMEOUT);
}

describe('read-aloud, an approval card and Stop (rendered)', () => {
  it('Stop while the card waits silences the rest of the turn, and the next send is read aloud', async () => {
    const h = await setupChatScreen({ engine: 'llama', speech: {} });
    h.enableToolViaUI('draft_email');
    require('../../../src/features').activateFieldkitFeatures();
    h.render();
    h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByTestId('quick-settings-button')));
    h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByTestId('quick-read-aloud')));
    await h.rtl.waitFor(() => expect(h.boundary.speech!.calls.setVoice).toEqual(['en-us-offline']), TIMEOUT);

    // The reply streams and its first sentence is read; then the model calls draft_email.
    h.boundary.llama!.scriptCompletion({ text: `First part here. Second part here. ${toolCallText('draft_email', DRAFT)}`, pauseAfter: 'Second part' });
    await h.tapSend('email bob');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['First part here.']), TIMEOUT);
    // What the turn would write after the card, if it went on.
    h.boundary.llama!.scriptCompletion({ text: 'After the card. More after it.' });
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => h.view!.getByTestId('approval-card'), TIMEOUT);
    // The round's last sentence is read once the tool round starts.
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['First part here.', 'Second part here.']), TIMEOUT);
    const completions = h.boundary.llama!.calls.completion.length;

    await h.rtl.act(async () => { h.rtl.fireEvent.press(h.view!.getByTestId('stop-button')); });
    await waitUntilGone(h, 'stop-button');
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
    await h.settle(700);
    expect(h.boundary.linking.openURL).not.toHaveBeenCalled();
    expect(h.boundary.llama!.calls.completion).toHaveLength(completions);
    expect(spoken(h)).toEqual(['First part here.', 'Second part here.']);
    expect(h.view!.queryByText(/After the card\./)).toBeNull();

    // The next send is read aloud.
    h.boundary.llama!.scriptCompletion({ text: 'Next one. Next two.', pauseAfter: 'Next one. N' });
    await h.tapSend('never mind');
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['First part here.', 'Second part here.', 'Next one.']), TIMEOUT);
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(spoken(h)).toEqual(['First part here.', 'Second part here.', 'Next one.', 'Next two.']), TIMEOUT);
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
    expect(h.boundary.linking.openURL).not.toHaveBeenCalled();
  }, 40000);
});
