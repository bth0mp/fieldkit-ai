/**
 * distance_bearing end to end: the user switches Distance & Bearing on in the real Tools screen and asks how
 * far and which way a place is; the model calls the tool, the REAL calculation runs, and the chat's
 * tool-result bubble shows the distance, the bearing to set out on and the bearing back, then the answer.
 *
 * The expected values are GeographicLib's (see the unit test), not this app's own output. Real ChatScreen,
 * tool loop and calculation; only the native LiteRT leaf is faked.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

describe('distance_bearing in a chat', () => {
  it('shows how far and which way, then the answer', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    h.enableToolViaUI('distance_bearing');
    h.render();

    await h.send('how far is 78.22, 15.65 from 78, 15 and which way', {
      toolCalls: [{ name: 'distance_bearing', arguments: { from: '78, 15', to: '78.22, 15.65' } }],
      content: 'About 28.8 km to the north-east.',
    });

    // GeodSolve: 28756.955 m, bearing 31.02 degrees, onward bearing 31.66 (so 211.66 back).
    await h.rtl.waitFor(() => {
      expect(h.view!.queryByText(/From 78\.00000, 15\.00000 to 78\.22000, 15\.65000: 28\.76 km \(17\.87 mi\), bearing 031° true \(north-east\)\. Bearing back: 212° \(south-west\)\./)).not.toBeNull();
    });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/About 28\.8 km to the north-east\./)).not.toBeNull(); });
  });
});
