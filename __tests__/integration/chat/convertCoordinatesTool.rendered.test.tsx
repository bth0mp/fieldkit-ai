/**
 * convert_coordinates end to end: the user switches Grid Reference on in the real Tools screen and asks for
 * a grid reference; the model calls the tool, the REAL converter runs, and the chat's tool-result bubble
 * shows the position as latitude/longitude, UTM and MGRS, followed by the model's answer.
 *
 * The expected grid values are GeographicLib's for the Statue of Liberty (see the unit test), not this
 * app's own output. Real ChatScreen, tool loop and converter; only the native LiteRT leaf is faked.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

describe('convert_coordinates in a chat', () => {
  it('shows the position in all three forms, then the answer', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    h.enableToolViaUI('convert_coordinates');
    h.render();

    await h.send('what is the MGRS grid for 40.6892, -74.0445', {
      toolCalls: [{ name: 'convert_coordinates', arguments: { position: '40.6892, -74.0445' } }],
      content: 'That is 18T WL 80735 04695.',
    });

    await h.rtl.waitFor(() => {
      expect(h.view!.queryByText(/40\.68920, -74\.04450 = UTM 18T 580736 4504695 = MGRS 18T WL 80735 04695/)).not.toBeNull();
    });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/That is 18T WL 80735 04695\./)).not.toBeNull(); });
  });
});
