/**
 * sun_times end to end: the user switches Sunrise & Sunset on in the real Tools screen and asks about daylight;
 * the model calls the tool, the REAL calculation runs, and the chat's tool-result bubble shows the times,
 * followed by the model's answer.
 *
 * The expected times are the US Naval Observatory's for Greenwich on 18 November 2026 (see the unit test), not
 * this app's own output. Real ChatScreen, tool loop and calculation; only the native LiteRT leaf is faked.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

describe('sun_times in a chat', () => {
  it('shows sunrise and sunset for the place and day asked about, then the answer', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    h.enableToolViaUI('sun_times');
    h.render();

    await h.send('when does the sun set at 51.4778, -0.0015 on 18 November 2026, in UTC', {
      toolCalls: [{ name: 'sun_times', arguments: { position: '51.4778, -0.0015', date: '2026-11-18', utc_offset: 0 } }],
      content: 'Sunset is at about 16:07 UTC.',
    });

    // Observatory: rise 07:23, set 16:07. A minute either way is rounding.
    await h.rtl.waitFor(() => {
      expect(h.view!.queryByText(/Sun at 51\.47780, -0\.00150 on 2026-11-18 \(UTC\+00:00\): .*sunrise 07:2[234], .*sunset 16:0[678], /)).not.toBeNull();
    });
    // The moon that day, from the Observatory too: it rises at 13:26 and does not set until 00:43 on the 19th.
    expect(h.view!.queryByText(/ Moon: waxing gibbous, \d+% lit\. Moonrise 13:2[567], no moonset this day\./)).not.toBeNull();
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Sunset is at about 16:07 UTC\./)).not.toBeNull(); });
  });
});
