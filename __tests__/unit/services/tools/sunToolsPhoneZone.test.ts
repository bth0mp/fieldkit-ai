/**
 * @jest-environment <rootDir>/__tests__/harness/timeZoneEnvironment.js
 * @jest-environment-options {"timeZone": "America/New_York"}
 */
/**
 * sun_times with nothing but a place: the day and the clock offset are the phone's own, and the offset is the
 * one in force on the day asked about, not today's (New York is UTC-5 in November and UTC-4 in July).
 * The phone's zone is the device boundary here; see timeZoneEnvironment.
 */
import { sunTimes } from '../../../../src/services/tools/sunTools';

const run = (args: Record<string, unknown>, now: Date) => sunTimes({ name: 'sun_times', arguments: args }, now);

describe('sun_times on a phone in New York', () => {
  const now = new Date(2026, 10, 18, 9, 0, 0);

  it("uses the phone's date and winter offset when given only a place", () => {
    expect(run({ position: '40.6892, -74.0445' }, now)).toContain('on 2026-11-18 (UTC-05:00): ');
  });

  it('uses the summer offset for a summer day asked about in November', () => {
    // Observatory, tz=-4 equivalent of the UTC values in the main test: sunrise 05:25, sunset 20:31.
    const result = run({ position: '40.6892, -74.0445', date: '2026-06-21' }, now);
    expect(result).toContain('on 2026-06-21 (UTC-04:00): ');
    expect(result).toMatch(/sunrise 05:2[456], /);
    expect(result).toMatch(/sunset 20:3[012], /);
  });

  it('treats a blank offset as no offset given, not as UTC', () => {
    expect(run({ position: '40.6892, -74.0445', date: '2026-11-18', utc_offset: ' ' }, now)).toContain('(UTC-05:00): ');
  });
});
