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

    // The Kit tab has a Quick reference row of its own: the cards are one tap away, not behind the Guide library.
    const { KitScreen } = require('../../../src/screens/KitScreen');
    const kit = rtl.render(React.createElement(KitScreen));
    const kitRow = kit.getByTestId('kit-quick-reference');
    expect(rtl.within(kitRow).getByText('Quick reference')).toBeTruthy();
    expect(rtl.within(kitRow).getByText('Signals, codes and scales at a glance')).toBeTruthy();
    rtl.fireEvent.press(kitRow);
    expect(mockNavigate).toHaveBeenCalledWith('QuickReference');
    kit.unmount();
    mockNavigate.mockClear();

    // The Guide library has a Quick reference row.
    const library = rtl.render(React.createElement(GuideLibraryScreen, {}));
    const row = await rtl.waitFor(() => library.getByTestId('guide-library-open-quick-reference'));
    expect(rtl.within(row).getByText('Quick reference')).toBeTruthy();
    expect(rtl.within(row).getByText('Distress signals, radio alphabet, Morse and wind force')).toBeTruthy();
    rtl.fireEvent.press(row);
    expect(mockNavigate).toHaveBeenCalledWith('QuickReference');
    library.unmount();

    // Six cards, all closed.
    const screen = rtl.render(React.createElement(QuickReferenceScreen, {}));
    expect(screen.getByText('Signals, codes and scales to read at a glance. Nothing here needs a model, a download or a signal.')).toBeTruthy();
    const { StyleSheet } = require('react-native');
    const { TYPOGRAPHY } = require('../../../src/constants');
    for (const title of ['Distress signals', 'Ground-to-air signals', 'Radio alphabet', 'Morse code', 'Wind force (Beaufort scale)', 'Radio channels (United States)']) {
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
    // knots these are and whose land signs they are for forces 0 to 11, and "Estimating Wind Speed"
    // (weather.gov/pqr/wind). Both print the same miles an hour for forces 1 to 10 and start force 11 at 64.
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
    // Force 11 has two names as well. Portland's "Storm Force" is not the card's "Storm", which is force 10.
    expect(meaningOf('wind-force', 'Force 11')).toBe('Violent storm, also called storm force, from 64 mph (56 knots). Very rarely experienced; accompanied by wide-spread damage');
    // They disagree on where force 12 starts in miles an hour (Miami prints 72-83, Portland "over 75 mph"), so
    // the card gives knots only and says why. Its land sign is Portland's; Miami only points to another scale.
    expect(meaningOf('wind-force', 'Force 12')).toBe('Hurricane, from 64 knots. Severe and extensive damage');
    expect(screen.getByText('The two tables used here start force 12 at 72 miles an hour and above 75, so it is given in knots only.')).toBeTruthy();
    expect(screen.getByText('These are the signs on land. At sea the scale is read from the waves, which this card leaves out.')).toBeTruthy();
    expect(screen.getByText('US National Weather Service: Beaufort Wind Scale (Miami office) and Estimating Wind Speed (Portland office), as read on 19 November 2026.')).toBeTruthy();
    expect(screen.getByLabelText('Force 8: Gale, 39 to 46 mph (34 to 40 knots). Breaks twigs off trees; generally impedes progress')).toBeTruthy();
    rtl.fireEvent.press(screen.getByText('Wind force (Beaufort scale)'));

    // Radio channels: the frequencies a radio or scanner is set to, in the United States. Typed from the
    // sources as read on 19 November 2026: NOAA's Weather Radio page (weather.gov/nwr), and the FCC's rules in
    // the electronic Code of Federal Regulations, 47 CFR 95.563 (the FRS channel table), 95.567 (FRS power),
    // 95.931 (what CB channel 9 is for) and 95.963 (the CB channel table).
    rtl.fireEvent.press(screen.getByText('Radio channels (United States)'));
    expect(meaningOf('radio-channels', 'Weather radio'))
      .toBe('NOAA Weather Radio broadcasts on seven frequencies: 162.400, 162.425, 162.450, 162.475, 162.500, 162.525 and 162.550 MHz. It needs a receiver or scanner that can pick them up');
    expect(meaningOf('radio-channels', 'CB channel 9')).toBe('27.065 MHz. For emergencies and traveler assistance only');
    const FRS = [
      '462.5625', '462.5875', '462.6125', '462.6375', '462.6625', '462.6875', '462.7125',
      '467.5625', '467.5875', '467.6125', '467.6375', '467.6625', '467.6875', '467.7125',
      '462.5500', '462.5750', '462.6000', '462.6250', '462.6500', '462.6750', '462.7000', '462.7250',
    ];
    FRS.forEach((mhz, index) => { expect(meaningOf('radio-channels', `FRS ${index + 1}`)).toBe(`${mhz} MHz`); });
    expect(screen.queryByTestId('quick-reference-radio-channels-FRS 23')).toBeNull();
    expect(screen.getByText('Any CB channel may be used in an emergency, and emergency calls come first on every channel.')).toBeTruthy();
    // 47 CFR 95.567 sets ceilings ("does not exceed"), so the card says "no more than".
    expect(screen.getByText('An FRS radio puts out no more than 2 watts on channels 1 to 7 and 15 to 22, and no more than half a watt on channels 8 to 14.')).toBeTruthy();
    // The two emergency frequencies of the Distress signals card have rows here that point to it. (They used to
    // be a note, and a search for "distress" or "marine" then listed all 22 FRS channels.)
    expect(meaningOf('radio-channels', 'Marine VHF channel 16')).toBe('156.8 MHz. See the Distress signals card');
    expect(meaningOf('radio-channels', 'Aircraft emergency')).toBe('121.5 MHz. See the Distress signals card');
    expect(screen.queryByText(/are on the Distress signals card/)).toBeNull();
    // The sources are United States ones. They say nothing of other countries, so neither does the card.
    expect(screen.getByText('These are United States channels and rules.')).toBeTruthy();
    expect(screen.queryByText(/other countries/)).toBeNull();
    expect(screen.getByText('NOAA Weather Radio (weather.gov/nwr). FCC rules: 47 CFR 95.563 and 95.567 for FRS, 95.931 and 95.963 for CB. All as read on 19 November 2026.')).toBeTruthy();
  });

  it('finds a sign or a word across every card from the search field', async () => {
    const h = await setupChatScreen({ engine: 'llama', sqlite: true });
    const { React, rtl } = h;
    const { QuickReferenceScreen } = require('../../../src/screens/QuickReferenceScreen');
    const screen = rtl.render(React.createElement(QuickReferenceScreen, {}));
    const search = screen.getByTestId('quick-reference-search');
    expect(search.props.placeholder).toBe('Search the cards, or type a word to spell');
    const meaning = (card: string, sign: string) =>
      String(rtl.within(screen.getByTestId(`quick-reference-${card}-${sign}`)).getByTestId('quick-reference-meaning').props.children);
    const rowsShown = () => screen.queryAllByTestId('quick-reference-meaning').length;

    // One letter finds the sign that is exactly that letter, in every card that has it, and nothing else.
    rtl.fireEvent.changeText(search, 's');
    expect(meaning('radio-alphabet', 'S')).toBe('Sierra');
    expect(meaning('morse', 'S')).toBe('...');
    expect(rowsShown()).toBe(2);
    // Each result sits under its card's name; a card with nothing to show is gone.
    expect(screen.getByText('Radio alphabet')).toBeTruthy();
    expect(screen.getByText('Morse code')).toBeTruthy();
    expect(screen.queryByText('Distress signals')).toBeNull();

    rtl.fireEvent.changeText(search, 'X');
    expect(meaning('ground-to-air', 'X')).toBe('Require medical assistance');
    expect(meaning('radio-alphabet', 'X')).toBe('X-ray');
    expect(meaning('morse', 'X')).toBe('-..-');
    expect(rowsShown()).toBe(3);

    // Two letters or more are looked for inside signs and meanings, whatever their case.
    rtl.fireEvent.changeText(search, 'GALE');
    expect(meaning('wind-force', 'Force 7')).toMatch(/^Near gale/);
    expect(meaning('wind-force', 'Force 8')).toMatch(/^Gale, 39 to 46 mph/);
    expect(rowsShown()).toBe(4);
    rtl.fireEvent.changeText(search, ' mayday ');
    expect(meaning('distress', 'Mayday')).toMatch(/^By voice, when life is in danger/);
    expect(rowsShown()).toBe(1);
    rtl.fireEvent.changeText(search, '462.5625');
    expect(meaning('radio-channels', 'FRS 1')).toBe('462.5625 MHz');
    expect(rowsShown()).toBe(1);

    // A card's notes are searched too: on the Distress card 121.5 MHz is only in a note. A card found by a note
    // alone is shown whole (its 8 rows), because a note read without the rows it is about can mislead. The
    // ninth row is the Radio channels card's pointer to it.
    rtl.fireEvent.changeText(search, '121.5');
    expect(meaning('radio-channels', 'Aircraft emergency')).toBe('121.5 MHz. See the Distress signals card');
    expect(rowsShown()).toBe(9);
    expect(screen.getByText('Distress signals')).toBeTruthy();
    expect(screen.getByText(/Aircraft emergency frequency: 121\.5 MHz/)).toBeTruthy();
    expect(screen.queryByText('Radio alphabet')).toBeNull();
    expect(screen.queryByText('No card has that.')).toBeNull();

    // Nothing found says so. Clearing the field brings the six closed cards back.
    rtl.fireEvent.changeText(search, '§§');
    expect(screen.getByText('No card has that.')).toBeTruthy();
    rtl.fireEvent.changeText(search, '');
    expect(screen.queryByText('No card has that.')).toBeNull();
    expect(screen.getByText('Wind force (Beaufort scale)')).toBeTruthy();
    expect(screen.getByText('Radio alphabet')).toBeTruthy();
    expect(rowsShown()).toBe(0);
  });

  it('never shows a result without its card\'s notes and source, and is forgiving about how a thing is typed', async () => {
    const h = await setupChatScreen({ engine: 'llama', sqlite: true });
    const { React, rtl } = h;
    const { QuickReferenceScreen } = require('../../../src/screens/QuickReferenceScreen');
    const screen = rtl.render(React.createElement(QuickReferenceScreen, {}));
    const search = screen.getByTestId('quick-reference-search');
    const meaning = (card: string, sign: string) =>
      String(rtl.within(screen.getByTestId(`quick-reference-${card}-${sign}`)).getByTestId('quick-reference-meaning').props.children);
    const rowsShown = () => screen.queryAllByTestId('quick-reference-meaning').length;
    const ARMY = 'Some military manuals print a longer code. In the United States Army\'s, X means "unable to proceed" and a single upright stroke means a doctor is needed. The five symbols here are the international civil code.';

    // The ground-to-air X is never shown without the warning that the Army's code gives X another meaning, nor
    // without the standard it comes from. Found by an independent review: a result used to be the bare row.
    rtl.fireEvent.changeText(search, 'medical');
    expect(meaning('ground-to-air', 'X')).toBe('Require medical assistance');
    expect(screen.getByText(ARMY)).toBeTruthy();
    expect(screen.getByText(/at least 2\.5 m \(8 ft\) long/)).toBeTruthy();
    expect(screen.getByText(/ICAO Annex 12/)).toBeTruthy();
    // And the warning is never shown without the row it warns about: a card found by a note alone is shown whole.
    rtl.fireEvent.changeText(search, 'army');
    expect(screen.getByText(ARMY)).toBeTruthy();
    expect(meaning('ground-to-air', 'X')).toBe('Require medical assistance');
    expect(rowsShown()).toBe(7);
    // The same for the other cards: FRS 8 comes with the half-watt note.
    rtl.fireEvent.changeText(search, 'frs 8');
    expect(meaning('radio-channels', 'FRS 8')).toBe('467.5625 MHz');
    expect(rowsShown()).toBe(1);
    expect(screen.getByText(/no more than half a watt on channels 8 to 14/)).toBeTruthy();

    // A card is found by its own name, and by the standard it names, and is then shown whole.
    rtl.fireEvent.changeText(search, 'morse code');
    expect(meaning('morse', 'S')).toBe('...');
    expect(meaning('morse', '9')).toBe('----.');
    rtl.fireEvent.changeText(search, 'beaufort');
    expect(rowsShown()).toBe(13);
    rtl.fireEvent.changeText(search, 'annex 10');
    expect(meaning('radio-alphabet', 'A')).toBe('Alfa');
    expect(screen.queryByText('No card has that.')).toBeNull();

    // A sign is found by its own letters, and two letters are enough.
    rtl.fireEvent.changeText(search, 'frs 10');
    expect(meaning('radio-channels', 'FRS 10')).toBe('467.6125 MHz');
    expect(rowsShown()).toBe(1);
    rtl.fireEvent.changeText(search, 'cb');
    expect(meaning('radio-channels', 'CB channel 9')).toMatch(/^27\.065 MHz/);
    // Two letters look in the rows only. "an" is in the Morse card's note ("letters and seven"), and a card
    // shown whole for that would bury the rows that do hold it; three letters reach names, notes and sources.
    rtl.fireEvent.changeText(search, 'an');
    expect(screen.queryByTestId('quick-reference-morse-S')).toBeNull();
    expect(screen.queryByText('Morse code')).toBeNull();
    expect(meaning('distress', 'Three of anything')).toMatch(/^In North America/);
    // "mor" on the way to "morse" finds the card of that name, and not the radio card for its "no more than".
    rtl.fireEvent.changeText(search, 'mor');
    expect(meaning('morse', 'S')).toBe('...');
    expect(rowsShown()).toBe(49);

    // A sign or a one-word meaning is found whatever its spaces and hyphens.
    rtl.fireEvent.changeText(search, 'pan pan');
    expect(meaning('distress', 'Pan-pan')).toMatch(/^By voice, when it is urgent/);
    expect(rowsShown()).toBe(1);
    rtl.fireEvent.changeText(search, 'xray');
    expect(meaning('radio-alphabet', 'X')).toBe('X-ray');
    expect(rowsShown()).toBe(1);
    rtl.fireEvent.changeText(search, 'frs1');
    expect(meaning('radio-channels', 'FRS 1')).toBe('462.5625 MHz');
    // The sign that is exactly it comes before the ones that start with it.
    expect(screen.getAllByTestId(/^quick-reference-radio-channels-/)[0].props.testID).toBe('quick-reference-radio-channels-FRS 1');
    // "alpha" finds the Radio alphabet by its name: A is "Alfa" there. It does not find the radio channels.
    rtl.fireEvent.changeText(search, 'alpha');
    expect(meaning('radio-alphabet', 'A')).toBe('Alfa');
    expect(rowsShown()).toBe(37);
    // So does the name most people know it by, which the card gives in a note.
    rtl.fireEvent.changeText(search, 'phonetic');
    expect(meaning('radio-alphabet', 'A')).toBe('Alfa');
    expect(screen.getByText('Often called the NATO phonetic alphabet.')).toBeTruthy();
    // A sign is found by its words even with one left out: "cb 9" is CB channel 9.
    rtl.fireEvent.changeText(search, 'cb 9');
    expect(meaning('radio-channels', 'CB channel 9')).toMatch(/^27\.065 MHz/);
    expect(rowsShown()).toBe(1);

    // What is typed is looked for at the start of a word, never across two words or in the middle of one.
    // Each of these used to list rows or whole cards: "signals under", "half a watt", "North America",
    // "considerable", and the f in every "force" and "FRS" for "ph".
    for (const typed of ['sun', 'ham', 'a b', 'nope']) {
      rtl.fireEvent.changeText(search, typed);
      expect({ typed, rows: rowsShown() }).toEqual({ typed, rows: 0 });
    }
    rtl.fireEvent.changeText(search, 'ph');
    expect(meaning('distress', 'Phone')).toMatch(/^112 across the European Union/);
    expect(rowsShown()).toBe(1);
    // A card's notes and source are searched by whole words, and not for words like "and" or "the".
    for (const typed of ['and', 'the', 'not']) {
      rtl.fireEvent.changeText(search, typed);
      expect({ typed, morse: screen.queryByTestId('quick-reference-morse-S') }).toEqual({ typed, morse: null });
    }
    // A number is not found inside a longer one: "8 mph" is not in "13 to 18 mph".
    rtl.fireEvent.changeText(search, '8 mph');
    expect(rowsShown()).toBe(0);
    // And the row whose sign holds the number comes first: Force 10 before "7 to 10 knots".
    rtl.fireEvent.changeText(search, '10');
    expect(screen.getAllByTestId(/^quick-reference-wind-force-/)[0].props.testID).toBe('quick-reference-wind-force-Force 10');

    // Morse typed without its spaces is read back by the spelling, not hunted for across words.
    rtl.fireEvent.changeText(search, '...---...');
    expect(screen.getByText('...---... = SOS')).toBeTruthy();
    // The code that is exactly what was typed comes first: ".-" is A, not the full stop whose sign is ".".
    rtl.fireEvent.changeText(search, '.-');
    expect(screen.getAllByTestId(/^quick-reference-morse-/)[0].props.testID).toBe('quick-reference-morse-A');
    expect(screen.queryByTestId('quick-reference-distress-SOS')).toBeNull();
    // A Morse punctuation mark is found by its name.
    rtl.fireEvent.changeText(search, 'question mark');
    expect(meaning('morse', '?')).toBe('..--..');
    expect(rowsShown()).toBe(1);

    // Numbers. "16" is marine channel 16, FRS 16 and the wind that goes up to 16 knots. It is not the weather
    // frequencies that begin 162, and the Distress card, whose note gives channel 16, is listed with it.
    rtl.fireEvent.changeText(search, '16');
    expect(meaning('radio-channels', 'Marine VHF channel 16')).toMatch(/^156\.8 MHz/);
    expect(meaning('radio-channels', 'FRS 16')).toBe('462.5750 MHz');
    expect(screen.queryByTestId('quick-reference-radio-channels-Weather radio')).toBeNull();
    expect(screen.getByText(/Marine VHF radio: channel 16 \(156\.8 MHz\)/)).toBeTruthy();
    // "46" is the top of force 8, not the start of every FRS frequency.
    rtl.fireEvent.changeText(search, '46');
    expect(meaning('wind-force', 'Force 8')).toMatch(/39 to 46 mph/);
    expect(rowsShown()).toBe(1);
    // The whole-number part of a frequency does find it, and so does a decimal typed part of the way.
    rtl.fireEvent.changeText(search, '462');
    expect(rowsShown()).toBe(15);
    rtl.fireEvent.changeText(search, '162.4');
    expect(meaning('radio-channels', 'Weather radio')).toMatch(/^NOAA Weather Radio/);
    expect(rowsShown()).toBe(1);
    // The day a source was read is not something to find a card by: "november" is N in the radio alphabet.
    rtl.fireEvent.changeText(search, 'november');
    expect(meaning('radio-alphabet', 'N')).toBe('November');
    expect(rowsShown()).toBe(1);
    // "channel 16" and "vhf channel 16" find the marine row by its words.
    rtl.fireEvent.changeText(search, 'vhf channel 16');
    expect(meaning('radio-channels', 'Marine VHF channel 16')).toMatch(/^156\.8 MHz/);
    rtl.fireEvent.changeText(search, 'channel 16');
    expect(meaning('radio-channels', 'Marine VHF channel 16')).toMatch(/^156\.8 MHz/);
    // A frequency typed with more zeros than the card prints is the same number.
    rtl.fireEvent.changeText(search, '121.500');
    expect(meaning('radio-channels', 'Aircraft emergency')).toMatch(/^121\.5 MHz/);
    rtl.fireEvent.changeText(search, '156.800');
    expect(meaning('radio-channels', 'Marine VHF channel 16')).toMatch(/^156\.8 MHz/);
    rtl.fireEvent.changeText(search, '462.5500');
    expect(meaning('radio-channels', 'FRS 15')).toBe('462.5500 MHz');
    // One card's name does not list another card whole.
    rtl.fireEvent.changeText(search, 'marine');
    expect(meaning('radio-channels', 'Marine VHF channel 16')).toMatch(/^156\.8 MHz/);
    expect(screen.queryByTestId('quick-reference-radio-channels-FRS 1')).toBeNull();
    expect(meaning('distress', 'SOS')).toMatch(/^\.\.\. --- \.\.\./);

    // One character also finds a Morse code that is exactly it, and a sign that has it as a word.
    rtl.fireEvent.changeText(search, '.');
    expect(meaning('morse', 'E')).toBe('.');
    expect(meaning('morse', '.')).toBe('.-.-.-');
    expect(rowsShown()).toBe(2);
    rtl.fireEvent.changeText(search, '9');
    expect(meaning('radio-channels', 'CB channel 9')).toMatch(/^27\.065 MHz/);
    expect(meaning('radio-channels', 'FRS 9')).toBe('467.5875 MHz');
    expect(meaning('radio-alphabet', '9')).toBe('Nine, said "niner"');
    expect(meaning('morse', '9')).toBe('----.');
    expect(meaning('wind-force', 'Force 9')).toMatch(/^Strong gale/);
    expect(rowsShown()).toBe(5);

    // The exact code comes first: "..." is S before it is part of B, H or V.
    rtl.fireEvent.changeText(search, '...');
    expect(screen.getAllByTestId(/^quick-reference-morse-/)[0].props.testID).toBe('quick-reference-morse-S');

    // A screen reader is told when nothing is found.
    rtl.fireEvent.changeText(search, '§§');
    expect(screen.getByText('No card has that.').props.accessibilityLiveRegion).toBe('polite');
  });

  it('spells what is typed for the radio and in Morse, and reads Morse back, with no model', async () => {
    const h = await setupChatScreen({ engine: 'llama', sqlite: true });
    const { React, rtl } = h;
    const { QuickReferenceScreen } = require('../../../src/screens/QuickReferenceScreen');
    const screen = rtl.render(React.createElement(QuickReferenceScreen, {}));
    const search = screen.getByTestId('quick-reference-search');
    expect(screen.queryByText('Spelled out')).toBeNull();

    // A call sign: the ICAO spelling alphabet and International Morse, as the Phonetic & Morse tool gives them.
    rtl.fireEvent.changeText(search, 'KD7ABC');
    expect(screen.getByText('Spelled out')).toBeTruthy();
    expect(screen.getByText('KD7ABC = Kilo Delta Seven Alfa Bravo Charlie')).toBeTruthy();
    expect(screen.getByText('Morse: -.- -.. --... .- -... -.-.')).toBeTruthy();
    // A screen reader hears the dots and dashes as words, a letter at a time.
    expect(screen.getByLabelText('Morse: dash dot dash, dash dot dot, dash dash dot dot dot, dot dash, dash dot dot dot, dash dot dash dot')).toBeTruthy();
    // No card holds "KD7ABC", and with a spelling on screen that goes without saying.
    expect(screen.queryByText('No card has that.')).toBeNull();

    // A word is spelled above the rows that hold it.
    rtl.fireEvent.changeText(search, 'gale');
    expect(screen.getByText('gale = Golf Alfa Lima Echo')).toBeTruthy();
    expect(screen.queryAllByTestId('quick-reference-meaning')).toHaveLength(4);

    // Dots and dashes are read back, above the row that holds them.
    rtl.fireEvent.changeText(search, '... --- ...');
    expect(screen.getByText('... --- ... = SOS')).toBeTruthy();
    expect(screen.getByTestId('quick-reference-distress-SOS')).toBeTruthy();

    // One character is answered by the cards alone, and what cannot be spelled shows no spelling.
    rtl.fireEvent.changeText(search, 's');
    expect(screen.queryByText('Spelled out')).toBeNull();
    rtl.fireEvent.changeText(search, '§§');
    expect(screen.queryByText('Spelled out')).toBeNull();
    rtl.fireEvent.changeText(search, '');
    expect(screen.queryByText('Spelled out')).toBeNull();
  });
});
