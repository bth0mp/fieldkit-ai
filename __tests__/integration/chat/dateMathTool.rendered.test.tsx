/**
 * date_math end to end: the user switches Date Calculator on in the real Tools screen and asks a calendar
 * question; the model calls the tool, the REAL calculation runs, and the chat's tool-result bubble shows the
 * dated answer, followed by the model's reply.
 *
 * The expected answer is a calendar fact (see the unit test). Real ChatScreen, tool loop and calculation; only
 * the native LiteRT leaf is faked.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

describe('date_math in a chat', () => {
  it('shows the date worked out, then the answer', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    h.enableToolViaUI('date_math');
    h.render();

    await h.send('we have food for 45 days from 18 November 2026, when does it run out', {
      toolCalls: [{ name: 'date_math', arguments: { start: '2026-11-18', add_days: 45 } }],
      content: 'It runs out on Saturday 2 January 2027.',
    });

    await h.rtl.waitFor(() => {
      expect(h.view!.queryByText(/45 days after 2026-11-18 \(Wednesday\) is 2027-01-02 \(Saturday\)\./)).not.toBeNull();
    });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/It runs out on Saturday 2 January 2027\./)).not.toBeNull(); });
  });
});
