/**
 * date_math: days between two dates, a date some days on or back, and the day of the week.
 *
 * Expected values are calendar facts worked out by hand or widely recorded (20 July 1969 was a Sunday,
 * 1 January 2000 a Saturday, 29 February 2024 a Thursday), not this module's own output.
 */
import { dateMath } from '../../../../src/services/tools/dateTools';

type Args = { start?: unknown; end?: unknown; add_days?: unknown };
const run = (args: Args, now?: Date) => dateMath({ name: 'date_math', arguments: args }, now);

describe('date_math', () => {
  it('counts the days between two dates and names both weekdays', () => {
    // 12 days left in November, then 25 in December.
    expect(run({ start: '2026-11-18', end: '2026-12-25' }))
      .toBe('From 2026-11-18 (Wednesday) to 2026-12-25 (Friday): 37 days (5 weeks and 2 days).');
  });

  it.each([
    ['2024-01-01', '2025-01-01', '366 days (52 weeks and 2 days)'], // a leap year
    ['2026-01-01', '2027-01-01', '365 days (52 weeks and 1 day)'],
    ['2000-02-28', '2000-03-01', '2 days'], // 2000 was a leap year
    ['1900-02-28', '1900-03-01', '1 day'], // 1900 was not
    ['2026-11-18', '2026-11-25', '7 days (1 week)'],
    ['2026-11-18', '2026-11-18', '0 days'],
  ])('%s to %s is %s', (start, end, days) => {
    expect(run({ start, end })).toContain(`: ${days}.`);
  });

  it('counts backwards when the second date is the earlier one, and says so', () => {
    expect(run({ start: '2026-12-25', end: '2026-11-18' }))
      .toBe('From 2026-12-25 (Friday) back to 2026-11-18 (Wednesday): 37 days earlier (5 weeks and 2 days).');
  });

  it('finds the date a number of days on, across a year end', () => {
    // 12 days to the end of November, 31 in December, 2 into January.
    expect(run({ start: '2026-11-18', add_days: 45 })).toBe('45 days after 2026-11-18 (Wednesday) is 2027-01-02 (Saturday).');
    expect(run({ start: '2026-11-18', add_days: 1 })).toBe('1 day after 2026-11-18 (Wednesday) is 2026-11-19 (Thursday).');
  });

  it('finds the date a number of days back, across a leap day', () => {
    expect(run({ start: '2024-03-01', add_days: -1 })).toBe('1 day before 2024-03-01 (Friday) is 2024-02-29 (Thursday).');
    expect(run({ start: '2026-03-01', add_days: '-1' })).toBe('1 day before 2026-03-01 (Sunday) is 2026-02-28 (Saturday).');
  });

  it('names the day of the week for dates whose weekday is on record', () => {
    expect(run({ start: '1969-07-20', add_days: 0 })).toBe('1969-07-20 is a Sunday.');
    expect(run({ start: '2000-01-01', add_days: 0 })).toBe('2000-01-01 is a Saturday.');
  });

  it("starts from the phone's own date when no start is given", () => {
    const now = new Date(2026, 10, 18, 23, 30, 0);
    expect(run({ add_days: 10 }, now)).toBe('10 days after 2026-11-18 (Wednesday) is 2026-11-28 (Saturday).');
    expect(run({ end: '2026-12-25' }, now)).toContain('From 2026-11-18 (Wednesday) to 2026-12-25 (Friday): 37 days');
  });

  it('refuses what it cannot use', () => {
    expect(() => run({ start: '2026-11-18' })).toThrow(/Give either end .* or add_days/);
    expect(() => run({ start: '2026-11-18', end: '2026-12-25', add_days: 3 })).toThrow(/Give either end .* or add_days, not both/);
    expect(() => run({ start: '18/11/2026', add_days: 3 })).toThrow(/start must be a date written YYYY-MM-DD/);
    expect(() => run({ start: '2026-02-30', add_days: 3 })).toThrow(/start must be a date written YYYY-MM-DD/);
    expect(() => run({ start: '2026-11-18', end: 'Christmas' })).toThrow(/end must be a date written YYYY-MM-DD/);
    expect(() => run({ start: '2026-11-18', add_days: 2.5 })).toThrow(/add_days must be a whole number/);
    expect(() => run({ start: '2026-11-18', add_days: 'soon' })).toThrow(/add_days must be a whole number/);
    expect(() => run({ start: '2026-11-18', add_days: 100000 })).toThrow(/between 1900 and 2100/);
    expect(() => run({ start: '1850-01-01', add_days: 1 })).toThrow(/between 1900 and 2100/);
  });

  it('gives the same plain refusal for a number of days past anything a calendar holds', () => {
    // Far enough on, the date itself is no longer a date; the answer must still be the year limits, not an
    // engine error.
    for (const days of [100000000, 1e300, '99999999999999999999999', -100000000]) {
      expect(() => run({ start: '2026-01-01', add_days: days })).toThrow('Dates must be between 1900 and 2100.');
    }
  });
});
