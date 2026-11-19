/**
 * sun_times: sunrise, sunset, solar noon and civil twilight for a place and a date.
 *
 * The expected times are NOT this module's own output. They were read on 2026-11-18 from the US Naval
 * Observatory's API (aa.usno.navy.mil/api/rstt/oneday, tz=0, to the minute). The Observatory lists the events
 * inside one UTC day; this tool lists the events of one solar day (dawn to dusk) at the place. Where the two
 * differ (a sunset just after midnight UTC belongs to the evening before), the case says which events it checks.
 * Tolerance is one minute: both sides round to the minute.
 */
import { sunTimes } from '../../../../src/services/tools/sunTools';

type Args = { position?: unknown; date?: unknown; utc_offset?: unknown };
const run = (args: Args, now?: Date) => sunTimes({ name: 'sun_times', arguments: args }, now);

/** "sunrise 07:23" or "sunset 00:31 (+1 day)" in a result, as minutes from the start of the asked-for day. */
function minutesOf(result: string, label: string): number {
  const m = new RegExp(`${label} (\\d\\d):(\\d\\d)(?: \\(([+-])1 day\\))?`).exec(result);
  if (!m) throw new Error(`no "${label}" time in: ${result}`);
  const shift = m[3] === '+' ? 1440 : m[3] === '-' ? -1440 : 0;
  return Number(m[1]) * 60 + Number(m[2]) + shift;
}
const hm = (text: string) => Number(text.slice(0, 2)) * 60 + Number(text.slice(3, 5));
function expectTimes(result: string, expected: Record<string, string>) {
  for (const [label, time] of Object.entries(expected)) {
    expect({ label, minutesOff: Math.abs(minutesOf(result, label) - hm(time)) <= 1 ? 0 : minutesOf(result, label) - hm(time) })
      .toEqual({ label, minutesOff: 0 });
  }
}

describe('sun_times', () => {
  it('Greenwich in November, all five events inside the day', () => {
    const result = run({ position: '51.4778, -0.0015', date: '2026-11-18', utc_offset: 0 });
    expect(result.startsWith('Sun at 51.47780, -0.00150 on 2026-11-18 (UTC+00:00): ')).toBe(true);
    expectTimes(result, { 'civil dawn': '06:46', sunrise: '07:23', 'solar noon': '11:45', sunset: '16:07', 'civil dusk': '16:44' });
    expect(result).toMatch(/Daylight 8 h 4[345] min\.$/);
  });

  it.each([
    ['New York at the winter solstice', '40.6892, -74.0445', '2026-12-21', { 'civil dawn': '11:46', sunrise: '12:17', 'solar noon': '16:54', sunset: '21:32', 'civil dusk': '22:03' }],
    ['Quito at the equinox', '0, -78.5', '2026-03-20', { 'civil dawn': '10:57', sunrise: '11:18', 'solar noon': '17:21', sunset: '23:25', 'civil dusk': '23:45' }],
    ['Reykjavik in September', '64.1466, -21.9426', '2026-09-01', { 'civil dawn': '05:17', sunrise: '06:10', 'solar noon': '13:28', sunset: '20:43', 'civil dusk': '21:36' }],
    ['60 north at midsummer, a short bright night', '60, 5', '2026-06-21', { 'civil dawn': '00:29', sunrise: '02:16', 'solar noon': '11:42', sunset: '21:08', 'civil dusk': '22:54' }],
  ])('%s, in UTC', (_name, position, date, expected) => {
    expectTimes(run({ position, date, utc_offset: 0 }), expected);
  });

  it('gives local clock times when told the offset: New York at midsummer, UTC-4', () => {
    const result = run({ position: '40.6892, -74.0445', date: '2026-06-21', utc_offset: -4 });
    expect(result).toContain('on 2026-06-21 (UTC-04:00): ');
    // Observatory, UTC: dawn 08:52, rise 09:25, noon 16:58; the evening's set 00:31 and dusk 01:04 fall on the next UTC day.
    expectTimes(result, { 'civil dawn': '04:52', sunrise: '05:25', 'solar noon': '12:58', sunset: '20:31', 'civil dusk': '21:04' });
  });

  it('south of the equator and east of Greenwich: Sydney at midsummer, UTC+11', () => {
    // Observatory, UTC day 21 Dec: noon 01:53, set 09:05, dusk 09:35; dawn 18:12 and rise 18:41 (the next local morning,
    // within a minute of this one at the solstice).
    expectTimes(run({ position: '-33.8568, 151.2153', date: '2026-12-21', utc_offset: 11 }),
      { 'civil dawn': '05:12', sunrise: '05:41', 'solar noon': '12:53', sunset: '20:05', 'civil dusk': '20:35' });
  });

  it('a leap day west of the date line side: Honolulu, UTC-10', () => {
    // Observatory, UTC day 29 Feb 2024: dawn 16:30, rise 16:52, noon 22:44.
    expectTimes(run({ position: '21.3069, -157.8583', date: '2024-02-29', utc_offset: -10 }),
      { 'civil dawn': '06:30', sunrise: '06:52', 'solar noon': '12:44' });
  });

  it('far south in summer: Ushuaia, UTC-3', () => {
    // Observatory, UTC day 10 Feb: dawn 08:34, rise 09:16, noon 16:47. Its "set 00:19" is the evening before, when
    // sunset moves two minutes a day, so the set is not compared here.
    expectTimes(run({ position: '-54.8, -68.3', date: '2026-02-10', utc_offset: -3 }),
      { 'civil dawn': '05:34', sunrise: '06:16', 'solar noon': '13:47' });
  });

  it('marks an event that falls on the next or previous day in the zone asked for', () => {
    // New York's midsummer day seen in UTC: the sunset is after midnight.
    const result = run({ position: '40.6892, -74.0445', date: '2026-06-21', utc_offset: 0 });
    expect(result).toMatch(/sunset 00:3[012] \(\+1 day\)/);
    expect(result).toMatch(/civil dusk 01:0[345] \(\+1 day\)/);
    expectTimes(result, { 'civil dawn': '08:52', sunrise: '09:25', 'solar noon': '16:58' });
  });

  it('says so when the sun never sets: Tromso at midsummer', () => {
    const result = run({ position: '69.6492, 18.9553', date: '2026-06-21', utc_offset: 0 });
    expect(result).toContain('the sun is up all day, with no sunrise or sunset');
    expectTimes(result, { 'solar noon': '10:46' });
    expect(result).not.toMatch(/sunrise \d/);
  });

  it('says so when the sun never rises, and still gives the twilight: Tromso at midwinter', () => {
    const result = run({ position: '69.6492, 18.9553', date: '2026-12-21', utc_offset: 0 });
    expect(result).toContain('the sun stays below the horizon all day');
    expectTimes(result, { 'civil dawn': '08:31', 'civil dusk': '12:53' });
    expect(result).not.toMatch(/sunrise \d/);
  });

  it('reads the position as the grid tool does, grid references included', () => {
    const fromGrid = run({ position: '30U YC 08213 07224', date: '2026-11-18', utc_offset: 0 });
    expectTimes(fromGrid, { sunrise: '07:23', sunset: '16:07' });
    expect(() => run({ position: 'somewhere near the river', date: '2026-11-18' })).toThrow(/Could not read/);
    expect(() => run({ date: '2026-11-18' })).toThrow(/Missing required parameter: position/);
  });

  it('works nearer the poles than the grid tool does', () => {
    expect(run({ position: '88, 10', date: '2026-06-21', utc_offset: 0 })).toContain('the sun is up all day');
  });

  it("uses the phone's own date and clock offset when none is given", () => {
    const now = new Date(2026, 10, 18, 9, 0, 0);
    const offsetMinutes = -now.getTimezoneOffset();
    const sign = offsetMinutes < 0 ? '-' : '+';
    const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
    const zone = `UTC${sign}${pad(Math.abs(offsetMinutes) / 60)}:${pad(Math.abs(offsetMinutes) % 60)}`;
    expect(run({ position: '51.4778, -0.0015' }, now)).toContain(`on 2026-11-18 (${zone}): `);
  });

  it('refuses a date or an offset it cannot use', () => {
    expect(() => run({ position: '51.4778, -0.0015', date: '18/11/2026' })).toThrow(/Date must be YYYY-MM-DD/);
    expect(() => run({ position: '51.4778, -0.0015', date: '2026-02-30' })).toThrow(/Date must be YYYY-MM-DD/);
    expect(() => run({ position: '51.4778, -0.0015', date: '2026-11-18', utc_offset: 20 })).toThrow(/utc_offset must be a number of hours between -14 and 14/);
    expect(() => run({ position: '51.4778, -0.0015', date: '2026-11-18', utc_offset: 'noon' })).toThrow(/utc_offset must be a number of hours between -14 and 14/);
  });

  it('takes the offset as text and as a half hour', () => {
    expect(run({ position: '28.6139, 77.2090', date: '2026-11-18', utc_offset: '5.5' })).toContain('(UTC+05:30): ');
  });

  // The solar day is the one whose noon falls on the asked date in the zone shown. Either side of the date line
  // that is a different UTC day from the one the date names. Observatory values fetched with tz=12 and tz=14.
  it.each([
    ['Fiji side of the date line, UTC+12', '-16.8, -179.9', '2026-11-19', 12, { 'civil dawn': '04:54', sunrise: '05:17', 'solar noon': '11:45', sunset: '18:13', 'civil dusk': '18:36' }],
    ['Kiritimati, UTC+14', '1.87, -157.4', '2026-11-18', 14, { 'civil dawn': '05:52', sunrise: '06:14', 'solar noon': '12:15', sunset: '18:16', 'civil dusk': '18:38' }],
  ])('picks the right solar day at the date line: %s', (_name, position, date, offset, expected) => {
    const result = run({ position, date, utc_offset: offset });
    expectTimes(result, expected);
    expect(result).not.toContain('day)');
  });

  it('tells an evening from the one before when sunset moves three minutes a day', () => {
    // 65 N, 179.5 W in February. Observatory, UTC day 02-10: set 04:09, end twilight 05:04; the next day 04:12, 05:07.
    expectTimes(run({ position: '65, -179.5', date: '2026-02-10', utc_offset: 12 }), { sunset: '16:09', 'civil dusk': '17:04' });
  });

  it('marks a morning that falls on the day before in the zone asked for', () => {
    // 45 S, 170 E seen in UTC. Observatory, UTC day 2026-09-23: begin civil twilight 17:57, rise 18:26.
    const result = run({ position: '-45, 170', date: '2026-09-24', utc_offset: 0 });
    expect(result).toMatch(/civil dawn 17:5[678] \(-1 day\), sunrise 18:2[567] \(-1 day\)/);
  });

  // On the first and last day of the midnight sun the sun dips below the horizon for under an hour. That one
  // sunset or sunrise must not be swallowed by "up all day". Observatory values, UTC.
  it('keeps the one sunset on the day the midnight sun ends', () => {
    const tromso = run({ position: '69.6492, 18.9553', date: '2026-07-25', utc_offset: 0 });
    expectTimes2(tromso, { sunset: '22:36' });
    expect(tromso).not.toMatch(/sunrise \d/);
    expect(tromso).not.toContain('up all day');
    const arcticCircle = run({ position: '66, 25', date: '2026-06-30', utc_offset: 0 });
    expectTimes2(arcticCircle, { sunset: '22:08' });
    expect(arcticCircle).not.toMatch(/sunrise \d/);
  });

  it('keeps the one sunrise on the day the midnight sun begins', () => {
    // The rise is late on the evening before: 22:53 on 17 May for Tromso's solar day of the 18th.
    const tromso = run({ position: '69.6492, 18.9553', date: '2026-05-18', utc_offset: 0 });
    expect(minutesOf(tromso, 'sunrise')).toBeGreaterThanOrEqual(hm('22:53') - 1440 - 2);
    expect(minutesOf(tromso, 'sunrise')).toBeLessThanOrEqual(hm('22:53') - 1440 + 2);
    expect(tromso).not.toMatch(/sunset \d/);
    expect(tromso).not.toContain('up all day');
  });

  it('says civil twilight lasts all day when the sun is only just below the horizon at the pole', () => {
    // Observatory for 89 N on 2026-09-30: sun continuously below the horizon, continuously above the twilight limit.
    const result = run({ position: '89, 0', date: '2026-09-30', utc_offset: 0 });
    expect(result).toContain('the sun stays below the horizon all day');
    expect(result).toContain('civil twilight all day');
    expect(result).not.toContain('no civil twilight');
  });

  it('warns when the clock times shown are plainly not the place\'s own', () => {
    // Fairbanks asked about from a phone in Japan: the noon shown is 06:58, and the local date there differs.
    const far = run({ position: '64.8378, -147.7164', date: '2026-03-20', utc_offset: 9 });
    expect(far).toContain('(UTC+09:00): ');
    expect(far).toMatch(/These are UTC\+09:00 clock times, not this place's own local time/);
    // With the place's own offset there is no warning. Observatory, tz=-8, 2026-03-20: rise 07:50, set 20:08.
    const local = run({ position: '64.8378, -147.7164', date: '2026-03-20', utc_offset: -8 });
    expectTimes(local, { sunrise: '07:50', sunset: '20:08' });
    expect(local).not.toContain('not this place');
  });

  it('gives a daylight figure that agrees with the two times printed', () => {
    const result = run({ position: '-33.8568, 151.2153', date: '2026-12-21', utc_offset: 11 });
    const minutes = minutesOf(result, 'sunset') - minutesOf(result, 'sunrise');
    expect(result).toContain(`Daylight ${Math.floor(minutes / 60)} h ${minutes % 60} min.`);
  });

  it('refuses years it cannot vouch for, and offsets that are not plain numbers', () => {
    expect(() => run({ position: '51.4778, -0.0015', date: '0000-01-01' })).toThrow(/Date must be YYYY-MM-DD/);
    expect(() => run({ position: '51.4778, -0.0015', date: '9999-12-31' })).toThrow(/between 1900 and 2100/);
    expect(() => run({ position: '51.4778, -0.0015', date: '2026-11-18', utc_offset: '0x2' })).toThrow(/utc_offset must be/);
    expect(() => run({ position: '51.4778, -0.0015', date: '2026-11-18', utc_offset: '1e1' })).toThrow(/utc_offset must be/);
  });

  it('refuses a grid square too coarse to stand for one place', () => {
    // A 100 km square is ten minutes of sun time wide at this latitude.
    expect(() => run({ position: '33W XS', date: '2026-11-18', utc_offset: 0 })).toThrow(/100 km square/);
    expect(run({ position: '33W XS 1 2', date: '2026-06-21', utc_offset: 0 })).toContain('Sun at ');
  });

  it('takes "today" from the zone asked for when only the offset is given', () => {
    // 18:30 UTC on the 18th is already the 19th at UTC+14 and still the 18th at UTC-5.
    const now = new Date(Date.UTC(2026, 10, 18, 18, 30));
    expect(run({ position: '1.87, -157.4', utc_offset: 14 }, now)).toContain('on 2026-11-19 (UTC+14:00): ');
    expect(run({ position: '40.6892, -74.0445', utc_offset: -5 }, now)).toContain('on 2026-11-18 (UTC-05:00): ');
  });
});

/** As expectTimes, with two minutes' grace: the sun is grazing the horizon in these cases. */
function expectTimes2(result: string, expected: Record<string, string>) {
  for (const [label, time] of Object.entries(expected)) {
    expect({ label, minutesOff: Math.abs(minutesOf(result, label) - hm(time)) <= 2 ? 0 : minutesOf(result, label) - hm(time) })
      .toEqual({ label, minutesOff: 0 });
  }
}
