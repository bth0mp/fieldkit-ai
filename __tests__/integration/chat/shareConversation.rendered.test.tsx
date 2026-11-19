/**
 * Share a conversation: from the chat's settings sheet the user taps Share Conversation and the phone's share
 * sheet opens with the conversation as plain text: what they asked and what the assistant answered, in order.
 * The tool row in between (the calculator's working) is left out; it is not something either side said.
 *
 * Real ChatScreen, settings sheet, tool loop and share service; the share sheet itself is the device boundary.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

describe('sharing a conversation', () => {
  it('has nothing to share before anything has been said', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    h.render();
    h.rtl.fireEvent.press(h.view!.getByTestId('chat-settings-icon'));
    // The sheet is open (its first settings heading is there) and offers no share row.
    await h.rtl.waitFor(() => { expect(h.view!.queryByText('IMAGE GENERATION')).not.toBeNull(); });
    expect(h.view!.queryByText('Share Conversation')).toBeNull();
  });

  it('opens the share sheet with both sides of the conversation as plain text', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    h.enableToolViaUI('calculator');
    h.render();

    await h.send('what is 2 + 2', { toolCalls: [{ name: 'calculator', arguments: { expression: '2+2' } }], content: 'The answer is 4.' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/The answer is 4\./)).not.toBeNull(); });
    await h.send('thanks', { content: 'You are welcome.' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/You are welcome\./)).not.toBeNull(); });

    h.rtl.fireEvent.press(h.view!.getByTestId('chat-settings-icon'));
    h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByText('Share Conversation')));

    await h.rtl.waitFor(() => { expect(h.boundary.share.share).toHaveBeenCalledTimes(1); });
    const [content] = h.boundary.share.share.mock.calls[0] as [{ title?: string; message: string }];
    expect(content.message).toContain('You: what is 2 + 2\n\nAssistant: The answer is 4.\n\nYou: thanks\n\nAssistant: You are welcome.');
    // The calculator's own row ("2+2 = 4") and the call that asked for it are not part of what was said.
    expect(content.message).not.toContain('2+2 = 4');
    expect(content.message).not.toContain('calculator');
  });
});
