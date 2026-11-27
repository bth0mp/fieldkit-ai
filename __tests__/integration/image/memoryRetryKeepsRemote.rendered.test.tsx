/**
 * Free memory & Retry keeps the remote model (rendered). Chatting through a remote model, an image request whose
 * local image model will not fit in memory shows the failure card. Tapping "Free memory & Retry" frees the phone's
 * memory, but the remote model holds none, so it stays chosen: the chat still names it and the next message
 * reaches the remote server.
 *
 * Real ChatScreen, services and stores. Device leaves only: the phone's RAM and the diffusion engine
 * (nativeBoundary) and the remote server's stream (remoteHarness).
 */
import { setupChatScreen } from '../../harness/chatHarness';
import { installRemoteModel, installRemoteStream } from '../../harness/remoteHarness';
import { GB } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

const REPLY_SSE =
  'data: {"choices":[{"delta":{"content":"Remote reply."}}]}\n\n' +
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
  'data: [DONE]\n\n';

describe('Free memory & Retry keeps the remote model', () => {
  it('Free memory & Retry keeps the remote model', async () => {
    const h = await setupChatScreen({ engine: 'litert', platform: 'ios' });
    h.render();
    const { modelId } = await installRemoteModel();
    installRemoteStream(REPLY_SSE);
    await h.placeImageModel({ backend: 'coreml' });
    await h.cycleImageMode(); // auto -> ON(force)
    await h.rtl.waitFor(() => { expect(h.view!.queryByTestId('image-mode-force-badge')).not.toBeNull(); });

    // The phone is short of memory: the image model cannot be loaded.
    h.boundary.setRam({ platform: 'ios', totalBytes: 4 * GB, availBytes: 300 * 1024 * 1024 });
    const { hardwareService } = require('../../../src/services/hardware');
    await hardwareService.refreshMemoryInfo();
    await h.tapSend('a fox in the snow');
    await h.rtl.waitFor(() => { expect(h.view!.queryByText('Free memory & Retry')).not.toBeNull(); }, { timeout: 6000 });

    h.rtl.fireEvent.press(h.view!.getByText('Free memory & Retry'));
    await h.settle(300);

    // The remote model is still the chosen one.
    expect(require('../../../src/stores').useRemoteServerStore.getState().activeRemoteTextModelId).toBe(modelId);

    // Sending put the composer back in auto image mode, so a plain message goes to the remote server.
    await h.tapSend('hello');
    await h.rtl.waitFor(() => { expect(h.view!.queryByText('Remote reply.')).not.toBeNull(); }, { timeout: 6000 });
  }, 40000);
});
