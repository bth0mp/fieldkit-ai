/**
 * All-day events in the user's own days, shared by one test file per time zone (calendarAllDay.*.rendered).
 * An all-day event the model asks to create is read in local days: '2026-11-06' to '2026-11-07' is Friday
 * 6 November wherever the phone is. An all-day event read from the calendar is stored as UTC midnights, so
 * its days are read in UTC: the same Friday in every zone.
 *
 * Real ChatScreen + tool loop + approval card + calendar service; only the native llama leaf, the
 * FieldkitCalendar module and the time zone are faked (nativeBoundary, timeZoneEnvironment).
 */
import { setupChatScreen } from '../../harness/chatHarness';

const toolCallText = (name: string, args: Record<string, unknown>) => `<tool_call>${JSON.stringify({ name, arguments: args })}</tool_call>`;
const FRIDAY = { start: '2026-11-06T00:00:00', end: '2026-11-07T00:00:00' };
/** As the calendar stores an all-day event: UTC midnight to the next UTC midnight. */
const HOLIDAY_STORED = { title: 'Holiday', begin: Date.UTC(2026, 10, 6), end: Date.UTC(2026, 10, 7), allDay: true };

type Harness = Awaited<ReturnType<typeof setupChatScreen>>;

async function enableTool(h: Harness, toolId: string) {
  h.enableToolViaUI(toolId);
  await h.rtl.waitFor(() => { expect(h.useAppStore.getState().settings.enabledTools).toContain(toolId); });
}

/** @param offsetMinutes what `getTimezoneOffset()` gives in this zone on 6 November 2026 (proves the zone is set). */
export function allDayCalendarCases(offsetMinutes: number) {
  it('the zone is pinned for this file', () => {
    expect(new Date(2026, 10, 6).getTimezoneOffset()).toBe(offsetMinutes);
  });

  it('the create card shows the day the model asked for', async () => {
    const h = await setupChatScreen({ engine: 'llama', calendar: {} });
    await enableTool(h, 'create_calendar_event');
    h.render();
    const event = { title: 'Holiday', start: '2026-11-06', end: '2026-11-07', all_day: true };
    await h.send('add a holiday on friday', { text: toolCallText('create_calendar_event', event) });
    const card = await h.rtl.waitFor(() => h.view!.getByTestId('approval-card'));
    const lines = h.rtl.within(card).getByText(/^Holiday/);
    expect(String(lines.props.children).split('\n')).toEqual(['Holiday', 'Fri 6 Nov, all day']);
  });

  it('a stored all-day event reads as its own day', async () => {
    const h = await setupChatScreen({ engine: 'llama', calendar: { permission: 'granted', events: [HOLIDAY_STORED] } });
    await enableTool(h, 'read_calendar_events');
    h.render();
    const completions = h.boundary.llama!.calls.completion.length;
    await h.send('what is on friday', { text: toolCallText('read_calendar_events', FRIDAY) });
    await h.rtl.waitFor(() => { expect(h.boundary.llama!.calls.completion.length).toBeGreaterThan(completions); });
    h.boundary.llama!.scriptCompletion({ text: 'Friday is a holiday.' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText('Friday is a holiday.')).not.toBeNull(); }, { timeout: 5000 });
    h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByTestId('tool-result-label-read_calendar_events')));
    await h.rtl.waitFor(() => { expect(h.view!.getByText(/Holiday, Fri 6 Nov, all day/)).toBeTruthy(); });
  });
}
