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
    rtl.fireEvent.press(row);
    expect(mockNavigate).toHaveBeenCalledWith('QuickReference');
    library.unmount();

    // Four cards, all closed.
    const screen = rtl.render(React.createElement(QuickReferenceScreen, {}));
    for (const title of ['Distress signals', 'Ground-to-air signals', 'Radio alphabet', 'Morse code']) {
      expect(screen.getByText(title)).toBeTruthy();
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
  });
});
