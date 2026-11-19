/**
 * convert_units end to end: the user switches Unit Converter on in the real Tools screen, asks a question,
 * the model calls the tool, the REAL converter runs, and the chat shows the exact conversion in the
 * tool-result bubble followed by the model's answer.
 *
 * Real ChatScreen, tool loop and converter; only the native LiteRT leaf is faked.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

describe('convert_units in a chat', () => {
  it('shows the exact conversion the tool worked out, then the answer', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    h.enableToolViaUI('convert_units');
    h.render();

    await h.send('how far is a marathon in km', {
      toolCalls: [{ name: 'convert_units', arguments: { value: 26.2, from: 'miles', to: 'km' } }],
      content: 'A marathon is about 42.2 km.',
    });

    // The bubble carries the converter's own line, so the user can check the model's rounding against it.
    await h.rtl.waitFor(() => {
      expect(h.view!.queryByText(/26\.2 mi = 42\.1648 km/)).not.toBeNull();
    });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/A marathon is about 42\.2 km\./)).not.toBeNull(); });
  });
});
