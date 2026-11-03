/**
 * An email draft the app cannot open never raises an approval card (UI integration, heavy entry point):
 * a draft_email call without a subject or a body, or with more recipients than one mailto link can carry,
 * ends at once with a result that names the problem, so the model can fix the call. The user is not asked
 * to approve a blank draft, and nothing opens.
 *
 * Real ChatScreen + real tool loop + real approval service; only the native llama leaf and the OS Linking
 * module are faked (nativeBoundary).
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

/** llama chat with draft_email on; the model's draft_email call is refused, the model replies, and the
 *  tool result bubble is opened. Resolves once the user can read the result. */
async function refusedDraft(args: Record<string, unknown>, reply: string): Promise<Harness> {
  const h = await setupChatScreen({ engine: 'llama' });
  h.enableToolViaUI('draft_email'); h.render();
  const completions = h.boundary.llama!.calls.completion.length;
  await h.send('email bob', { text: `Drafting. ${toolCallText('draft_email', args)}` });
  await h.rtl.waitFor(() => { expect(h.boundary.llama!.calls.completion.length).toBeGreaterThan(completions); });
  h.boundary.llama!.scriptCompletion({ text: reply }); // the follow-up after the refused call
  await h.rtl.waitFor(() => { expect(h.view!.queryByText(reply)).not.toBeNull(); }, { timeout: 4000 });
  expect(h.view!.queryByTestId('approval-card')).toBeNull();
  expect(h.boundary.linking.openURL).not.toHaveBeenCalled();
  h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByTestId('tool-result-label-draft_email')));
  return h;
}

describe('draft_email calls that cannot become a draft', () => {
  it('an empty body shows no card and names the missing body', async () => {
    const h = await refusedDraft({ to: 'bob@example.com', subject: 'Hi', body: '' }, 'I need the message text.');
    await h.rtl.waitFor(() => { expect(h.view!.getByText(/Missing required parameter: body\./)).toBeTruthy(); });
  });

  it('a call with no arguments names the subject and the body', async () => {
    const h = await refusedDraft({}, 'What should the email say?');
    await h.rtl.waitFor(() => { expect(h.view!.getByText(/Missing required parameters: subject, body\./)).toBeTruthy(); });
  });

  it('a blank subject counts as missing', async () => {
    const h = await refusedDraft({ subject: '   ', body: 'Hello' }, 'What is the subject?');
    await h.rtl.waitFor(() => { expect(h.view!.getByText(/Missing required parameter: subject\./)).toBeTruthy(); });
  });

  it('more recipients than one draft can carry are refused, not dropped', async () => {
    const to = Array.from({ length: 80 }, (_, i) => `person${i}@example.com`).join(',');
    const h = await refusedDraft({ to, subject: 'Hi', body: 'Hello' }, 'That is too many people for one draft.');
    await h.rtl.waitFor(() => { expect(h.view!.getByText(/Too many recipients for one draft\./)).toBeTruthy(); });
  });
});
