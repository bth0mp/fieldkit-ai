/**
 * Approval before a tool that sends (UI integration, heavy entry point): with draft_email enabled, the
 * model's tool call waits on an approval card in the chat. Approve opens the mail app with the draft;
 * Decline runs nothing and tells the model the user declined.
 *
 * Real ChatScreen + real tool loop + real approval service and card; only the native llama leaf and the
 * OS Linking module are faked (nativeBoundary).
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

const toolCallText = (name: string, args: Record<string, unknown>) => `<tool_call>${JSON.stringify({ name, arguments: args })}</tool_call>`;

describe('draft_email waits for the user on an approval card', () => {
  it('approve opens the mail app with the draft', async () => {
    const h = await setupChatScreen({ engine: 'llama' });
    h.enableToolViaUI('draft_email'); h.render();
    await h.send('email bob', { text: `Drafting. ${toolCallText('draft_email', { to: 'bob@example.com', subject: 'Hi & bye', body: 'Line one\nLine two' })}` });
    await h.rtl.waitFor(() => h.view!.getByTestId('approval-card'));
    expect(h.view!.getByText(/Subject: Hi & bye/)).toBeTruthy();
    h.boundary.llama!.scriptCompletion({ text: 'I opened a draft in your mail app.' }); // re-script before approving: scripts are sticky
    h.rtl.fireEvent.press(h.view!.getByTestId('approval-approve'));
    await h.rtl.waitFor(() => expect(h.boundary.linking.openURL).toHaveBeenCalledWith(
      'mailto:bob@example.com?subject=Hi%20%26%20bye&body=Line%20one%0D%0ALine%20two'));
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/I opened a draft in your mail app\./)).not.toBeNull(); }, { timeout: 4000 });
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
  });

  it('decline does nothing and tells the model', async () => {
    const h = await setupChatScreen({ engine: 'llama' });
    h.enableToolViaUI('draft_email'); h.render();
    await h.send('email bob', { text: `Drafting. ${toolCallText('draft_email', { to: 'bob@example.com', subject: 'Hi', body: 'Hello' })}` });
    await h.rtl.waitFor(() => h.view!.getByTestId('approval-card'));
    h.boundary.llama!.scriptCompletion({ text: 'Okay, I left it alone.' });
    h.rtl.fireEvent.press(h.view!.getByTestId('approval-decline'));
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Okay, I left it alone\./)).not.toBeNull(); }, { timeout: 4000 });
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
    expect(h.boundary.linking.openURL).not.toHaveBeenCalled();
    h.rtl.fireEvent.press(h.view!.getByTestId('tool-result-label-draft_email'));
    await h.rtl.waitFor(() => { expect(h.view!.getByText(/The user declined this action/)).toBeTruthy(); });
  });

  it('encodes the draft', async () => {
    const h = await setupChatScreen({ engine: 'llama' });
    h.enableToolViaUI('draft_email'); h.render();
    await h.send('email bob', { text: `Drafting. ${toolCallText('draft_email', { to: 'bob@example.com', subject: 'Notes', body: 'A\nB & C + D # E = F Café' })}` });
    await h.rtl.waitFor(() => h.view!.getByTestId('approval-card'));
    h.boundary.llama!.scriptCompletion({ text: 'Draft opened.' });
    h.rtl.fireEvent.press(h.view!.getByTestId('approval-approve'));
    await h.rtl.waitFor(() => expect(h.boundary.linking.openURL).toHaveBeenCalledTimes(1));
    const url: string = h.boundary.linking.openURL.mock.calls[0][0];
    expect(url.slice(url.indexOf('body='))).toBe('body=A%0D%0AB%20%26%20C%20%2B%20D%20%23%20E%20%3D%20F%20Caf%C3%A9');
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Draft opened\./)).not.toBeNull(); }, { timeout: 4000 });
  });
});
