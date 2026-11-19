/**
 * Calculators (rendered): the sums the assistant's tools do, worked out by the user from boxes on a screen, with
 * no model loaded. From Settings the user opens Calculators, opens one, fills in its boxes and reads the answer
 * the tool itself gives.
 *
 * Real stack: SettingsScreen, CalculatorsScreen, the real tool registry and the real handlers. The expected
 * answers are ones the tools' own tests check against outside references, not this screen's output: 26.2 miles
 * is 42.1648 km by the defined mile; the sun and moon at Greenwich on 18 November 2026 are the US Naval
 * Observatory's; 19 November 2026 plus 45 days is 3 January 2027 by the calendar. Device leaves only: what
 * setupChatScreen installs, and the navigation mock, whose `navigate` is captured here.
 */
import { setupChatScreen } from '../../harness/chatHarness';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

describe('Calculators (rendered)', () => {
  it('is opened from Settings and works a tool out from the boxes, with no model', async () => {
    const h = await setupChatScreen({ engine: 'llama', sqlite: true });
    const { React, rtl } = h;
    const { SettingsScreen } = require('../../../src/screens/SettingsScreen');
    const { CalculatorsScreen } = require('../../../src/screens/CalculatorsScreen');

    // Settings has a Calculators row.
    const settings = rtl.render(React.createElement(SettingsScreen));
    const row = settings.getByTestId('settings-calculators');
    expect(rtl.within(row).getByText('Calculators')).toBeTruthy();
    expect(rtl.within(row).getByText('Units, grid references, sun and moon, distance, dates')).toBeTruthy();
    rtl.fireEvent.press(row);
    expect(mockNavigate).toHaveBeenCalledWith('Calculators');
    settings.unmount();

    // Seven calculators, all closed: the tools that work an answer out on the phone from what is typed.
    const screen = rtl.render(React.createElement(CalculatorsScreen, {}));
    expect(screen.getByText('The sums the assistant\'s tools do, worked out on this phone from what you type. No model is needed, and nothing leaves the phone.')).toBeTruthy();
    for (const title of ['Calculator', 'Unit Converter', 'Grid Reference', 'Sunrise & Sunset', 'Distance & Bearing', 'Date Calculator', 'Phonetic & Morse']) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    // Nothing that reaches the network, asks for approval or reads private data is offered here.
    for (const title of ['Web Search', 'URL Reader', 'Email Draft', 'Calendar', 'New Calendar Event', 'Knowledge Base']) {
      expect(screen.queryByText(title)).toBeNull();
    }
    expect(screen.queryByTestId('calculators-convert_units-value')).toBeNull();

    const box = (tool: string, key: string) => screen.getByTestId(`calculators-${tool}-${key}`);
    const fill = (tool: string, values: Record<string, string>) => {
      for (const [key, value] of Object.entries(values)) rtl.fireEvent.changeText(box(tool, key), value);
    };
    const answerOf = async (tool: string) => {
      rtl.fireEvent.press(screen.getByTestId(`calculators-${tool}-go`));
      return String((await rtl.waitFor(() => screen.getByTestId(`calculators-${tool}-answer`))).props.children);
    };
    const problemOf = async (tool: string) => {
      rtl.fireEvent.press(screen.getByTestId(`calculators-${tool}-go`));
      return String((await rtl.waitFor(() => screen.getByTestId(`calculators-${tool}-problem`))).props.children);
    };

    // Unit Converter: three boxes, each with what to put in it.
    rtl.fireEvent.press(screen.getByText('Unit Converter'));
    expect(screen.getByText('Value')).toBeTruthy();
    expect(screen.getByText('Unit to convert from, e.g. mi, lb, gal, F, psi')).toBeTruthy();
    fill('convert_units', { value: '26.2', from: 'mi', to: 'km' });
    expect(await answerOf('convert_units')).toBe('26.2 mi = 42.1648 km');

    // Changing a box takes the old answer away: it no longer belongs to what is typed.
    fill('convert_units', { to: 'xyz' });
    expect(screen.queryByTestId('calculators-convert_units-answer')).toBeNull();
    // What the tool cannot do, it says in its own words.
    expect(await problemOf('convert_units')).toMatch(/^Unknown unit "xyz"\. Known units: /);
    expect(screen.queryByTestId('calculators-convert_units-answer')).toBeNull();
    // An empty box that is needed is named, and the tool is not run.
    fill('convert_units', { value: '   ', to: 'km' });
    expect(await problemOf('convert_units')).toBe('Fill in "Value".');

    // Opening another closes the first; what was typed in it is kept.
    rtl.fireEvent.press(screen.getByText('Sunrise & Sunset'));
    expect(screen.queryByTestId('calculators-convert_units-value')).toBeNull();
    // Boxes that may be left empty say so.
    expect(screen.getByText('Date (optional)')).toBeTruthy();
    expect(screen.getByText('UTC offset (optional)')).toBeTruthy();
    fill('sun_times', { position: '51.4778, -0.0015', date: '2026-11-18', utc_offset: '0' });
    // Observatory: sunrise 07:23, sunset 16:07; the moon rises at 13:26 and does not set that day.
    expect(await answerOf('sun_times')).toMatch(/^Sun at 51\.47780, -0\.00150 on 2026-11-18 \(UTC\+00:00\): .*sunrise 07:2[234], .*sunset 16:0[678], .* Moon: waxing gibbous, \d+% lit\. Moonrise 13:2[567], no moonset this day\.$/);
    // An optional box left empty is left out, not sent as an empty value: the day is then today.
    fill('sun_times', { date: '', utc_offset: '' });
    expect(await answerOf('sun_times')).toMatch(/^Sun at 51\.47780, -0\.00150 on \d{4}-\d\d-\d\d \(UTC[+-]\d\d:\d\d\): /);

    rtl.fireEvent.press(screen.getByText('Unit Converter'));
    expect(box('convert_units', 'from').props.value).toBe('mi');

    // The others are wired the same way.
    rtl.fireEvent.press(screen.getByText('Date Calculator'));
    fill('date_math', { start: '2026-11-19', add_days: '45' });
    expect(await answerOf('date_math')).toMatch(/2027-01-03/);
    rtl.fireEvent.press(screen.getByText('Phonetic & Morse'));
    fill('phonetic_morse', { text: 'KD7ABC' });
    expect(await answerOf('phonetic_morse')).toBe('KD7ABC = Kilo Delta Seven Alfa Bravo Charlie\nMorse: -.- -.. --... .- -... -.-.');
    rtl.fireEvent.press(screen.getByText('Grid Reference'));
    fill('convert_coordinates', { position: '40.6892, -74.0445' });
    expect((await answerOf('convert_coordinates')).replace(/\s/g, '')).toContain('18TWL8073504695');
    rtl.fireEvent.press(screen.getByText('Calculator'));
    fill('calculator', { expression: '2+2*3' });
    expect(await answerOf('calculator')).toBe('2+2*3 = 8');
    rtl.fireEvent.press(screen.getByText('Distance & Bearing'));
    fill('distance_bearing', { from: '78, 15', to: '78.22, 15.65' });
    expect(await answerOf('distance_bearing')).toMatch(/km/);
  }, 60000);
});
