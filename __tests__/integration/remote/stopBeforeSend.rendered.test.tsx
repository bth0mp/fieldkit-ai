/**
 * Stop pressed before a remote chat request goes out sends nothing.
 *
 * SPEC (user's view): I attach a photo and send it to my remote server. If I press Stop while the app
 * is still reading the photo, nothing is sent to the server and the chat goes back to idle, with no
 * reply and no error.
 *
 * The real ChatScreen, remote provider, generation service and stores run. Fakes only at the device
 * boundary: the streaming XMLHttpRequest (records every send) and the filesystem read of the photo,
 * which the test holds the way slow storage does.
 */
import { setupChatScreen } from '../../harness/chatHarness';
import { installRemoteModel } from '../../harness/remoteHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));
jest.setTimeout(60_000);

const REPLY =
  'data: {"choices":[{"delta":{"content":"Should never arrive."}}]}\n\n' +
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
  'data: [DONE]\n\n';

/** An XMLHttpRequest that counts sends and answers each with REPLY. */
function installRecordingXhr(): { sends: number } {
  const record = { sends: 0 };
  class RecordingXHR {
    responseText = '';
    readyState = 0;
    status = 0;
    onprogress: null | (() => void) = null;
    onreadystatechange: null | (() => void) = null;
    onerror: null | (() => void) = null;
    ontimeout: null | (() => void) = null;
    open(): void { this.readyState = 1; }
    setRequestHeader(): void { /* headers do not matter here */ }
    abort(): void { /* nothing in flight to cancel */ }
    send(): void {
      record.sends += 1;
      setTimeout(() => {
        this.responseText = REPLY;
        this.readyState = 4;
        this.status = 200;
        this.onreadystatechange?.();
      }, 0);
    }
  }
  (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = RecordingXHR;
  return record;
}

/** Hold the device's base64 file reads (the photo) until release(). */
function holdPhotoReads(readFile: jest.Mock) {
  const real = readFile.getMockImplementation()!;
  let waiting: Array<() => void> = [];
  let released = false;
  readFile.mockImplementation(async (path: string, encoding?: string) => {
    if (!released && encoding === 'base64') await new Promise<void>(resolve => waiting.push(resolve));
    return real(path, encoding);
  });
  return {
    pending: () => waiting.length > 0,
    release: () => { released = true; waiting.forEach(resolve => resolve()); waiting = []; },
  };
}

describe('a chat with a photo on a remote server', () => {
  it('Stop pressed before the request goes out sends nothing and returns the chat to idle', async () => {
    const h = await setupChatScreen({ engine: 'llama', platform: 'android' });
    await installRemoteModel({ caps: { supportsVision: true } });
    const xhr = installRecordingXhr();
    h.boundary.fs!.seedFile('/mock/image.jpg', 2048);
    h.render();
    await h.attachImageViaUI();
    const photoRead = holdPhotoReads(h.boundary.fs!.module.readFile as jest.Mock);

    // BEFORE: an idle chat, nothing sent.
    expect(h.view!.queryByTestId('stop-button')).toBeNull();
    expect(xhr.sends).toBe(0);

    await h.tapSend('What is in this photo?');
    const stop = await h.view!.findByTestId('stop-button');
    await h.rtl.waitFor(() => expect(photoRead.pending()).toBe(true));
    expect(xhr.sends).toBe(0);

    // Stop while the request is still being prepared, then the photo read finishes.
    h.rtl.fireEvent.press(stop);
    photoRead.release();

    await h.rtl.waitFor(() => expect(h.view!.queryByTestId('stop-button')).toBeNull());
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(h.view!.queryByText(/Should never arrive/)).toBeNull();
    expect(h.view!.queryByText(/Error|Network error|timeout/i)).toBeNull();
    expect(xhr.sends).toBe(0);
  });
});
