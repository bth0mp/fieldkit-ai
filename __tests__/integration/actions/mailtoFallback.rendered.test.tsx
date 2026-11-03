/**
 * Email draft fallbacks (UI integration, heavy entry point): when no mail app opens the draft, the user
 * still gets it (copied, with the share sheet open); a draft too long for a mailto link opens shortened,
 * with the full body on the clipboard. The expanded tool result tells the model which happened.
 *
 * Real ChatScreen + real tool loop + real approval service and card; only the native llama leaf and the
 * OS Linking, Clipboard and Share modules are faked (nativeBoundary).
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

const toolCallText = (name: string, args: Record<string, unknown>) => `<tool_call>${JSON.stringify({ name, arguments: args })}</tool_call>`;

type Harness = Awaited<ReturnType<typeof setupChatScreen>>;

/** llama chat with draft_email on and a draft_email call waiting on its card; approving it is up to the test. */
async function chatWithDraft(args: Record<string, unknown>, beforeSend?: (h: Harness) => void): Promise<Harness> {
  const h = await setupChatScreen({ engine: 'llama' });
  h.enableToolViaUI('draft_email'); h.render();
  beforeSend?.(h);
  await h.send('email bob', { text: `Drafting. ${toolCallText('draft_email', args)}` });
  await h.rtl.waitFor(() => h.view!.getByTestId('approval-card'));
  return h;
}

/** Approve the card, wait for the model's closing reply, then open the tool result bubble. */
async function approveAndOpenResult(h: Harness, reply: string) {
  h.boundary.llama!.scriptCompletion({ text: reply }); // re-script before approving: scripts are sticky
  h.rtl.fireEvent.press(h.view!.getByTestId('approval-approve'));
  await h.rtl.waitFor(() => { expect(h.view!.queryByText(reply)).not.toBeNull(); }, { timeout: 4000 });
  h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByTestId('tool-result-label-draft_email')));
}

describe('email draft fallbacks', () => {
  it('falls back to copy and share when no mail app opens', async () => {
    const draft = { to: 'bob@example.com', subject: 'Lunch', body: 'Are you free on Friday?' };
    const h = await chatWithDraft(draft, ({ boundary }) => { boundary.linking.openURL.mockRejectedValueOnce(new Error('no activity')); });
    await approveAndOpenResult(h, 'Copied it for you.');

    expect(h.boundary.linking.openURL).toHaveBeenCalledTimes(1);
    expect(h.boundary.clipboard.setString).toHaveBeenCalledWith(draft.body);
    expect(h.boundary.share.share).toHaveBeenCalledWith({ title: draft.subject, message: draft.body }, undefined);
    await h.rtl.waitFor(() => {
      expect(h.view!.getByText('No mail app opened. The draft was copied and the share sheet was opened.')).toBeTruthy();
    });
  });

  it('opens a shortened draft and copies the full body when it is too long for a link', async () => {
    const body = `${'Paragraph of the long email. '.repeat(250)}THE END`; // ~7000 characters, one line
    const h = await chatWithDraft({ to: 'bob@example.com', subject: 'Report', body });
    await approveAndOpenResult(h, 'Opened it.');

    expect(h.boundary.linking.openURL).toHaveBeenCalledTimes(1);
    const url: string = h.boundary.linking.openURL.mock.calls[0][0];
    expect(url.length).toBeLessThan(4000);
    expect(url).not.toContain('THE%20END');
    expect(h.boundary.clipboard.setString).toHaveBeenCalledTimes(1);
    const copied: string = h.boundary.clipboard.setString.mock.calls[0][0];
    expect(copied).toHaveLength(body.length); // the whole body, not the shortened one
    expect(copied.endsWith('THE END')).toBe(true);
    expect(h.boundary.share.share).not.toHaveBeenCalled();
    await h.rtl.waitFor(() => {
      expect(h.view!.getByText(/Opened a draft in the mail app\. The user sends it from there\. The body was shortened to fit; the full text was copied to the clipboard\./)).toBeTruthy();
    });
  });

  it('copies nothing when the draft opens whole', async () => {
    const h = await chatWithDraft({ to: 'bob@example.com', subject: 'Hi', body: 'Short note' });
    await approveAndOpenResult(h, 'Done.');

    expect(h.boundary.linking.openURL).toHaveBeenCalledTimes(1);
    expect(h.boundary.clipboard.setString).not.toHaveBeenCalled();
    expect(h.boundary.share.share).not.toHaveBeenCalled();
    await h.rtl.waitFor(() => { expect(h.view!.getByText('Opened a draft in the mail app. The user sends it from there.')).toBeTruthy(); });
  });
});
