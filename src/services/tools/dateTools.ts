import { ToolCall } from './types';

/**
 * date_math: the calendar sums a small model gets wrong. Days between two dates, the date so many days on or
 * back, and the day of the week. Whole calendar days only: no clock times and no time zones, so a day is a day.
 */
const DAY_MS = 86400000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FIRST_YEAR = 1900;
const LAST_YEAR = 2100;

const isBlank = (raw: unknown) => raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
const iso = (at: number) => new Date(at).toISOString().slice(0, 10);
const weekday = (at: number) => WEEKDAYS[new Date(at).getUTCDay()];
const label = (at: number) => `${iso(at)} (${weekday(at)})`;
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function inRange(at: number): number {
  const year = new Date(at).getUTCFullYear();
  if (year < FIRST_YEAR || year > LAST_YEAR) throw new Error(`Dates must be between ${FIRST_YEAR} and ${LAST_YEAR}.`);
  return at;
}

/** A calendar date as the instant of its UTC midnight, which makes day arithmetic exact. */
function readDate(raw: unknown, name: 'start' | 'end'): number {
  const match = typeof raw === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim()) : null;
  const [year, month, day] = match ? match.slice(1).map(Number) : [0, 0, 0];
  // Date.UTC reads years 0 to 99 as 1900 to 1999, so the year is checked as written.
  if (match && (year < FIRST_YEAR || year > LAST_YEAR)) throw new Error(`Dates must be between ${FIRST_YEAR} and ${LAST_YEAR}.`);
  const at = Date.UTC(year, month - 1, day);
  if (!match || new Date(at).getUTCMonth() !== month - 1 || new Date(at).getUTCDate() !== day) {
    throw new Error(`${name} must be a date written YYYY-MM-DD`);
  }
  return at;
}

function readDays(raw: unknown): number {
  const text = typeof raw === 'string' ? raw.trim() : '';
  const days = typeof raw === 'number' ? raw : Number(/^[+-]?\d+$/.test(text) ? text : Number.NaN);
  if (!Number.isInteger(days)) throw new Error('add_days must be a whole number of days, for example 45 or -7');
  return days;
}

/** "37 days" and, from a week up, " (5 weeks and 2 days)". */
function span(days: number): { days: string; weeks: string } {
  const weeks = Math.floor(days / 7);
  const rest = days % 7;
  const tail = rest === 0 ? '' : ` and ${count(rest, 'day')}`;
  return { days: count(days, 'day'), weeks: weeks === 0 ? '' : ` (${count(weeks, 'week')}${tail})` };
}

function between(start: number, end: number): string {
  const gap = span(Math.abs(Math.round((end - start) / DAY_MS)));
  if (end < start) return `From ${label(start)} back to ${label(end)}: ${gap.days} earlier${gap.weeks}.`;
  return `From ${label(start)} to ${label(end)}: ${gap.days}${gap.weeks}.`;
}

function shifted(start: number, days: number): string {
  if (days === 0) return `${iso(start)} is a ${weekday(start)}.`;
  const result = inRange(start + days * DAY_MS);
  return `${count(Math.abs(days), 'day')} ${days > 0 ? 'after' : 'before'} ${label(start)} is ${label(result)}.`;
}

export function dateMath(call: ToolCall, now: Date = new Date()): string {
  const { start: rawStart, end, add_days: addDays } = call.arguments;
  const hasEnd = !isBlank(end);
  const hasDays = !isBlank(addDays);
  if (hasEnd === hasDays) {
    const how = 'Give either end (to count the days between two dates) or add_days';
    throw new Error(hasEnd ? `${how}, not both.` : `${how} (to find a date some days away).`);
  }
  // With no start, the sum starts from today as the phone has it.
  const start = isBlank(rawStart) ? inRange(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) : readDate(rawStart, 'start');
  return hasEnd ? between(start, readDate(end, 'end')) : shifted(start, readDays(addDays));
}
