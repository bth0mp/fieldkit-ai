/**
 * Every saved store keeps what the person saved when a read fails at launch.
 *
 * A failed read left a store on its launch defaults, and the next change then overwrote everything saved.
 * Each store loads fresh over a phone whose read of its key fails (harness/flakyStorage), the person changes
 * one field, and the stored value must stay as saved until the read works, then hold the saved fields and
 * the change.
 */
import { failReadsOf, rawRow, seedRow, stopFailingReads, wipeFlakyStorage } from '../../harness/flakyStorage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('../../harness/flakyStorage').flakyAsyncStorageModule(),
);
jest.mock('@op-engineering/op-sqlite', () => require('../../harness/flakyStorage').flakyOpSqliteModule());

jest.setTimeout(30000);

interface Case {
  name: string;
  key: string;
  /** What the person saved: every persisted field, as the store writes it. */
  saved: object;
  /** Load the store fresh and change one field of it, the way the app does. */
  change: () => void;
  /** What storage must hold once the read works. */
  expected: object;
}

const project = { id: 'saved-project', name: 'Saved', description: '', systemPrompt: 'p', icon: '#000', createdAt: 'a', updatedAt: 'a' };
const place = { typed: 'Oslo', lat: 59.9, lon: 10.7 };
const rome = { typed: 'Rome', lat: 41.9, lon: 12.5 };

const CASES: Case[] = [
  {
    name: 'settings',
    key: 'local-llm-app-storage',
    saved: { textGenerationCount: 7, imageGenerationCount: 0 },
    change: () => require('../../../src/stores/appStore').useAppStore.setState({ imageGenerationCount: 3 }),
    expected: { textGenerationCount: 7, imageGenerationCount: 3 },
  },
  {
    name: 'lock settings',
    key: 'local-llm-auth-storage',
    saved: { isEnabled: true, failedAttempts: 0, lockoutUntil: null },
    change: () => require('../../../src/stores/authStore').useAuthStore.setState({ failedAttempts: 2 }),
    expected: { isEnabled: true, failedAttempts: 2 },
  },
  {
    name: 'projects',
    key: 'local-llm-project-storage',
    saved: { projects: [project] },
    change: () =>
      require('../../../src/stores/projectStore').useProjectStore.getState().createProject({
        name: 'New', description: '', systemPrompt: 'q', icon: '#111',
      }),
    expected: { projects: [expect.objectContaining({ id: 'saved-project' }), expect.objectContaining({ name: 'New' })] },
  },
  {
    name: 'remote servers',
    key: 'remote-servers',
    saved: {
      servers: [], activeServerId: null, activeRemoteTextModelId: 'saved-model',
      activeRemoteImageModelId: null, discoveredModels: {},
    },
    change: () =>
      require('../../../src/stores/remoteServerStore').useRemoteServerStore.setState({ activeRemoteImageModelId: 'img-1' }),
    expected: { activeRemoteTextModelId: 'saved-model', activeRemoteImageModelId: 'img-1' },
  },
  {
    name: 'Whisper model',
    key: 'local-llm-whisper-storage',
    saved: { downloadedModelId: 'saved-model' },
    change: () => require('../../../src/stores/whisperStore').useWhisperStore.setState({ downloadedModelId: 'new-model' }),
    expected: { downloadedModelId: 'new-model' },
  },
  {
    name: 'speech',
    key: 'local-llm-speech-storage',
    saved: { selectedVoiceId: 'v1', rate: 1.5, pitch: 1, autoSpeak: false },
    change: () => require('../../../src/stores/speechStore').useSpeechStore.setState({ pitch: 0.8 }),
    expected: { selectedVoiceId: 'v1', rate: 1.5, pitch: 0.8 },
  },
  {
    name: 'Home layout',
    key: '@fieldkit/home_layout',
    saved: { order: ['phone', 'assistant', 'fieldKit', 'library', 'checklists', 'today'], hidden: [] },
    change: () => require('../../../src/features/home/homeLayout').useHomeLayoutStore.setState({ hidden: ['today'] }),
    expected: { order: ['phone', 'assistant', 'fieldKit', 'library', 'checklists', 'today'], hidden: ['today'] },
  },
  {
    name: 'Home place',
    key: '@fieldkit/home_place',
    saved: { place },
    change: () => require('../../../src/features/home/homePlace').useHomePlaceStore.setState({ place: rome }),
    expected: { place: rome },
  },
  {
    name: 'Kiwix files',
    key: '@fieldkit/kiwix_files',
    saved: { files: {}, folders: ['content://saved'], removed: [], refused: [] },
    change: () => require('../../../src/services/kiwix/kiwixStore').useKiwixStore.setState({ removed: ['gone.zim'] }),
    expected: { folders: ['content://saved'], removed: ['gone.zim'] },
  },
];

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe.each(CASES)('$name survive a failed read', ({ key, saved, change, expected }) => {
  beforeEach(() => {
    wipeFlakyStorage();
    jest.resetModules();
  });

  it('keeps what was saved, then adds the change once the read works', async () => {
    const row = JSON.stringify({ state: saved, version: 0 });
    seedRow(key, row);
    failReadsOf(key, 'database is locked');
    const storage = require('@react-native-async-storage/async-storage');

    change.call(null);
    // The store is on its launch defaults while the read fails: nothing may replace the saved row.
    await pause(150);
    expect(storage.getItem).toHaveBeenCalledWith(key);
    expect(rawRow(key)).toBe(row);

    stopFailingReads(key);
    await new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        const stored = rawRow(key);
        if (stored !== row) return resolve();
        if (Date.now() - started > 8000) return reject(new Error('the change was never saved'));
        setTimeout(check, 50);
      };
      check();
    });
    expect(JSON.parse(rawRow(key) as string).state).toMatchObject(expected);
  });
});
