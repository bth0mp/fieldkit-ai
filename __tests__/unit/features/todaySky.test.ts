/** @jest-environment <rootDir>/__tests__/harness/timeZoneEnvironment.js
 *  @jest-environment-options {"timeZone": "Europe/London"} */
import { todaySky, formatDay } from '../../../src/features/home/todaySky';

describe('todaySky', () => {
  it('gives sunrise, sunset and moonrise as clock times, matching sun_times', () => {
    expect(todaySky({ lat: 51.4778, lon: -0.0015 }, new Date('2026-11-21T12:00:00Z')))
      .toEqual({ sunrise: '07:28', sunset: '16:03', sunAllDay: null, moonrise: '14:04' });
  });

  it('says the sun is up all day in the midnight sun, with the moon still rising', () => {
    expect(todaySky({ lat: 78.22, lon: 15.65 }, new Date('2026-06-21T12:00:00Z')))
      .toEqual({ sunrise: null, sunset: null, sunAllDay: 'up', moonrise: '11:29' });
  });

  it('says the sun is down all day in the polar night, with no moonrise while the moon stays up', () => {
    expect(todaySky({ lat: 78.22, lon: 15.65 }, new Date('2026-12-21T12:00:00Z')))
      .toEqual({ sunrise: null, sunset: null, sunAllDay: 'down', moonrise: null });
  });
});

describe('formatDay', () => {
  it('writes the weekday, day and month in English', () => {
    expect(formatDay(new Date('2026-11-21T12:00:00Z'))).toBe('Sat 21 Nov');
  });
});
