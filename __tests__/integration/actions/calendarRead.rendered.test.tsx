/**
 * Reading the device calendar (UI integration, heavy entry point): read_calendar_events is off until the
 * user switches it on, and switching it on asks for calendar access. With access, the model's read returns
 * the events in the range, one line each, read on this phone. Without access the switch stays off and says
 * why, and a read gives an error result instead of a crash. On a device without the calendar module the row
 * is disabled and the tool is never offered. The note the user reads on the row never reaches the model.
 *
 * Real ChatScreen + ToolsScreen + tool loop + calendar service; only the native llama leaf, the
 * FieldkitCalendar module and the Android permission prompt are faked (nativeBoundary).
 *
 * Times are built from local date parts, so the expected text holds in any host time zone.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

const toolCallText = (name: string, args: Record<string, unknown>) => `<tool_call>${JSON.stringify({ name, arguments: args })}</tool_call>`;
const READ_CALENDAR = 'android.permission.READ_CALENDAR';
const NOTE = 'Events are read on this phone and never sent anywhere. Hidden while a remote model is active.';
/** Friday 6 November 2026, local time. */
const FRIDAY = { start: '2026-11-06T00:00:00', end: '2026-11-07T00:00:00' };
const DENTIST = { title: 'Dentist', begin: new Date(2026, 10, 6, 14, 0).getTime(), end: new Date(2026, 10, 6, 14, 30).getTime(), location: 'Clinic' };

type Harness = Awaited<ReturnType<typeof setupChatScreen>>;

/** The real Tools screen, mounted next to the chat (the store is shared). */
function openTools(h: Harness) {
  const { ToolsScreen } = require('../../../src/screens/ToolsScreen');
  return h.rtl.render(h.React.createElement(ToolsScreen, {}));
}

/** Flip a tool's switch on the Tools screen, the way the user does, and let the permission prompt answer. */
async function flipSwitch(h: Harness, tools: ReturnType<typeof openTools>, toolId: string) {
  const { Switch } = require('react-native');
  const row = tools.getByTestId(`tool-picker-row-${toolId}`);
  await h.rtl.act(async () => { h.rtl.fireEvent(h.rtl.within(row).UNSAFE_getByType(Switch), 'valueChange', true); });
}

function switchOf(h: Harness, tools: ReturnType<typeof openTools>, toolId: string) {
  const { Switch } = require('react-native');
  return h.rtl.within(tools.getByTestId(`tool-picker-row-${toolId}`)).UNSAFE_getByType(Switch);
}

const enabledTools = (h: Harness): string[] => h.useAppStore.getState().settings.enabledTools;

/** Script the next completion once `after` completions have started (the fake holds one sticky script). */
async function scriptNextCompletion(h: Harness, after: number, text: string) {
  await h.rtl.waitFor(() => { expect(h.boundary.llama!.calls.completion.length).toBeGreaterThan(after); });
  h.boundary.llama!.scriptCompletion({ text });
}

/** The model reads Friday's events; resolves once its reply shows and the read's result is expanded. */
async function readFriday(h: Harness, reply: string) {
  const completions = h.boundary.llama!.calls.completion.length;
  await h.send('what is on friday', { text: toolCallText('read_calendar_events', FRIDAY) });
  await scriptNextCompletion(h, completions, reply);
  await h.rtl.waitFor(() => { expect(h.view!.queryByText(reply)).not.toBeNull(); }, { timeout: 5000 });
  h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByTestId('tool-result-label-read_calendar_events')));
}

/** Names of the tools a llama completion was offered. */
function offeredNames(params: unknown): string[] {
  const tools = (params as { tools?: Array<{ function?: { name?: string } }> }).tools ?? [];
  return tools.map(t => t.function?.name ?? '');
}

// Rendered chat suites take seconds per test; the first one also pays the first render.
jest.setTimeout(40000);

describe('reading the device calendar', () => {
  it('reads events after permission', async () => {
    const h = await setupChatScreen({ engine: 'llama', calendar: { permission: 'granted', events: [DENTIST] } });
    const tools = openTools(h);
    expect(enabledTools(h)).not.toContain('read_calendar_events'); // off until the user turns it on
    await flipSwitch(h, tools, 'read_calendar_events');
    await h.rtl.waitFor(() => { expect(enabledTools(h)).toContain('read_calendar_events'); });
    expect(h.boundary.calendar!.permissions.request).toHaveBeenCalledWith(READ_CALENDAR, expect.anything());
    tools.unmount();
    h.render();

    await readFriday(h, 'You see the dentist at two.');
    expect(h.boundary.calendar!.calls.queryInstances).toEqual([[new Date(2026, 10, 6).getTime(), new Date(2026, 10, 7).getTime(), 50]]);
    await h.rtl.waitFor(() => { expect(h.view!.getByText(/Dentist, Fri 6 Nov 14:00-14:30, Clinic/)).toBeTruthy(); });
  });

  it('permission denied', async () => {
    const h = await setupChatScreen({ engine: 'llama', calendar: { permission: 'denied', events: [DENTIST] } });
    const tools = openTools(h);
    await flipSwitch(h, tools, 'read_calendar_events');
    await h.rtl.waitFor(() => { expect(tools.getByText('Calendar access was not allowed')).toBeTruthy(); });
    expect(enabledTools(h)).not.toContain('read_calendar_events');
    expect(switchOf(h, tools, 'read_calendar_events').props.value).toBe(false);
    tools.unmount();
    h.render();

    // The model asks anyway: the read gives an error result, the turn goes on, and nothing was read.
    await readFriday(h, 'I cannot see your calendar.');
    await h.rtl.waitFor(() => { expect(h.view!.getByText(/This tool is not available right now\./)).toBeTruthy(); });
    expect(h.boundary.calendar!.calls.queryInstances).toHaveLength(0);
  });

  it('a quick second tap that is allowed clears the denial', async () => {
    const h = await setupChatScreen({ engine: 'llama', calendar: { permission: ['denied', 'granted'] } });
    const tools = openTools(h);
    const { Switch } = require('react-native');
    const toggle = h.rtl.within(tools.getByTestId('tool-picker-row-read_calendar_events')).UNSAFE_getByType(Switch);
    // Two taps before the first prompt is answered: the user says no to the first and yes to the second.
    await h.rtl.act(async () => {
      h.rtl.fireEvent(toggle, 'valueChange', true);
      h.rtl.fireEvent(toggle, 'valueChange', true);
    });
    await h.rtl.waitFor(() => { expect(enabledTools(h)).toContain('read_calendar_events'); });
    expect(switchOf(h, tools, 'read_calendar_events').props.value).toBe(true);
    expect(tools.queryByText('Calendar access was not allowed')).toBeNull();
  });

  it('a read after calendar access was taken away gives an error result', async () => {
    const h = await setupChatScreen({ engine: 'llama', calendar: { permission: 'granted', events: [DENTIST] } });
    const tools = openTools(h);
    await flipSwitch(h, tools, 'read_calendar_events');
    await h.rtl.waitFor(() => { expect(enabledTools(h)).toContain('read_calendar_events'); });
    tools.unmount();
    h.boundary.calendar!.setPermission('denied'); // revoked in Android settings while the tool is on
    h.render();

    await readFriday(h, 'I could not read your calendar.');
    await h.rtl.waitFor(() => { expect(h.view!.getByText(/Calendar access is not allowed\./)).toBeTruthy(); });
    expect(h.view!.queryByText(/Dentist/)).toBeNull();
  });

  it('a range the tool cannot read is refused before the calendar is asked', async () => {
    const h = await setupChatScreen({ engine: 'llama', calendar: { permission: 'granted', events: [DENTIST] } });
    const tools = openTools(h);
    await flipSwitch(h, tools, 'read_calendar_events');
    await h.rtl.waitFor(() => { expect(enabledTools(h)).toContain('read_calendar_events'); });
    tools.unmount();
    h.render();

    const completions = h.boundary.llama!.calls.completion.length;
    await h.send('what is on this year', { text: toolCallText('read_calendar_events', { start: '2026-01-01', end: '2026-12-31' }) });
    await scriptNextCompletion(h, completions, 'That range is too long.');
    await h.rtl.waitFor(() => { expect(h.view!.queryByText('That range is too long.')).not.toBeNull(); }, { timeout: 5000 });
    h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByTestId('tool-result-label-read_calendar_events')));
    await h.rtl.waitFor(() => { expect(h.view!.getByText(/The range can be at most 31 days\./)).toBeTruthy(); });
    expect(h.boundary.calendar!.calls.queryInstances).toHaveLength(0);
  });

  it('unavailable without the module', async () => {
    const h = await setupChatScreen({ engine: 'llama' }); // a device without the calendar module
    const tools = openTools(h);
    const row = tools.getByTestId('tool-picker-row-read_calendar_events');
    expect(h.rtl.within(row).getByText('Not available on this device')).toBeTruthy();
    expect(switchOf(h, tools, 'read_calendar_events').props.disabled).toBe(true);
    await flipSwitch(h, tools, 'read_calendar_events');
    expect(enabledTools(h)).not.toContain('read_calendar_events');
    tools.unmount();

    // Settings restored from a device that had the module still name the tool: it is never offered there.
    const AsyncStorage = require('@react-native-async-storage/async-storage').default
      ?? require('@react-native-async-storage/async-storage');
    const raw = await AsyncStorage.getItem('local-llm-app-storage');
    const saved = raw ? JSON.parse(raw) : { state: {}, version: 0 };
    const settings = h.useAppStore.getState().settings;
    saved.state.settings = { ...settings, enabledTools: [...settings.enabledTools, 'calculator', 'read_calendar_events'] };
    await AsyncStorage.setItem('local-llm-app-storage', JSON.stringify(saved));
    await h.useAppStore.persist.rehydrate();
    expect(enabledTools(h)).toContain('read_calendar_events');
    h.render();

    await readFriday(h, 'There is no calendar here.');
    const firstRequest = h.boundary.llama!.calls.completion.find(([params]) => offeredNames(params).length > 0)!;
    expect(offeredNames(firstRequest[0])).toContain('calculator');
    expect(offeredNames(firstRequest[0])).not.toContain('read_calendar_events');
    await h.rtl.waitFor(() => { expect(h.view!.getByText(/This tool is not available right now\./)).toBeTruthy(); });
  });

  it('note is not sent to the model', async () => {
    const h = await setupChatScreen({ engine: 'llama', calendar: { permission: 'granted', events: [DENTIST] } });
    const tools = openTools(h);
    expect(h.rtl.within(tools.getByTestId('tool-picker-row-read_calendar_events')).getByText(NOTE)).toBeTruthy();
    await flipSwitch(h, tools, 'read_calendar_events');
    await h.rtl.waitFor(() => { expect(enabledTools(h)).toContain('read_calendar_events'); });
    tools.unmount();
    h.render();

    await h.send('hello', { text: 'Hi there.' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Hi there\./)).not.toBeNull(); }, { timeout: 5000 });
    const request = h.boundary.llama!.calls.completion.at(-1)![0];
    expect(offeredNames(request)).toContain('read_calendar_events');
    expect(JSON.stringify(request)).not.toContain('never sent anywhere');
    // The text hint (for models without native tool calling) names the tool without the note too.
    const { buildToolSystemPromptHint } = require('../../../src/services/tools');
    const hint: string = buildToolSystemPromptHint(['read_calendar_events']);
    expect(hint).toContain('read_calendar_events');
    expect(hint).not.toContain('never sent anywhere');
  });
});
