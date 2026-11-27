/**
 * The device calendar, reached through the FieldkitCalendar native module (Android). Events are read from
 * the calendar on this phone; a new event goes to the Calendar app's own form, where the user saves or
 * cancels it, so the app never writes to the calendar itself. Where the module is absent (iOS, or a build
 * without it) isPresent() is false, so callers never branch on the platform.
 *
 * Every failure is an Error whose message the model can act on (no trailing period: the tool result adds it).
 */
import { NativeModules, PermissionsAndroid } from 'react-native';
import { parseIsoTime } from '../../utils/calendarTime';
import { appLockService } from '../appLockService';

/** One occurrence of an event, with exactly the keys the native module returns. Times are epoch ms. */
export interface CalendarEvent {
  id: string;
  title: string;
  begin: number;
  end: number;
  allDay: boolean;
  location: string | null;
  calendarName: string | null;
}

/** The fields handed to the Calendar app's form. Times are epoch ms. */
export interface NewCalendarEvent {
  title: string;
  beginMs: number;
  endMs: number;
  location?: string;
  notes?: string;
  allDay?: boolean;
}

interface FieldkitCalendarNative {
  queryInstances(beginMs: number, endMs: number, limit: number): Promise<CalendarEvent[]>;
  openInsertForm(event: NewCalendarEvent): Promise<boolean>;
}

/** The most events one read returns (the native module clamps to the same number). */
export const MAX_EVENTS = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
/** At most 31 days, plus the hour a daylight-saving change can add to a calendar month. */
const MAX_RANGE_MS = 31 * DAY_MS + 60 * 60 * 1000;

const NOT_PRESENT = 'The calendar is not available on this device';
/** The native rejection codes, as text for the model. */
const NATIVE_ERRORS: Record<string, string> = {
  PERMISSION: 'Calendar access is not allowed',
  INVALID_RANGE: 'The time range is not valid',
  QUERY_ERROR: 'The calendar could not be read',
  INVALID_EVENT: 'The event needs a title, a start and an end',
  NO_CALENDAR_APP: 'No calendar app is available on this device',
  OPEN_FAILED: 'The calendar could not be opened',
};

// Read at call time, not at import: the module may be installed after this file loads (tests do that).
const nativeModule = (): FieldkitCalendarNative | undefined => NativeModules.FieldkitCalendar;

/** The native rejection as an error the model can read. */
function calendarError(error: unknown, fallback: string): Error {
  const code = (error as { code?: unknown } | null)?.code;
  return new Error((typeof code === 'string' && NATIVE_ERRORS[code]) || fallback);
}

export const calendarService = {
  isPresent: (): boolean => nativeModule() != null,

  /** Ask for READ_CALENDAR unless it is already granted. True when the app may read the calendar. */
  async ensureReadPermission(): Promise<boolean> {
    if (!nativeModule()) return false;
    const permission = PermissionsAndroid.PERMISSIONS.READ_CALENDAR;
    try {
      if (await PermissionsAndroid.check(permission)) return true;
      appLockService.openingSystemScreen();
      const answer = await PermissionsAndroid.request(permission, {
        title: 'Calendar access',
        message: 'Lets the assistant read your calendar events on this phone. They are never sent anywhere.',
        buttonPositive: 'OK',
      });
      return answer === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    } finally {
      appLockService.systemScreenClosed();
    }
  },

  /**
   * The events that overlap the range, in start order, at most MAX_EVENTS. The range is two ISO 8601 times,
   * the end after the start, at most 31 days apart; a range that breaks these rules never reaches the calendar.
   */
  async readEvents(range: { startIso: string; endIso: string }): Promise<CalendarEvent[]> {
    const native = nativeModule();
    if (!native) throw new Error(NOT_PRESENT);
    const begin = parseIsoTime(range.startIso);
    const end = parseIsoTime(range.endIso);
    if (begin == null || end == null) throw new Error('start and end must be ISO 8601 times, for example 2026-11-06T09:00');
    if (end <= begin) throw new Error('end must be after start');
    if (end - begin > MAX_RANGE_MS) throw new Error('The range can be at most 31 days');
    try {
      return await native.queryInstances(begin, end, MAX_EVENTS);
    } catch (error) {
      throw calendarError(error, NATIVE_ERRORS.QUERY_ERROR);
    }
  },

  /** Open the Calendar app's form for a new event, filled in. The user saves or cancels it there. */
  async openNewEventForm(event: NewCalendarEvent): Promise<void> {
    const native = nativeModule();
    if (!native) throw new Error(NOT_PRESENT);
    try {
      appLockService.openingSystemScreen();
      await native.openInsertForm(event);
    } catch (error) {
      throw calendarError(error, NATIVE_ERRORS.OPEN_FAILED);
    }
  },
};
