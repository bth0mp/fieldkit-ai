/**
 * A voice recording is deleted once it is used, and launch deletes old ones that no saved message keeps.
 *
 * Every dictation records a WAV in the app's recordings folder. Only an Audio Mode voice note keeps its file,
 * as the attachment of the message it was sent with.
 *
 * Real chat screen with the mic button, real App boot, real chat store and recorder service. Fakes only at the
 * device boundary: whisper.rn, the audio recorder (writes into the fs fake), the file system, and AsyncStorage
 * as a phone whose reads can fail.
 */
import { installNativeBoundary } from '../../harness/nativeBoundary';
import { setupChatScreen } from '../../harness/chatHarness';
import { wipeFlakyStorage } from '../../harness/flakyStorage';
import { wipeKeychain } from '../../harness/keychainFake';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('../../harness/flakyStorage').flakyAsyncStorageModule(),
);
jest.mock('@op-engineering/op-sqlite', () => require('../../harness/flakyStorage').flakyOpSqliteModule());
jest.mock('react-native-keychain', () => require('../../harness/keychainFake').keychainModule());
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));

jest.setTimeout(60000);

const TIMEOUT = { timeout: 8000 };
const FOLDER = '/docs/audio-input';

type Boundary = ReturnType<typeof installNativeBoundary>;

const filesIn = async (boundary: Boundary): Promise<string[]> => {
  const readDir = boundary.fs!.module.readDir as (path: string) => Promise<{ path: string }[]>;
  return ((await readDir(FOLDER)) ?? []).map(f => f.path).sort();
};

describe('a dictation leaves no recording behind (rendered)', () => {
  beforeEach(() => {
    wipeFlakyStorage();
    wipeKeychain();
  });

  it('a dictation leaves no recording behind', async () => {
    const h = await setupChatScreen({ engine: 'llama', whisper: true, recorder: true });
    await h.setupWhisperModel('tiny.en');
    h.render();

    await h.tapMic();
    await h.rtl.waitFor(() => { expect(h.boundary.whisper!.hasRealtimeSubscriber()).toBe(true); });
    // The fallback recording is on disk while the person speaks.
    expect(await filesIn(h.boundary)).toHaveLength(1);
    h.boundary.whisper!.emitRealtime({ text: 'hello there', isCapturing: true, recordingTime: 300 });
    h.boundary.whisper!.emitRealtime({ text: 'hello there', isCapturing: false, recordingTime: 900 });

    const input = await h.rtl.waitFor(() => {
      const el = h.view!.getByTestId('chat-input');
      expect(el.props.value).toContain('hello there');
      return el;
    }, TIMEOUT);
    expect(input.props.value).toContain('hello there');
    await h.rtl.waitFor(async () => { expect(await filesIn(h.boundary)).toEqual([]); }, TIMEOUT);
  });

  it('a dictation that needed the recording to find its words leaves none behind either', async () => {
    const h = await setupChatScreen({ engine: 'llama', whisper: true, recorder: true });
    await h.setupWhisperModel('tiny.en');
    h.render();
    h.boundary.whisper!.setFileTranscript('hello there');

    await h.tapMic();
    await h.rtl.waitFor(() => { expect(h.boundary.whisper!.hasRealtimeSubscriber()).toBe(true); });
    h.boundary.whisper!.emitRealtime({ isCapturing: false, noData: true, recordingTime: 900 });

    await h.rtl.waitFor(() => { expect(h.view!.getByTestId('chat-input').props.value).toContain('hello there'); }, TIMEOUT);
    await h.rtl.waitFor(async () => { expect(await filesIn(h.boundary)).toEqual([]); }, TIMEOUT);
  });


  it('a dictation to a model that hears audio leaves no recording behind', async () => {
    const h = await setupChatScreen({ engine: 'litert', audio: true, whisper: true, recorder: true });
    await h.setupWhisperModel('tiny.en');
    h.render();
    h.boundary.whisper!.setFileTranscript('hello there');

    await h.tapMic();
    await h.rtl.waitFor(async () => { expect(await filesIn(h.boundary)).toHaveLength(1); }, TIMEOUT);
    await h.releaseMic();

    await h.rtl.waitFor(() => { expect(h.view!.getByTestId('chat-input').props.value).toContain('hello there'); }, TIMEOUT);
    await h.rtl.waitFor(async () => { expect(await filesIn(h.boundary)).toEqual([]); }, TIMEOUT);
  });
});
