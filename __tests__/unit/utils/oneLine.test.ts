/**
 * oneLine: typed or file-supplied text as one line of plain text. It is used for names shown in rows and for
 * Kiwix file titles that go into the system prompt, so nothing invisible may ride along.
 */
import { oneLine } from '../../../src/utils/oneLine';

describe('oneLine', () => {
  it('turns runs of white space, tabs and line breaks into single spaces and trims the ends', () => {
    expect(oneLine('  Day \t hike\r\n\n list  ', 60)).toBe('Day hike list');
  });

  it('drops control characters without leaving a double space behind', () => {
    expect(oneLine('a \u0007 b', 60)).toBe('a b');
    expect(oneLine('Kit\u0000\u001b[31m', 60)).toBe('Kit[31m');
    expect(oneLine('caf\u0085e\u009f', 60)).toBe('cafe');
    expect(oneLine('\u0001\u0002\u007f', 60)).toBe('');
  });

  it('drops characters that draw nothing or reorder what follows', () => {
    // A name of only a zero-width space would be an invisible row; a right-to-left override would reverse
    // the count printed after the name.
    expect(oneLine('​', 60)).toBe('');
    expect(oneLine('‮evil‬', 60)).toBe('evil');
    expect(oneLine('⁦a⁩﻿b', 60)).toBe('ab');
  });

  it('keeps ordinary text in any script, and joiners that scripts and emoji need', () => {
    expect(oneLine('Café – ñandú', 60)).toBe('Café – ñandú');
    expect(oneLine('نقشه و قطب‌نما', 60)).toBe('نقشه و قطب‌نما');
    expect(oneLine('First aid 🩹', 60)).toBe('First aid 🩹');
  });

  it('cuts to a number of characters, never through the middle of one, and leaves no space at the end', () => {
    expect(oneLine('abcdefgh', 5)).toBe('abcde');
    expect(oneLine('abcd efgh', 5)).toBe('abcd');
    expect(oneLine('🩹🩹🩹', 2)).toBe('🩹🩹');
    expect(oneLine('x'.repeat(300), 100)).toHaveLength(100);
  });
});
