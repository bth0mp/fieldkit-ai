/**
 * Quick reference cards: signals, codes and scales to read at a glance, with no model, download or network. The
 * wording is ours; the facts are published standards, named on each card. Nothing medical and nothing with a
 * dose belongs here, and a number goes on a card only as its source prints it: a wrong number on a card is
 * worse than no card.
 */
import { MORSE_CODES, RADIO_WORDS } from '../../services/tools/spellTools';

interface ReferenceRow {
  sign: string;
  meaning: string;
  /** How a screen reader should say the meaning, where the printed form is not words. */
  spoken?: string;
  /** How a screen reader should say the sign, where it is a bare mark it would pass over. */
  spokenSign?: string;
}

export interface ReferenceCard {
  id: string;
  title: string;
  rows: ReadonlyArray<ReferenceRow>;
  notes: string[];
  source: string;
}

/** How ICAO says the four digits that are not said as written. */
const SAID = new Map([['3', 'tree'], ['4', 'fower'], ['5', 'fife'], ['9', 'niner']]);
/** ".-" read out as "dot dash": a screen reader would skip or mangle the marks. */
const speakMorse = (code: string) => [...code].map(mark => (mark === '.' ? 'dot' : 'dash')).join(' ');
/** The punctuation marks Morse has codes for, by name. */
const MARK_NAMES = new Map([
  ['.', 'full stop'], [',', 'comma'], [':', 'colon'], ['?', 'question mark'], ["'", 'apostrophe'], ['-', 'hyphen'],
  ['/', 'slash'], ['(', 'opening bracket'], [')', 'closing bracket'], ['"', 'quotation mark'], ['=', 'equals sign'],
  ['+', 'plus sign'], ['@', 'at sign'],
]);

/** The centre frequency of each Family Radio Service channel, 1 to 22, as 47 CFR 95.563 tabulates them. */
const FRS_MHZ = [
  '462.5625', '462.5875', '462.6125', '462.6375', '462.6625', '462.6875', '462.7125',
  '467.5625', '467.5875', '467.6125', '467.6375', '467.6625', '467.6875', '467.7125',
  '462.5500', '462.5750', '462.6000', '462.6250', '462.6500', '462.6750', '462.7000', '462.7250',
];

export const QUICK_REFERENCE_CARDS: ReferenceCard[] = [
  {
    id: 'distress',
    title: 'Distress signals',
    rows: [
      {
        sign: 'SOS',
        meaning: '... --- ... by light, sound or radio, sent as one run: three short, three long, three short, then a pause',
        spoken: 'three dots, three dashes, three dots, by light, sound or radio, sent as one run, then a pause',
      },
      { sign: 'Mayday', meaning: 'By voice, when life is in danger: "Mayday, Mayday, Mayday", then who you are, where you are and what is wrong' },
      { sign: 'Pan-pan', meaning: 'By voice, when it is urgent but no life is in immediate danger: "Pan-pan" three times, then the same details' },
      { sign: 'Whistle or light', meaning: "The Alpine signal, used in Europe's mountains: six blasts or flashes in a minute, then a minute's pause, repeated. The answer is three in a minute" },
      { sign: 'Three of anything', meaning: 'In North America, three blasts, shots or fires, repeated, are read as a call for help' },
      { sign: 'Arms', meaning: 'Slowly raising and lowering both arms held out to the sides, again and again' },
      { sign: 'Flare or smoke', meaning: 'A red flare or orange smoke' },
      { sign: 'Phone', meaning: '112 across the European Union and in some other countries; 911 in the United States and Canada. Learn the local emergency number before you travel' },
    ],
    notes: [
      'Marine VHF radio: channel 16 (156.8 MHz). Aircraft emergency frequency: 121.5 MHz. Each needs a radio for that band. A 406 MHz beacon alerts rescue services by satellite.',
      'Use these only when you need help: a false distress signal sends rescuers out.',
    ],
    source: 'SOS, Mayday, the arm signal, the flare and the smoke are distress signals under Annex IV of the International Regulations for Preventing Collisions at Sea. Pan-pan is the urgency signal of marine and aircraft radio. The whistle signal is the Alpine distress signal. The rule of three is North American custom, not a published standard.',
  },
  {
    id: 'ground-to-air',
    title: 'Ground-to-air signals',
    rows: [
      { sign: 'V', meaning: 'Require assistance' },
      { sign: 'X', meaning: 'Require medical assistance' },
      { sign: 'N', meaning: 'No' },
      { sign: 'Y', meaning: 'Yes' },
      { sign: 'Arrow', meaning: 'Proceeding in the direction it points' },
      { sign: 'Both arms up', meaning: 'To an aircraft: yes, we need help (the body makes a Y)' },
      { sign: 'One arm up, one down', meaning: 'To an aircraft: no, we do not need help (the body makes an N)' },
    ],
    notes: [
      'Lay the symbols out on open ground, at least 2.5 m (8 ft) long, in a colour that stands out from the ground.',
      'An aircraft that has understood rocks its wings by day, or flashes its landing or navigation lights twice at night. No such answer means it has not understood.',
      // The two codes disagree on X, and a guide in the library prints the Army's: a reader of both must be told.
      'Some military manuals print a longer code. In the United States Army\'s, X means "unable to proceed" and a single upright stroke means a doctor is needed. The five symbols here are the international civil code.',
    ],
    source: 'Symbols and aircraft answers from ICAO Annex 12 (Search and Rescue), the ground-air visual signal code for survivors. The arm signals are the usual mountain-rescue convention. The longer code is in US Army TC 21-3 (2025), Appendix C.',
  },
  {
    id: 'radio-alphabet',
    title: 'Radio alphabet',
    rows: [
      ...RADIO_WORDS.map(([sign, word]) => ({ sign, meaning: SAID.has(sign) ? `${word}, said "${SAID.get(sign)}"` : word })),
      { sign: 'Point', meaning: 'Decimal, in a number' },
    ],
    notes: ['Spell a word letter by letter: "KD7" is Kilo Delta Seven.'],
    source: 'The ICAO radiotelephony spelling alphabet (Annex 10). NATO and the ITU use the same letter words.',
  },
  {
    id: 'morse',
    title: 'Morse code',
    rows: MORSE_CODES.map(([sign, meaning]) => ({ sign, meaning, spoken: speakMorse(meaning), spokenSign: MARK_NAMES.get(sign) })),
    notes: ['A dash lasts three dots. Leave one dot of silence inside a letter, three between letters and seven between words.'],
    source: 'International Morse code, ITU-R M.1677-1.',
  },
  {
    // Two National Weather Service tables, read 19 November 2026: weather.gov/mfl/beaufort (the land signs and
    // the knots) and weather.gov/pqr/wind. A figure is given only where the two agree or only one prints it.
    id: 'wind-force',
    title: 'Wind force (Beaufort scale)',
    rows: [
      { sign: 'Force 0', meaning: 'Calm. Smoke rises vertically' },
      { sign: 'Force 1', meaning: 'Light air, 1 to 3 mph (1 to 3 knots). Direction of wind shown by smoke drift, but not by wind vanes' },
      { sign: 'Force 2', meaning: 'Light breeze, 4 to 7 mph (4 to 6 knots). Wind felt on face; leaves rustle; ordinary vanes moved by wind' },
      { sign: 'Force 3', meaning: 'Gentle breeze, 8 to 12 mph (7 to 10 knots). Leaves and small twigs in constant motion; wind extends light flag' },
      { sign: 'Force 4', meaning: 'Moderate breeze, 13 to 18 mph (11 to 16 knots). Raises dust and loose paper; small branches are moved' },
      { sign: 'Force 5', meaning: 'Fresh breeze, 19 to 24 mph (17 to 21 knots). Small trees in leaf begin to sway; crested wavelets form on inland waters' },
      { sign: 'Force 6', meaning: 'Strong breeze, 25 to 31 mph (22 to 27 knots). Large branches in motion; whistling heard in telegraph wires; umbrellas used with difficulty' },
      { sign: 'Force 7', meaning: 'Near gale, 32 to 38 mph (28 to 33 knots). Whole trees in motion; inconvenience felt when walking against the wind' },
      { sign: 'Force 8', meaning: 'Gale, 39 to 46 mph (34 to 40 knots). Breaks twigs off trees; generally impedes progress' },
      { sign: 'Force 9', meaning: 'Strong gale, also called severe gale, 47 to 54 mph (41 to 47 knots). Slight structural damage occurs (chimney-pots and slates removed)' },
      { sign: 'Force 10', meaning: 'Storm, also called whole gale, 55 to 63 mph (48 to 55 knots). Seldom experienced inland; trees uprooted; considerable structural damage occurs' },
      { sign: 'Force 11', meaning: 'Violent storm, from 64 mph (56 knots). Very rarely experienced; accompanied by wide-spread damage' },
      { sign: 'Force 12', meaning: 'Hurricane, from 64 knots. Severe and extensive damage' },
    ],
    notes: [
      'These are the signs on land. At sea the scale is read from the waves, which this card leaves out.',
      'The two tables used here put the start of force 12 at 72 and at 75 miles an hour, so it is given in knots only.',
    ],
    source: 'US National Weather Service: Beaufort Wind Scale (Miami office) and Estimating Wind Speed (Portland office), as read on 19 November 2026.',
  },
  {
    // Read 19 November 2026: weather.gov/nwr for the weather frequencies; the electronic Code of Federal
    // Regulations for the rest (47 CFR 95.563 the FRS channel table, 95.567 FRS power, 95.931(a) emergencies on
    // CB and what channel 9 is for, 95.963 the CB channel table).
    id: 'radio-channels',
    title: 'Radio channels (United States)',
    rows: [
      { sign: 'Weather radio', meaning: 'NOAA Weather Radio broadcasts on seven frequencies: 162.400, 162.425, 162.450, 162.475, 162.500, 162.525 and 162.550 MHz. Listening only' },
      { sign: 'CB channel 9', meaning: '27.065 MHz. For emergencies and traveler assistance only' },
      ...FRS_MHZ.map((mhz, index) => ({ sign: `FRS ${index + 1}`, meaning: `${mhz} MHz` })),
    ],
    notes: [
      'Any CB channel may be used in an emergency, and emergency calls come first on every channel.',
      'An FRS radio may put out 2 watts on channels 1 to 7 and 15 to 22, and half a watt on channels 8 to 14.',
      'Marine VHF channel 16 and the aircraft emergency frequency are on the Distress signals card.',
      'These are United States channels and rules. They do not hold in other countries.',
    ],
    source: 'NOAA Weather Radio (weather.gov/nwr). FCC rules: 47 CFR 95.563 and 95.567 for FRS, 95.931 and 95.963 for CB. All as read on 19 November 2026.',
  },
];

/**
 * What a search of the cards finds, card by card: the rows whose sign or meaning holds the words typed, and the
 * notes that do. One character finds only a sign that is exactly it ("s" is S in the radio alphabet and in
 * Morse, not every row with an s in it).
 */
export function searchCards(query: string) {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return [];
  const holds = (text: string) => wanted.length > 1 && text.toLowerCase().includes(wanted);
  return QUICK_REFERENCE_CARDS
    .map(card => ({
      card,
      rows: card.rows.filter(row => row.sign.toLowerCase() === wanted || holds(row.sign) || holds(row.meaning)),
      notes: card.notes.filter(holds),
    }))
    .filter(found => found.rows.length > 0 || found.notes.length > 0);
}
