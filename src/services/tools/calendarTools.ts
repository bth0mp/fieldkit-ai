/**
 * The calendar tools. read_calendar_events reads the events in a range on this phone and answers with one
 * line per event: "title, start-end, location", in the device's local time.
 */
import { calendarService, MAX_EVENTS } from '../calendar/calendarService';
import { formatEventTime } from '../../utils/calendarTime';
import type { ToolCall } from './types';

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

export async function readCalendarEvents(call: ToolCall): Promise<string> {
  const events = await calendarService.readEvents({ startIso: call.arguments.start, endIso: call.arguments.end });
  if (events.length === 0) return 'No events in this range.';
  const lines = events.map(event => {
    const location = event.location ? `, ${oneLine(event.location)}` : '';
    return `${oneLine(event.title) || '(no title)'}, ${formatEventTime(event)}${location}`;
  });
  if (events.length >= MAX_EVENTS) lines.push(`Only the first ${MAX_EVENTS} events are shown; read a shorter range for the rest.`);
  return lines.join('\n');
}
