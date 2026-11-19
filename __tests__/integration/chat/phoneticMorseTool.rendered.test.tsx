/**
 * phonetic_morse end to end: the user switches Phonetic & Morse on in the real Tools screen and asks for a
 * call sign to be spelled for the radio; the model calls the tool, the REAL table lookup runs, and the chat's
 * tool-result bubble shows the spelling, followed by the model's reply.
 *
 * The expected words are the ICAO spelling alphabet (see the unit test). Real ChatScreen, tool loop and
 * lookup; only the native LiteRT leaf is faked.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

describe('phonetic_morse in a chat', () => {
  it('shows the call sign spelled out, then the answer', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    h.enableToolViaUI('phonetic_morse');
    h.render();

    await h.send('spell my call sign KD7ABC for the radio', {
      toolCalls: [{ name: 'phonetic_morse', arguments: { text: 'KD7ABC', to: 'phonetic' } }],
      content: 'Say it as Kilo Delta Seven Alfa Bravo Charlie.',
    });

    await h.rtl.waitFor(() => {
      expect(h.view!.queryByText(/^KD7ABC = Kilo Delta Seven Alfa Bravo Charlie$/)).not.toBeNull();
    });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Say it as Kilo Delta Seven Alfa Bravo Charlie\./)).not.toBeNull(); });
  });
});
