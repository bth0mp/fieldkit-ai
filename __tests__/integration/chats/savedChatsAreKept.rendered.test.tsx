/**
 * Saved chats survive a failed, slow or oversized read.
 *
 * The chat history is one stored value read once at launch. A failed read used to leave the store empty,
 * and the next new chat then overwrote every saved chat. On Android a history over about 2 MB cannot be
 * read in one row at all, and every streamed word rewrote the whole value.
 *
 * Real Chats list and chat screens, real chat store and storage layers, real gestures. Fakes only at the
 * device boundary: llama.rn and the file system (nativeBoundary), and AsyncStorage with the SQLite
 * database behind it, as a phone whose reads can fail (harness/flakyStorage).
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { setupChatScreen } from '../../harness/chatHarness';
import {
  failReadsOf,
  markOversized,
  rawRow,
  seedRow,
  stopFailingReads,
  wipeFlakyStorage,
  writtenKeys,
} from '../../harness/flakyStorage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('../../harness/flakyStorage').flakyAsyncStorageModule(),
);
jest.mock('@op-engineering/op-sqlite', () => require('../../harness/flakyStorage').flakyOpSqliteModule());
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

const KEY = 'local-llm-chat-storage';
const MANIFEST = 'fieldkit-chunked:v1:';
const NOTICE = 'Your saved chats could not be read. New chats will not be kept until they can be.';

jest.setTimeout(60000);

const chat = (id: string, title: string) => {
  const now = new Date().toISOString();
  return {
    id, title, modelId: 'm', createdAt: now, updatedAt: now,
    messages: [{ id: `${id}-u`, role: 'user', content: 'earlier question', timestamp: 1 }],
  };
};
const savedValue = (...titles: string[]) =>
  JSON.stringify({ state: { conversations: titles.map((t, i) => chat(`c${i}`, t)), activeConversationId: null }, version: 0 });

/** The chat history as stored on the phone, whether in one row or in parts behind a manifest. */
function storedTitles(): string[] {
  const head = rawRow(KEY);
  if (head === null) return [];
  let json = head;
  if (head.startsWith(MANIFEST)) {
    const parts = Number(head.slice(MANIFEST.length));
    json = Array.from({ length: parts }, (_, i) => rawRow(`${KEY}::chunk:${i}`) ?? '').join('');
  }
  return JSON.parse(json).state.conversations.map((c: { title: string }) => c.title);
}

/** Every stored message text, to check that a finished reply was saved. */
function storedText(): string {
  const head = rawRow(KEY) ?? '';
  if (!head.startsWith(MANIFEST)) return head;
  return Array.from({ length: Number(head.slice(MANIFEST.length)) }, (_, i) => rawRow(`${KEY}::chunk:${i}`) ?? '').join('');
}

/** The real Chats list, as the Chats tab shows it. */
function openChatsList() {
  const React = require('react');
  const { ChatsListScreen } = require('../../../src/screens/ChatsListScreen');
  return requireRTL().render(React.createElement(ChatsListScreen, {}));
}

describe('saved chats are kept', () => {
  beforeEach(() => wipeFlakyStorage());

  it('keeps saved chats when the first read fails and a chat is started meanwhile', async () => {
    seedRow(KEY, savedValue('Saved before'));
    failReadsOf(KEY, 'database is locked');
    const h = await setupChatScreen({ engine: 'llama' });
    h.render();

    // The user starts a chat while the saved ones cannot be read yet.
    await h.send('hello', { text: 'Hi there.' });
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/Hi there\./)).not.toBeNull());
    expect(storedTitles()).toEqual(['Saved before']);

    // The phone reads again: the retry brings the saved chat back next to the new one.
    stopFailingReads(KEY);
    await h.rtl.waitFor(() => expect(storedTitles()).toHaveLength(2), { timeout: 8000 });
    const list = openChatsList();
    expect(list.getByText('Saved before')).toBeTruthy();
    expect(list.getByText('hello')).toBeTruthy();
    expect(storedTitles()).toContain('Saved before');
    expect(storedTitles()).toContain('hello');
    expect(storedText()).toContain('Hi there.');
  });

  it('opens a history too large for Android to read in one row', async () => {
    seedRow(KEY, savedValue('Long history'));
    markOversized(KEY);
    const h = await setupChatScreen({ engine: 'llama' });
    h.render();

    const list = openChatsList();
    await h.rtl.waitFor(() => expect(list.getByText('Long history')).toBeTruthy());

    await h.send('one more', { text: 'Noted.' });
    await h.rtl.waitFor(() => expect(h.view!.queryByText(/Noted\./)).not.toBeNull());
    await h.rtl.waitFor(() => expect(rawRow(KEY)?.startsWith(MANIFEST)).toBe(true));
    expect(storedTitles()).toEqual(expect.arrayContaining(['Long history', 'one more']));
  });

  it('says so when saved chats cannot be read, and Try again brings them back', async () => {
    installNativeBoundary();
    const rtl = requireRTL();
    const saved = savedValue('Saved before');
    seedRow(KEY, saved);
    failReadsOf(KEY, 'database is locked');
    const { useChatStore } = require('../../../src/stores');
    const list = openChatsList();

    await rtl.waitFor(() => expect(list.getByText(NOTICE)).toBeTruthy(), { timeout: 5000 });
    expect(list.queryByText('Saved before')).toBeNull();
    // A new chat is not saved while the old ones cannot be read.
    useChatStore.getState().createConversation('m', 'Meanwhile');
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(writtenKeys().filter(key => key.startsWith(KEY))).toEqual([]);
    expect(rawRow(KEY)).toBe(saved);

    stopFailingReads(KEY);
    rtl.fireEvent.press(list.getByRole('button', { name: 'Try again' }));
    await rtl.waitFor(() => expect(list.getByText('Saved before')).toBeTruthy());
    expect(list.queryByText(NOTICE)).toBeNull();
    // The chat made while the history could not be read joins the saved one.
    expect(list.getByText('Meanwhile')).toBeTruthy();
  });

  it('does not write the chat history while a reply streams', async () => {
    installNativeBoundary();
    const rtl = requireRTL();
    seedRow(KEY, savedValue('Stored chat'));
    const { useChatStore } = require('../../../src/stores');
    const list = openChatsList();
    await rtl.waitFor(() => expect(list.getByText('Stored chat')).toBeTruthy());

    const id = useChatStore.getState().conversations[0].id;
    useChatStore.getState().startStreaming(id);
    await new Promise(resolve => setTimeout(resolve, 50));
    const before = writtenKeys().length;
    for (let i = 0; i < 100; i += 1) useChatStore.getState().appendToStreamingMessage('word ');
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(useChatStore.getState().streamingMessage.length).toBe(500);
    expect(writtenKeys().length).toBe(before);
  });
});
