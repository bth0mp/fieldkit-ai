/**
 * Preparing calendar events, and calendar data inside the tool loop (UI integration, heavy entry point).
 * create_calendar_event waits on an approval card and then opens the Calendar app's own form, where the user
 * saves or cancels it. Once a chat has read the calendar it is private: a web search or page read from it
 * needs the user's approval, an engine that cannot wait for approval is no longer offered them, and a remote
 * model never gets the calendar, not even by naming the tool.
 *
 * Real ChatScreen + ToolsScreen + tool loop + approval card + calendar service; only the native llama and
 * LiteRT leaves, the remote server's HTTP stream, the FieldkitCalendar module and the Android permission
 * prompt are faked (nativeBoundary, remoteHarness).
 *
 * Times are built from local date parts, so the expected text holds in any host time zone.
 */
import { setupChatScreen } from '../../harness/chatHarness';
import { installRemoteModel, installRemoteStream } from '../../harness/remoteHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

const toolCallText = (name: string, args: Record<string, unknown>) => `<tool_call>${JSON.stringify({ name, arguments: args })}</tool_call>`;
/** A card ignores taps for a moment after it is shown; the tests wait this long before they tap it. */
const CARD_READ_MS = 550;
/** Friday 6 November 2026, local time. */
const FRIDAY = { start: '2026-11-06T00:00:00', end: '2026-11-07T00:00:00' };
const DENTIST = { title: 'Dentist', begin: new Date(2026, 10, 6, 14, 0).getTime(), end: new Date(2026, 10, 6, 14, 30).getTime(), location: 'Clinic' };

// A remote model that calls read_calendar_events by name although it was never offered, then answers.
const READ_BY_NAME_SSE =
  'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n' +
  `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c0","function":{"name":"read_calendar_events","arguments":${JSON.stringify(JSON.stringify(FRIDAY))}}}]}}]}\n\n` +
  'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n' +
  'data: [DONE]\n\n';
const REPLY_SSE =
  'data: {"choices":[{"delta":{"content":"I cannot see your calendar from here."}}]}\n\n' +
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
  'data: [DONE]\n\n';

type Harness = Awaited<ReturnType<typeof setupChatScreen>>;

const enabledTools = (h: Harness): string[] => h.useAppStore.getState().settings.enabledTools;

/** Switch a tool on from the Tools screen and wait for it to stick (the calendar read asks for access first). */
async function enableTool(h: Harness, toolId: string) {
  h.enableToolViaUI(toolId);
  await h.rtl.waitFor(() => { expect(enabledTools(h)).toContain(toolId); });
}

/** Script the next completion once `after` completions have started (the fake holds one sticky script). */
async function scriptNextCompletion(h: Harness, after: number, text: string) {
  await h.rtl.waitFor(() => { expect(h.boundary.llama!.calls.completion.length).toBeGreaterThan(after); });
  h.boundary.llama!.scriptCompletion({ text });
}

async function expectToolResultShows(h: Harness, toolName: string, text: RegExp) {
  h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getAllByTestId(`tool-result-label-${toolName}`).at(-1)!));
  await h.rtl.waitFor(() => { expect(h.view!.getByText(text)).toBeTruthy(); });
}

const isPrivate = (h: Harness): boolean =>
  h.useChatStore.getState().conversations.find((c: { id: string }) => c.id === h.conversationId)?.containsPrivateData === true;

/** Names of the tools in a LiteRT resetConversation call (its fifth argument is the tools JSON). */
function liteRTToolNames(args: unknown[]): string[] {
  const tools = JSON.parse((args[4] as string) || '[]') as Array<{ function?: { name?: string }; name?: string }>;
  return tools.map(t => t.function?.name ?? t.name ?? '');
}

// Rendered chat suites take seconds per test; the first one also pays the first render.
jest.setTimeout(40000);

describe('calendar events and private data in the tool loop', () => {
  it('create opens the calendar form after approval', async () => {
    const h = await setupChatScreen({ engine: 'llama', calendar: {} });
    await enableTool(h, 'create_calendar_event');
    h.render();
    const event = { title: 'Dentist', start: '2026-11-06T14:00:00', end: '2026-11-06T14:30:00', location: 'Clinic' };
    await h.send('book the dentist', { text: `Booking. ${toolCallText('create_calendar_event', event)}` });
    const card = await h.rtl.waitFor(() => h.view!.getByTestId('approval-card'));
    expect(h.rtl.within(card).getByText('New event')).toBeTruthy();
    const lines = h.rtl.within(card).getByText(/^Dentist/);
    expect(String(lines.props.children).split('\n')).toEqual(['Dentist', 'Fri 6 Nov 14:00-14:30', 'Clinic']);
    expect(h.boundary.calendar!.calls.openInsertForm).toHaveLength(0); // nothing opens before the tap

    h.boundary.llama!.scriptCompletion({ text: 'The event is ready in your calendar.' });
    await h.settle(CARD_READ_MS);
    h.rtl.fireEvent.press(h.view!.getByTestId('approval-approve'));
    await h.rtl.waitFor(() => { expect(h.boundary.calendar!.calls.openInsertForm).toHaveLength(1); });
    expect(h.boundary.calendar!.calls.openInsertForm[0][0]).toEqual(expect.objectContaining({
      title: 'Dentist', beginMs: DENTIST.begin, endMs: DENTIST.end, location: 'Clinic',
    }));
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/The event is ready in your calendar\./)).not.toBeNull(); }, { timeout: 4000 });
    await expectToolResultShows(h, 'create_calendar_event', /Opened in Calendar\. The user saves or cancels it there\./);
  });

  it('an event that ends before it starts never reaches the card', async () => {
    const h = await setupChatScreen({ engine: 'llama', calendar: {} });
    await enableTool(h, 'create_calendar_event');
    h.render();
    const completions = h.boundary.llama!.calls.completion.length;
    const event = { title: 'Dentist', start: '2026-11-06T14:30:00', end: '2026-11-06T14:00:00' };
    await h.send('book the dentist', { text: toolCallText('create_calendar_event', event) });
    await scriptNextCompletion(h, completions, 'That time does not work.');
    await h.rtl.waitFor(() => { expect(h.view!.queryByText('That time does not work.')).not.toBeNull(); }, { timeout: 5000 });
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
    await expectToolResultShows(h, 'create_calendar_event', /end must not be before start/);
    expect(h.boundary.calendar!.calls.openInsertForm).toHaveLength(0);
  });

  it('network tools need approval after a private read', async () => {
    const h = await setupChatScreen({ engine: 'llama', calendar: { permission: 'granted', events: [DENTIST] } });
    await enableTool(h, 'read_calendar_events'); // web_search is on by default
    h.render();
    await h.send('what is on friday, and search it', {
      text: `${toolCallText('read_calendar_events', FRIDAY)}${toolCallText('web_search', { query: 'Dentist Thursday' })}`,
    });
    const card = await h.rtl.waitFor(() => h.view!.getByTestId('approval-card'));
    expect(isPrivate(h)).toBe(true);
    expect(h.rtl.within(card).getByText('Web search')).toBeTruthy();
    expect(h.rtl.within(card).getByText('Query: Dentist Thursday')).toBeTruthy();

    h.boundary.llama!.scriptCompletion({ text: 'I left the search alone.' });
    await h.settle(CARD_READ_MS);
    h.rtl.fireEvent.press(h.view!.getByTestId('approval-decline'));
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/I left the search alone\./)).not.toBeNull(); }, { timeout: 4000 });
    await expectToolResultShows(h, 'web_search', /The user declined this action/);
  });

  it('a query too long to show whole never reaches the card', async () => {
    const h = await setupChatScreen({ engine: 'llama', calendar: { permission: 'granted', events: [DENTIST] } });
    await enableTool(h, 'read_calendar_events'); // web_search is on by default
    h.render();
    const completions = h.boundary.llama!.calls.completion.length;
    await h.send('what is on friday, and search it', {
      text: `${toolCallText('read_calendar_events', FRIDAY)}${toolCallText('web_search', { query: 'Dentist '.repeat(75) })}`,
    });
    await scriptNextCompletion(h, completions, 'The search was too long.');
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/The search was too long\./)).not.toBeNull(); }, { timeout: 5000 });
    expect(isPrivate(h)).toBe(true);
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
    await expectToolResultShows(h, 'web_search', /The query is too long to show for approval \(500 characters at most\)/);
  });

  it('remote call by name is refused', async () => {
    const h = await setupChatScreen({ engine: 'llama', platform: 'android', calendar: { permission: 'granted', events: [DENTIST] } });
    await installRemoteModel({ name: 'LM Studio', caps: { supportsThinking: false, supportsToolCalling: true } });
    installRemoteStream([READ_BY_NAME_SSE, REPLY_SSE]);
    const sendSpy = jest.spyOn((global as unknown as { XMLHttpRequest: { prototype: { send: () => void } } }).XMLHttpRequest.prototype, 'send');
    await enableTool(h, 'read_calendar_events');
    h.enableToolViaUI('calculator');
    h.render();

    await h.tapSend('what is on friday');
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/I cannot see your calendar from here\./)).not.toBeNull(); }, { timeout: 6000 });
    expect(h.boundary.calendar!.calls.queryInstances).toHaveLength(0);
    // The remote model was never offered the tool, and nothing it was sent afterwards carries the event.
    const bodies = sendSpy.mock.calls.map(args => String((args as unknown[])[0] ?? ''));
    expect(bodies).toHaveLength(2);
    const offered = (JSON.parse(bodies[0]).tools ?? []).map((t: { function: { name: string } }) => t.function.name);
    expect(offered).toContain('calculator');
    expect(offered).not.toContain('read_calendar_events');
    expect(bodies[1]).not.toContain('Dentist');
    expect(isPrivate(h)).toBe(false);
    await expectToolResultShows(h, 'read_calendar_events', /Not available while a remote model is active\./);
  });

  it('litert private read withholds network tools', async () => {
    const h = await setupChatScreen({ engine: 'litert', calendar: { permission: 'granted', events: [DENTIST] } });
    await enableTool(h, 'read_calendar_events');
    h.render();
    await h.send('what is on friday', { toolCalls: [{ name: 'read_calendar_events', arguments: FRIDAY }], content: 'You see the dentist at two.' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/You see the dentist at two\./)).not.toBeNull(); }, { timeout: 5000 });
    expect(isPrivate(h)).toBe(true);
    const firstTurnTools = liteRTToolNames(h.boundary.litert!.calls.resetConversation.at(-1)!);
    expect(firstTurnTools).toEqual(expect.arrayContaining(['web_search', 'read_url', 'read_calendar_events']));

    const resets = h.boundary.litert!.calls.resetConversation.length;
    await h.send('search for it', { toolCalls: [{ name: 'web_search', arguments: { query: 'Dentist Thursday' } }], content: 'I cannot search from this chat.' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/I cannot search from this chat\./)).not.toBeNull(); }, { timeout: 5000 });
    expect(h.boundary.litert!.calls.resetConversation.length).toBeGreaterThan(resets);
    const secondTurnTools = liteRTToolNames(h.boundary.litert!.calls.resetConversation.at(-1)!);
    expect(secondTurnTools).toContain('read_calendar_events');
    expect(secondTurnTools).not.toContain('web_search');
    expect(secondTurnTools).not.toContain('read_url');
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
    await expectToolResultShows(h, 'web_search', /This tool is not available right now\./);
  });

  it('litert read then search in one turn: the search is not available', async () => {
    const h = await setupChatScreen({ engine: 'litert', calendar: { permission: 'granted', events: [DENTIST] } });
    await enableTool(h, 'read_calendar_events');
    h.render();
    const calls = [{ name: 'read_calendar_events', arguments: FRIDAY }, { name: 'web_search', arguments: { query: 'Dentist Thursday' } }];
    await h.send('what is on friday, then search it', { toolCalls: calls, content: 'You see the dentist at two.' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/You see the dentist at two\./)).not.toBeNull(); }, { timeout: 5000 });
    expect(isPrivate(h)).toBe(true);
    expect(h.view!.queryByTestId('approval-card')).toBeNull();
    await expectToolResultShows(h, 'web_search', /This tool is not available right now\./);
  });
});
