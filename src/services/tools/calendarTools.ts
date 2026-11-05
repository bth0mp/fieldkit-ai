/**
 * The calendar tools. read_calendar_events reads the events in a range on this phone and answers with one
 * line per event: "title, start-end, location", in the device's local time. create_calendar_event opens the
 * Calendar app's own form, filled in; the user saves or cancels it there, so nothing is saved by the app.
 */
import { calendarService, MAX_EVENTS } from '../calendar/calendarService';
import { formatEventTime, parseIsoTime } from '../../utils/calendarTime';
import type { ToolCall } from './types';

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();
const optionalText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

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

/** The new event's times in epoch ms, or what is wrong with them (checked before the approval card too). */
export function eventTimes(args: Record<string, unknown>): { beginMs: number; endMs: number } | { problem: string } {
  const beginMs = parseIsoTime(args.start);
  const endMs = parseIsoTime(args.end);
  if (beginMs == null || endMs == null) return { problem: 'start and end must be ISO 8601 times, for example 2026-11-06T14:00' };
  if (endMs < beginMs) return { problem: 'end must not be before start' };
  return { beginMs, endMs };
}

export async function createCalendarEvent(call: ToolCall): Promise<string> {
  const args = call.arguments;
  const title = optionalText(args.title);
  if (!title) throw new Error('Missing required parameter: title');
  const times = eventTimes(args);
  if ('problem' in times) throw new Error(times.problem);
  await calendarService.openNewEventForm({
    title,
    ...times,
    location: optionalText(args.location),
    notes: optionalText(args.notes),
    allDay: args.all_day === true || args.all_day === 'true',
  });
  return 'Opened in Calendar. The user saves or cancels it there.';
}
