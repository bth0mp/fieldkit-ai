/**
 * Calculators: which tools can be run from the screen, and what a person is told when a box is wrong. The real
 * registry and the real handlers; nothing faked. The tools' messages were written for a model and name their
 * parameters ("add_days", "utc_offset"); a person sees boxes labelled "Add days" and "UTC offset".
 */
import { CALCULATORS, workOut } from '../../../../src/features/calculators/calculators';

const problem = async (id: string, typed: Record<string, string>) => (await workOut(id, typed)).problem;

describe('calculators', () => {
  it('offers exactly the seven tools that work an answer out on the phone, and runs no other', async () => {
    expect(CALCULATORS.map(calculator => calculator.id))
      .toEqual(['calculator', 'convert_units', 'convert_coordinates', 'sun_times', 'distance_bearing', 'date_math', 'phonetic_morse']);
    // Tools that reach the network, the calendar or mail, or read the phone, are refused whatever is typed.
    for (const id of ['web_search', 'read_url', 'draft_email', 'read_calendar_events', 'create_calendar_event',
      'search_knowledge_base', 'get_device_info', 'get_current_datetime', '__proto__', 'constructor', '']) {
      expect(await workOut(id, { query: 'x', url: 'https://example.com', expression: '1+1' }))
        .toEqual({ answer: '', problem: 'That calculator is not available.' });
    }
  });

  it('says what each box is for, in words for a person', () => {
    const box = (id: string, key: string) => CALCULATORS.find(c => c.id === id)!.fields.find(f => f.key === key)!;
    expect(box('sun_times', 'utc_offset')).toMatchObject({ label: 'UTC offset', required: false });
    expect(box('date_math', 'add_days')).toMatchObject({ label: 'Add days', required: false });
    expect(box('convert_units', 'value')).toMatchObject({ label: 'Value', required: true });
    // A box with fixed choices names them.
    expect(box('phonetic_morse', 'to').hint).toBe('Which spelling to give. Leave out for both. (phonetic or morse)');
    // The calculator's own definition says only "Math expression": a person needs to know what % does.
    expect(box('calculator', 'expression').hint)
      .toBe('Numbers with + - * / ^ and brackets, for example (3+4)*2. % gives the remainder, not a percentage.');
  });

  it('asks for a plain number in a number box before the tool is run', async () => {
    const plain = (label: string) => `"${label}" must be a plain number, for example 5.5 or -5.`;
    // The unit belongs in the next box; a decimal comma and a thousands comma are not numbers here.
    for (const value of ['72 F', '1,5', '1,000', '1/2', 'ten']) {
      expect(await problem('convert_units', { value, from: 'mi', to: 'km' })).toBe(plain('Value'));
    }
    for (const offset of ['UTC+1', '+01:00', '5:30', 'GMT']) {
      expect(await problem('sun_times', { position: '51.4778, -0.0015', utc_offset: offset })).toBe(plain('UTC offset'));
    }
    expect(await problem('date_math', { add_days: 'a week' })).toBe(plain('Add days'));
    // A plain number goes to the tool, which may still refuse it in its own words, with the box's name.
    expect(await problem('date_math', { add_days: '1.5' })).toBe('Add days must be a whole number of days, for example 45 or -7');
    expect(await problem('sun_times', { position: '51.4778, -0.0015', utc_offset: '99' }))
      .toBe('UTC offset must be a number of hours between -14 and 14, for example -5 or 5.5');
    expect((await workOut('convert_units', { value: ' -40 ', from: 'F', to: 'C' })).answer).toBe('-40 °F = -40 °C');
  });

  it('names boxes by their labels in what a tool says', async () => {
    // Nothing in the Date Calculator is marked as needed, but it needs one of two boxes.
    expect(await problem('date_math', { start: '2026-11-19' }))
      .toBe('Give either end (to count the days between two dates) or Add days (to find a date some days away).');
    expect(await problem('date_math', { start: '19/11/2026', add_days: '1' })).toMatch(/^Start must be a date written YYYY-MM-DD/);
    expect(await problem('phonetic_morse', { text: 'SOS', to: 'semaphore' })).toBe('To must be "phonetic" or "morse", or left out for both.');
    // The same inside an answer: Fairbanks asked about on a clock nine hours ahead of UTC.
    const far = (await workOut('sun_times', { position: '64.8378, -147.7164', date: '2026-03-20', utc_offset: '9' })).answer;
    expect(far).toContain('Give UTC offset for the place to get its local times.');
    expect(far).not.toContain('utc_offset');
  });
});
