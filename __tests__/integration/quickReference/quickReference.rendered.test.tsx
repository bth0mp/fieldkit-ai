/**
 * Quick reference (rendered): from the Guide library the user opens Quick reference and reads signal cards
 * that need no model, no download and no network. Cards start closed; opening one shows its signs with their
 * meanings, a note and the standard they come from.
 *
 * Real stack: GuideLibraryScreen and QuickReferenceScreen with the real cards. The expected signs and meanings
 * are typed here from the published standards (ICAO Annex 12's ground-to-air code, the ICAO spelling
 * alphabet, ITU-R M.1677-1 Morse, the Alpine distress signal), not read from the code. Device leaves only:
 * what setupChatScreen installs, and the navigation mock, whose `navigate` is captured here.
 */
import { setupChatScreen } from '../../harness/chatHarness';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

describe('Quick reference (rendered)', () => {
  it('is opened from the Guide library and shows each card once opened', async () => {
    const h = await setupChatScreen({ engine: 'llama', sqlite: true });
    const { React, rtl } = h;
    const { GuideLibraryScreen } = require('../../../src/screens/GuideLibraryScreen');
    const { QuickReferenceScreen } = require('../../../src/screens/QuickReferenceScreen');

    // The Guide library has a Quick reference row.
    const library = rtl.render(React.createElement(GuideLibraryScreen, {}));
    const row = await rtl.waitFor(() => library.getByTestId('guide-library-open-quick-reference'));
    expect(rtl.within(row).getByText('Quick reference')).toBeTruthy();
    expect(rtl.within(row).getByText('Distress signals, radio alphabet, Morse and wind force')).toBeTruthy();
    rtl.fireEvent.press(row);
    expect(mockNavigate).toHaveBeenCalledWith('QuickReference');
    library.unmount();

    // Five cards, all closed.
    const screen = rtl.render(React.createElement(QuickReferenceScreen, {}));
    expect(screen.getByText('Signals, codes and scales to read at a glance. Nothing here needs a model, a download or a signal.')).toBeTruthy();
    const { StyleSheet } = require('react-native');
    const { TYPOGRAPHY } = require('../../../src/constants');
    for (const title of ['Distress signals', 'Ground-to-air signals', 'Radio alphabet', 'Morse code', 'Wind force (Beaufort scale)']) {
      // A card's title is the thing to tap: body text, not a small label.
      expect(StyleSheet.flatten(screen.getByText(title).props.style).fontSize).toBe(TYPOGRAPHY.body.fontSize);
    }
    expect(screen.queryByText('Require medical assistance')).toBeNull();

    // Ground-to-air: the five symbols a survivor lays out, and how an aircraft answers.
    rtl.fireEvent.press(screen.getByText('Ground-to-air signals'));
    const meaningOf = (card: string, sign: string) =>
      String(rtl.within(screen.getByTestId(`quick-reference-${card}-${sign}`)).getByTestId('quick-reference-meaning').props.children);
    expect(meaningOf('ground-to-air', 'V')).toBe('Require assistance');
    expect(meaningOf('ground-to-air', 'X')).toBe('Require medical assistance');
    expect(meaningOf('ground-to-air', 'N')).toBe('No');
    expect(meaningOf('ground-to-air', 'Y')).toBe('Yes');
    expect(screen.getByText(/at least 2\.5 m \(8 ft\) long/)).toBeTruthy();
    expect(screen.getByText(/rocks its wings by day, or flashes its landing or navigation lights twice at night/)).toBeTruthy();
    expect(screen.getByText(/ICAO Annex 12/)).toBeTruthy();
    // The United States Army prints a longer code that disagrees on X; a reader of both must be told.
    expect(screen.getByText('Some military manuals print a longer code. In the United States Army\'s, X means "unable to proceed" and a single upright stroke means a doctor is needed. The five symbols here are the international civil code.')).toBeTruthy();
    expect(screen.getByText(/The longer code is in US Army TC 21-3 \(2025\), Appendix C\./)).toBeTruthy();
    // A screen reader hears a row as one line.
    expect(screen.getByLabelText('X: Require medical assistance')).toBeTruthy();

    // Closing it hides its rows again.
    rtl.fireEvent.press(screen.getByText('Ground-to-air signals'));
    expect(screen.queryByText('Require medical assistance')).toBeNull();

    // Distress: SOS and the mountain whistle signal.
    rtl.fireEvent.press(screen.getByText('Distress signals'));
    expect(meaningOf('distress', 'SOS')).toMatch(/^\.\.\. --- \.\.\./);
    expect(screen.getByLabelText('SOS: three dots, three dashes, three dots, by light, sound or radio, sent as one run, then a pause')).toBeTruthy();
    expect(screen.getByText(/Mayday, Mayday, Mayday/)).toBeTruthy();
    // Each regional signal says where it holds: "three" is the call for help in one and the answer in the other.
    expect(meaningOf('distress', 'Whistle or light'))
      .toBe("The Alpine signal, used in Europe's mountains: six blasts or flashes in a minute, then a minute's pause, repeated. The answer is three in a minute");
    expect(meaningOf('distress', 'Three of anything')).toMatch(/^In North America, three blasts, shots or fires/);
    // No claim that one phone number works everywhere.
    expect(meaningOf('distress', 'Phone'))
      .toBe('112 across the European Union and in some other countries; 911 in the United States and Canada. Learn the local emergency number before you travel');
    expect(screen.getByText(/Aircraft emergency frequency: 121\.5 MHz/)).toBeTruthy();
    expect(screen.getByText(/The rule of three is North American custom, not a published standard/)).toBeTruthy();
    rtl.fireEvent.press(screen.getByText('Distress signals'));

    // Radio alphabet and Morse come from the same tables the Phonetic & Morse tool uses.
    rtl.fireEvent.press(screen.getByText('Radio alphabet'));
    expect(meaningOf('radio-alphabet', 'A')).toBe('Alfa');
    expect(meaningOf('radio-alphabet', 'J')).toBe('Juliett');
    expect(meaningOf('radio-alphabet', 'Z')).toBe('Zulu');
    expect(meaningOf('radio-alphabet', '9')).toBe('Nine, said "niner"');
    rtl.fireEvent.press(screen.getByText('Radio alphabet'));

    rtl.fireEvent.press(screen.getByText('Morse code'));
    expect(meaningOf('morse', 'S')).toBe('...');
    expect(meaningOf('morse', 'O')).toBe('---');
    expect(meaningOf('morse', '5')).toBe('.....');
    expect(meaningOf('morse', '?')).toBe('..--..');
    // Dots and dashes are spoken as words, not skipped as punctuation.
    expect(screen.getByLabelText('S: dot dot dot')).toBeTruthy();
    // A punctuation mark is named: a screen reader would pass over the bare mark.
    expect(screen.getByLabelText('question mark: dot dot dash dash dot dot')).toBeTruthy();
    expect(screen.getByLabelText('full stop: dot dash dot dash dot dash')).toBeTruthy();
    expect(screen.queryByLabelText('?: dot dot dash dash dot dot')).toBeNull();
    expect(screen.getByLabelText('A: dot dash')).toBeTruthy();
    expect(screen.getByText(/A dash lasts three dots/)).toBeTruthy();
    expect(screen.getByText(/ITU-R M\.1677-1/)).toBeTruthy();
    rtl.fireEvent.press(screen.getByText('Morse code'));

    // Wind force: what to look for on land at each Beaufort number. Typed from two US National Weather
    // Service tables as read on 19 November 2026: "Beaufort Wind Scale" (weather.gov/mfl/beaufort), whose
    // land signs and knots these are, and "Estimating Wind Speed" (weather.gov/pqr/wind). Both print the same
    // miles an hour for forces 1 to 10 and start force 11 at 64.
    rtl.fireEvent.press(screen.getByText('Wind force (Beaufort scale)'));
    expect(meaningOf('wind-force', 'Force 0')).toBe('Calm. Smoke rises vertically');
    expect(meaningOf('wind-force', 'Force 1')).toBe('Light air, 1 to 3 mph (1 to 3 knots). Direction of wind shown by smoke drift, but not by wind vanes');
    expect(meaningOf('wind-force', 'Force 2')).toBe('Light breeze, 4 to 7 mph (4 to 6 knots). Wind felt on face; leaves rustle; ordinary vanes moved by wind');
    expect(meaningOf('wind-force', 'Force 3')).toBe('Gentle breeze, 8 to 12 mph (7 to 10 knots). Leaves and small twigs in constant motion; wind extends light flag');
    expect(meaningOf('wind-force', 'Force 4')).toBe('Moderate breeze, 13 to 18 mph (11 to 16 knots). Raises dust and loose paper; small branches are moved');
    expect(meaningOf('wind-force', 'Force 5')).toBe('Fresh breeze, 19 to 24 mph (17 to 21 knots). Small trees in leaf begin to sway; crested wavelets form on inland waters');
    expect(meaningOf('wind-force', 'Force 6')).toBe('Strong breeze, 25 to 31 mph (22 to 27 knots). Large branches in motion; whistling heard in telegraph wires; umbrellas used with difficulty');
    expect(meaningOf('wind-force', 'Force 7')).toBe('Near gale, 32 to 38 mph (28 to 33 knots). Whole trees in motion; inconvenience felt when walking against the wind');
    expect(meaningOf('wind-force', 'Force 8')).toBe('Gale, 39 to 46 mph (34 to 40 knots). Breaks twigs off trees; generally impedes progress');
    // The two tables name forces 9 and 10 differently; the card gives both names.
    expect(meaningOf('wind-force', 'Force 9')).toBe('Strong gale, also called severe gale, 47 to 54 mph (41 to 47 knots). Slight structural damage occurs (chimney-pots and slates removed)');
    expect(meaningOf('wind-force', 'Force 10')).toBe('Storm, also called whole gale, 55 to 63 mph (48 to 55 knots). Seldom experienced inland; trees uprooted; considerable structural damage occurs');
    expect(meaningOf('wind-force', 'Force 11')).toBe('Violent storm, from 64 mph (56 knots). Very rarely experienced; accompanied by wide-spread damage');
    // They disagree on where force 12 starts in miles an hour, so the card gives knots only and says why.
    expect(meaningOf('wind-force', 'Force 12')).toBe('Hurricane, from 64 knots. Severe and extensive damage');
    expect(screen.getByText('The two tables used here put the start of force 12 at 72 and at 75 miles an hour, so it is given in knots only.')).toBeTruthy();
    expect(screen.getByText('These are the signs on land. At sea the scale is read from the waves, which this card leaves out.')).toBeTruthy();
    expect(screen.getByText('US National Weather Service: Beaufort Wind Scale (Miami office) and Estimating Wind Speed (Portland office), as read on 19 November 2026.')).toBeTruthy();
    expect(screen.getByLabelText('Force 8: Gale, 39 to 46 mph (34 to 40 knots). Breaks twigs off trees; generally impedes progress')).toBeTruthy();
  });
});
