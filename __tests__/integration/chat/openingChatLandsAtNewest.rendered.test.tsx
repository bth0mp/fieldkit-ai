/**
 * RENDERED INTEGRATION - a chat opens at its newest message, and the list moves only when it should.
 *
 * The real ChatScreen, chat input, generation pipeline and chat store; only the device boundary is faked (the llama
 * engine, and the native scroll view whose scroll calls are the visible outcome here). The native scroll view is
 * modelled as the device has it: scrollTo goes to the offset it is given, scrollToEnd goes to ITS content height
 * minus the list height.
 *
 * A list's first content-size change arrives before any row has reported its height, so FlatList.scrollToEnd (which
 * sums measured rows) scrolls to offset 0, the oldest message. An opening chat must reach the end of the content its
 * layout reports, with no row measured and no timer run.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

type Harness = Awaited<ReturnType<typeof setupChatScreen>>;

const TIMEOUT = { timeout: 4000 };
const LIST_HEIGHT = 747;
const CONTENT_HEIGHT = 1959;

const native = { offset: -1, contentHeight: 0, listHeight: 0 };
let scrollTo: jest.SpyInstance;
let scrollToEnd: jest.SpyInstance;

/** The native scroll view the app mounts (the harness reloads modules, so it is required after setup). */
function modelNativeScrollView() {
  native.offset = -1;
  native.contentHeight = 0;
  native.listHeight = 0;
  const { ScrollView } = require('react-native');
  scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(((options: { y?: number }) => {
    native.offset = options?.y ?? 0;
  }) as never);
  scrollToEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation((() => {
    native.offset = Math.max(0, native.contentHeight - native.listHeight);
  }) as never);
}

async function setup(): Promise<Harness> {
  const h = await setupChatScreen({ engine: 'llama' });
  modelNativeScrollView();
  return h;
}

afterEach(() => {
  scrollTo?.mockRestore();
  scrollToEnd?.mockRestore();
});

const list = (h: Harness) => h.view!.getByTestId('chat-message-list');

/** The order the device delivers on an open: the list's frame, then its content size. No row layout. */
const layoutList = (h: Harness, contentHeight: number, nativeContentHeight = contentHeight) => {
  native.listHeight = LIST_HEIGHT;
  h.rtl.fireEvent(list(h), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 440, height: LIST_HEIGHT } } });
  native.contentHeight = nativeContentHeight;
  h.rtl.fireEvent(list(h), 'contentSizeChange', 440, contentHeight);
};

const readerScrollsUp = (h: Harness) => {
  h.rtl.fireEvent(list(h), 'scrollBeginDrag');
  h.rtl.fireEvent.scroll(list(h), {
    nativeEvent: { contentOffset: { y: 0 }, contentSize: { height: 5000, width: 400 }, layoutMeasurement: { height: 600, width: 400 } },
  });
};

/** A chat with one answered turn; returns its id. The screen is left unmounted. */
async function chatWithTurn(h: Harness, text: string, reply: string): Promise<string> {
  await h.openChat(null);
  await h.send(text, { text: reply });
  await h.rtl.waitFor(() => expect(h.view!.getByText(reply)).toBeTruthy(), TIMEOUT);
  const id = h.conversationId!;
  // Let the reply's own follow-the-reply scroll (a 100 ms timer) finish first.
  await h.settle(200);
  return id;
}

describe('an opening chat lands at its newest message', () => {
  it.each([
    ['the native size is current', 1959],
    ['the native size is one layout behind', 1500],
  ])('ends at the content end on the first content-size change when %s', async (_case, nativeContentHeight) => {
    const h = await setup();
    h.render();
    await h.send('[test] List five fruits.', { text: 'Apple Banana Cherry' });
    await h.rtl.waitFor(() => expect(h.view!.getByText(/Cherry/)).toBeTruthy(), TIMEOUT);
    const id = h.conversationId!;
    await h.openChat(null);
    await h.openChat(id);

    layoutList(h, CONTENT_HEIGHT, nativeContentHeight);
    expect(native.offset).toBe(CONTENT_HEIGHT - LIST_HEIGHT);

    // A bar appears above the composer while the chat opens: the list shrinks and the end stays in view at once.
    native.listHeight = 685;
    h.rtl.fireEvent(list(h), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 440, height: 685 } } });
    expect(native.offset).toBe(CONTENT_HEIGHT - 685);
  });

  it('opens the second chat at its newest message too', async () => {
    const h = await setup();
    const first = await chatWithTurn(h, '[test] First chat.', 'First reply.');
    const second = await chatWithTurn(h, '[test] Second chat.', 'Second reply.');
    await h.openChat(first);
    layoutList(h, CONTENT_HEIGHT);
    // The reader scrolls up in the first chat, then the screen shows the second chat without unmounting.
    readerScrollsUp(h);
    native.offset = -1;

    const route: { params: Record<string, unknown> } = require('../../harness/chatHarness').routeHolder;
    route.params = { conversationId: second };
    await h.rtl.act(async () => {
      h.view!.rerender(h.React.createElement(require('../../../src/screens/ChatScreen').ChatScreen, {}));
    });
    await h.rtl.waitFor(() => expect(h.useChatStore.getState().activeConversationId).toBe(second), TIMEOUT);
    await h.rtl.waitFor(() => expect(h.view!.getByText('Second reply.')).toBeTruthy(), TIMEOUT);

    layoutList(h, 2400);
    expect(native.offset).toBe(2400 - LIST_HEIGHT);
  });
});

describe('the list while you read and send', () => {
  it('brings your own message into view when you had scrolled up', async () => {
    const h = await setup();
    await chatWithTurn(h, '[test] Count to five.', '1 2 3 4 5');
    layoutList(h, CONTENT_HEIGHT);
    readerScrollsUp(h);

    scrollToEnd.mockClear();
    scrollTo.mockClear();
    native.offset = -1;
    await h.send('[test] And to ten?', { text: '6 7 8 9 10' });
    await h.rtl.waitFor(() => expect(scrollToEnd).toHaveBeenCalledWith({ animated: true }), TIMEOUT);
  });

  it('does not pull you down while you read earlier messages and a reply streams', async () => {
    const h = await setup();
    await chatWithTurn(h, '[test] Count to five.', '1 2 3 4 5');
    layoutList(h, CONTENT_HEIGHT);
    h.boundary.llama!.scriptCompletion({ text: 'Six seven eight nine ten', pauseAfter: 'Six seven' });
    await h.tapSend('[test] And to ten?');
    await h.rtl.waitFor(() => expect(h.view!.getByText(/Six seven/)).toBeTruthy(), TIMEOUT);
    await h.settle(200);

    readerScrollsUp(h);
    scrollToEnd.mockClear();
    scrollTo.mockClear();
    // The reply keeps growing while the reader is up in the earlier messages.
    h.rtl.fireEvent(list(h), 'contentSizeChange', 440, CONTENT_HEIGHT + 120);
    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => expect(h.view!.getByText(/nine ten/)).toBeTruthy(), TIMEOUT);
    h.rtl.fireEvent(list(h), 'contentSizeChange', 440, CONTENT_HEIGHT + 240);
    await h.settle(300);

    expect(scrollToEnd).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
