/**
 * phonetic_morse: text spelled in the radio alphabet and in International Morse code, and Morse read back.
 *
 * Expected values are the published tables, typed here independently of the code: the ICAO spelling alphabet
 * and the ITU-R M.1677-1 Morse code (both checked against a second source on 18 November 2026), plus the
 * well-known anchors SOS and PARIS.
 */
import { spellOut } from '../../../../src/services/tools/spellTools';

type Args = Record<string, unknown>;
const run = (args: Args) => spellOut({ name: 'phonetic_morse', arguments: args });

const MORSE: Array<[string, string]> = [
  ['A', '.-'], ['B', '-...'], ['C', '-.-.'], ['D', '-..'], ['E', '.'], ['F', '..-.'], ['G', '--.'], ['H', '....'],
  ['I', '..'], ['J', '.---'], ['K', '-.-'], ['L', '.-..'], ['M', '--'], ['N', '-.'], ['O', '---'], ['P', '.--.'],
  ['Q', '--.-'], ['R', '.-.'], ['S', '...'], ['T', '-'], ['U', '..-'], ['V', '...-'], ['W', '.--'], ['X', '-..-'],
  ['Y', '-.--'], ['Z', '--..'],
  ['0', '-----'], ['1', '.----'], ['2', '..---'], ['3', '...--'], ['4', '....-'], ['5', '.....'], ['6', '-....'],
  ['7', '--...'], ['8', '---..'], ['9', '----.'],
  ['.', '.-.-.-'], [',', '--..--'], [':', '---...'], ['?', '..--..'], ["'", '.----.'], ['-', '-....-'],
  ['/', '-..-.'], ['(', '-.--.'], [')', '-.--.-'], ['"', '.-..-.'], ['=', '-...-'], ['+', '.-.-.'], ['@', '.--.-.'],
];

describe('phonetic_morse', () => {
  describe('the radio alphabet', () => {
    it('spells every letter with its ICAO word', () => {
      expect(run({ text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', to: 'phonetic' })).toBe(
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ = Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike '
        + 'November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu',
      );
    });

    it('spells digits as words and the point in a number as Decimal', () => {
      expect(run({ text: '146.52', to: 'phonetic' })).toBe('146.52 = One Four Six Decimal Five Two');
      expect(run({ text: '0123456789', to: 'phonetic' })).toBe('0123456789 = Zero One Two Three Four Five Six Seven Eight Nine');
      expect(run({ text: '.5', to: 'phonetic' })).toBe('.5 = Decimal Five');
      // A full stop that is not a decimal point has no radio word.
      expect(run({ text: 'v2. ok', to: 'phonetic' })).toBe('v2. ok = Victor Two / Oscar Kilo (left out: .)');
    });

    it('spells a number the model passed as a number', () => {
      expect(run({ text: 73, to: 'phonetic' })).toBe('73 = Seven Three');
    });

    it('reads lower case, marks the gap between words, and says Slash and Dash', () => {
      expect(run({ text: 'kd7 abc', to: 'phonetic' })).toBe('kd7 abc = Kilo Delta Seven / Alfa Bravo Charlie');
      expect(run({ text: 'W1AW/P', to: 'phonetic' })).toBe('W1AW/P = Whiskey One Alfa Whiskey Slash Papa');
      expect(run({ text: 'X-1', to: 'phonetic' })).toBe('X-1 = X-ray Dash One');
    });

    it('spells an accented letter as its plain letter', () => {
      expect(run({ text: 'café', to: 'phonetic' })).toBe('café = Charlie Alfa Foxtrot Echo');
    });

    it('names what it left out instead of dropping it silently', () => {
      expect(run({ text: 'OK! #2', to: 'phonetic' })).toBe('OK! #2 = Oscar Kilo / Two (left out: ! #)');
    });

    it('takes the accent off a letter only: a sign that merely contains another sign is left out', () => {
      // "≠" is "=" with a stroke through it as far as Unicode's decomposition goes. It is not an equals sign.
      expect(run({ text: '2≠1', to: 'morse' })).toBe('2≠1 = ..--- .---- (left out: ≠)');
      expect(run({ text: `cafe${String.fromCodePoint(0x301)}`, to: 'phonetic' })).toBe(`cafe${String.fromCodePoint(0x301)} = Charlie Alfa Foxtrot Echo`);
      expect(run({ text: 'Ångström', to: 'phonetic' })).toBe('Ångström = Alfa November Golf Sierra Tango Romeo Oscar Mike');
    });

    it('accepts "both" for both spellings', () => {
      expect(run({ text: 'SOS', to: 'both' })).toBe('SOS = Sierra Oscar Sierra\nMorse: ... --- ...');
    });
  });

  describe('into Morse', () => {
    it('gives the well-known anchors', () => {
      expect(run({ text: 'SOS', to: 'morse' })).toBe('SOS = ... --- ...');
      expect(run({ text: 'PARIS', to: 'morse' })).toBe('PARIS = .--. .- .-. .. ...');
      // A small model may capitalise the choice.
      expect(run({ text: 'SOS', to: ' Morse ' })).toBe('SOS = ... --- ...');
    });

    it.each(MORSE)('codes %s as %s', (char, code) => {
      expect(run({ text: `E${char}E`, to: 'morse' })).toBe(`E${char}E = . ${code} .`);
    });

    it('puts one space between letters and a slash between words', () => {
      expect(run({ text: 'sos help', to: 'morse' })).toBe('sos help = ... --- ... / .... . .-.. .--.');
    });

    it('names a character that has no code in the international set', () => {
      expect(run({ text: 'GO! NOW', to: 'morse' })).toBe('GO! NOW = --. --- / -. --- .-- (left out: !)');
    });
  });

  describe('both at once', () => {
    it('gives the radio words and the Morse when not told which', () => {
      expect(run({ text: 'KD7ABC' })).toBe('KD7ABC = Kilo Delta Seven Alfa Bravo Charlie\nMorse: -.- -.. --... .- -... -.-.');
    });
  });

  describe('reading Morse', () => {
    it('reads letters and words back', () => {
      expect(run({ text: '... --- ... / .... . .-.. .--.' })).toBe('... --- ... / .... . .-.. .--. = SOS HELP');
    });

    it.each(MORSE)('reads %s from %s', (char, code) => {
      expect(run({ text: `. ${code} .` })).toBe(`. ${code} . = E${char}E`);
    });

    it('reads Morse whichever spelling was asked for', () => {
      expect(run({ text: '.--. .- .-. .. ...', to: 'morse' })).toBe('.--. .- .-. .. ... = PARIS');
      expect(run({ text: '.--. .- .-. .. ...', to: 'phonetic' })).toBe('.--. .- .-. .. ... = PARIS');
    });

    it('reads the distress signal sent as one run', () => {
      expect(run({ text: '...---...' })).toBe('...---... = SOS');
    });

    it('reads typed dots and dashes of other kinds, and wide gaps between words', () => {
      expect(run({ text: '··· ——— ···' })).toBe('... --- ... = SOS');
      expect(run({ text: '•• –– __' })).toBe('.. -- -- = IMM');
      expect(run({ text: '-. ---   --. ---' })).toBe('-. --- / --. --- = NO GO');
      expect(run({ text: '-. --- | --. ---' })).toBe('-. --- / --. --- = NO GO');
    });

    it('reads Morse that arrives wrapped, labelled or with the keyboard\'s own ellipsis', () => {
      expect(run({ text: '"... --- ..."' })).toBe('... --- ... = SOS');
      expect(run({ text: '`.- -...`' })).toBe('.- -... = AB');
      expect(run({ text: 'Morse: .- -...' })).toBe('.- -... = AB');
      expect(run({ text: 'morse code: ... --- ...' })).toBe('... --- ... = SOS');
      // A phone keyboard turns three full stops into one ellipsis character.
      expect(run({ text: '… --- …' })).toBe('... --- ... = SOS');
      expect(run({ text: `... --- ...${String.fromCodePoint(0x200b)}` })).toBe('... --- ... = SOS');
    });

    it('takes a next-line control between two runs of Morse as the line break it is', () => {
      const nextLine = String.fromCodePoint(0x85);
      expect(run({ text: `... --- ...${nextLine}.... . .-.. .--.` })).toBe('... --- ... / .... . .-.. .--. = SOS HELP');
      // A braille blank is a space: here, the gap between two letters.
      expect(run({ text: `.-${String.fromCodePoint(0x2800)}-...` })).toBe('.- -... = AB');
    });

    it('reads Morse whatever "to" says, since "to" is about spelling', () => {
      expect(run({ text: '... --- ...', to: 'text' })).toBe('... --- ... = SOS');
      expect(run({ text: '... --- ...', to: 'english' })).toBe('... --- ... = SOS');
    });

    it('refuses Morse with other characters in it, instead of spelling its dots as full stops', () => {
      const stray = (found: string) => `That looks like Morse code with other characters in it (${found}). Send only dots, dashes, spaces and / between words.`;
      expect(() => run({ text: '... --- ... x' })).toThrow(stray('x'));
      expect(() => run({ text: '.-. .- -.. .. ---!' })).toThrow(stray('!'));
      expect(() => run({ text: '.- -... ?', to: 'morse' })).toThrow(stray('?'));
      // Ordinary text with a few marks in it is still spelled.
      expect(run({ text: 'a - b', to: 'phonetic' })).toBe('a - b = Alfa / Dash / Bravo');
      expect(run({ text: '1-2', to: 'phonetic' })).toBe('1-2 = One Dash Two');
    });

    it('gives both readings of a lone mark, which is a letter in Morse and a character to spell', () => {
      expect(run({ text: '.', to: 'morse' })).toBe('. can be read two ways.\nAs Morse: . = E\nAs the character itself: . = .-.-.-');
      expect(run({ text: '-', to: 'phonetic' })).toBe('- can be read two ways.\nAs Morse: - = T\nAs the character itself: - = Dash');
      expect(run({ text: ' - ' })).toBe('- can be read two ways.\nAs Morse: - = T\nAs the character itself: - = Dash\nMorse: -....-');
      // A full stop by itself has no radio word, and a long dash has no code of its own: one reading only.
      expect(run({ text: '.', to: 'phonetic' })).toBe('. = E');
      expect(run({ text: '—' })).toBe('- = T');
      // Two or more marks are Morse.
      expect(run({ text: '...' })).toBe('... = S');
      expect(run({ text: '---', to: 'morse' })).toBe('--- = O');
    });

    it('marks a code it does not know and says how many', () => {
      expect(run({ text: '... ........ ...' })).toBe('... ........ ... = S?S (1 code not recognised, shown as ?)');
      expect(run({ text: '........ ---------' })).toBe('........ --------- = ?? (2 codes not recognised, shown as ?)');
    });
  });

  describe('what it refuses', () => {
    it.each([
      [{}, 'Give the text to spell, or the Morse code to read.'],
      [{ text: '   ' }, 'Give the text to spell, or the Morse code to read.'],
      [{ text: { a: 1 } }, 'Give the text to spell, or the Morse code to read.'],
      [{ text: 'x'.repeat(201) }, 'That is too long to spell out: 200 characters at most.'],
      [{ text: '.- '.repeat(401) }, 'That is too long to read: 1200 characters of Morse at most.'],
      [{ text: 'SOS', to: 'semaphore' }, 'to must be "phonetic" or "morse", or left out for both.'],
      [{ text: '!!!', to: 'morse' }, 'Nothing in that can be spelled: use letters and digits.'],
    ])('%j', (args, message) => {
      expect(() => run(args as Args)).toThrow(message);
    });

    it('keeps control characters out of its answer', () => {
      expect(run({ text: 'A\u0007B\nC', to: 'phonetic' })).toBe('AB C = Alfa Bravo / Charlie');
    });
  });
});
