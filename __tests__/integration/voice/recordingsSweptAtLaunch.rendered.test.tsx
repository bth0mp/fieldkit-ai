/**
 * Launch deletes old voice recordings that no saved message keeps.
 *
 * Every dictation records a WAV in the app's recordings folder. Only an Audio Mode voice note keeps its file,
 * as the attachment of the message it was sent with.
 *
 * Real App boot and chat store. Fakes only at the device boundary: the file system and AsyncStorage as a
 * phone whose reads can fail.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { failReadsOf, seedRow, wipeFlakyStorage } from '../../harness/flakyStorage';
import { wipeKeychain } from '../../harness/keychainFake';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('../../harness/flakyStorage').flakyAsyncStorageModule(),
);
jest.mock('@op-engineering/op-sqlite', () => require('../../harness/flakyStorage').flakyOpSqliteModule());
jest.mock('react-native-keychain', () => require('../../harness/keychainFake').keychainModule());
jest.mock('react-native-bootsplash', () => ({ hide: jest.fn(async () => {}) }), { virtual: true });

jest.setTimeout(60000);

const TIMEOUT = { timeout: 8000 };
const FOLDER = '/docs/audio-input';
const OLD = `${FOLDER}/input_1.wav`;
const VOICE_NOTE = `${FOLDER}/input_2.wav`;

type Boundary = ReturnType<typeof installNativeBoundary>;

const filesIn = async (boundary: Boundary): Promise<string[]> => {
  const readDir = boundary.fs!.module.readDir as (path: string) => Promise<{ path: string }[]>;
  return ((await readDir(FOLDER)) ?? []).map(f => f.path).sort();
};

/** An earlier Audio Mode chat: the voice note is the user's message attachment. */
const savedChats = () => JSON.stringify({
  state: {
    conversations: [{
      id: 'c1', title: 'Voice chat', modelId: 'm', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      messages: [{
        id: 'c1-u', role: 'user', content: 'what is in my bag', timestamp: 1,
        attachments: [{ id: 'a1', type: 'audio', uri: VOICE_NOTE, audioFormat: 'wav', audioDurationSeconds: 3 }],
      }],
    }],
    activeConversationId: null,
  },
  version: 0,
});

/** Boots the real App with two recordings on disk: one no message names, one the saved chat does. */
async function bootAppWithRecordings() {
  const boundary = installNativeBoundary({ llama: true, fs: true });
  const GB = 1024 ** 3;
  const filePath = `${boundary.fs!.DocumentDirectoryPath}/models/ggml-small.gguf`;
  boundary.fs!.seedFile(filePath, 500 * 1024 * 1024);
  const { createDownloadedModel } = require('../../utils/factories');
  const model = createDownloadedModel({ id: 'm', name: 'Test Model', engine: 'llama', fileSize: 2 * GB, filePath, fileName: 'ggml-small.gguf' });
  seedRow('@local_llm/downloaded_models', JSON.stringify([model]));
  seedRow('local-llm-app-storage', JSON.stringify({
    state: { hasCompletedOnboarding: true, checklistDismissed: true, shownSpotlights: { input: true, voiceHint: true, imageSettings: true } },
    version: 0,
  }));
  seedRow('local-llm-chat-storage', savedChats());
  boundary.fs!.seedFile(OLD, 3200);
  boundary.fs!.seedFile(VOICE_NOTE, 3200);
  return boundary;
}
describe('launch deletes leftover voice recordings (rendered)', () => {
  beforeEach(() => {
    wipeFlakyStorage();
    wipeKeychain();
  });

  it('launch deletes old recordings but keeps voice notes', async () => {
    const boundary = await bootAppWithRecordings();
    const React = require('react');
    const rtl = requireRTL();
    const App = require('../../../App').default;
    const ui = rtl.render(React.createElement(App));

    await rtl.waitFor(() => expect(ui.getByTestId('home-screen')).toBeTruthy(), TIMEOUT);
    await rtl.waitFor(async () => { expect(await filesIn(boundary)).toEqual([VOICE_NOTE]); }, TIMEOUT);
  });

  it("launch deletes nothing when the chats couldn't be read", async () => {
    const boundary = await bootAppWithRecordings();
    failReadsOf('local-llm-chat-storage', 'database is locked');
    const React = require('react');
    const rtl = requireRTL();
    const App = require('../../../App').default;
    const ui = rtl.render(React.createElement(App));

    await rtl.waitFor(() => expect(ui.getByTestId('home-screen')).toBeTruthy(), TIMEOUT);
    await new Promise(resolve => setTimeout(resolve, 1500));
    expect(await filesIn(boundary)).toEqual([OLD, VOICE_NOTE]);
  });
});
