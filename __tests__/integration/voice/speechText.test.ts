/**
 * speechText — pure sentence splitting and engine-size chunking for speech.
 */
import { chunkForEngine, splitIntoSentences, stableSpeakablePrefix, unreadSentences } from '../../../src/utils/speechText';

describe('splitIntoSentences', () => {
  it('splits after . ! ? followed by whitespace', () => {
    expect(splitIntoSentences('One. Two! Three? Four.')).toEqual(['One.', 'Two!', 'Three?', 'Four.']);
  });

  it('keeps a final piece without end punctuation', () => {
    expect(splitIntoSentences('First one. and then no stop')).toEqual(['First one.', 'and then no stop']);
  });

  it('splits at newlines, trims, and drops empty pieces', () => {
    expect(splitIntoSentences('Title\n\n  Line two  \r\nLine three.\n')).toEqual(['Title', 'Line two', 'Line three.']);
  });

  it('splits only where the punctuation is followed by whitespace: not inside numbers or punctuation runs', () => {
    expect(splitIntoSentences('Pi is 3.14 today. Wait... what?! Yes.')).toEqual(['Pi is 3.14 today.', 'Wait...', 'what?!', 'Yes.']);
  });

  it('keeps repeated sentences as separate pieces', () => {
    expect(splitIntoSentences('Yes. Yes. Done.')).toEqual(['Yes.', 'Yes.', 'Done.']);
  });

  it('returns nothing for empty or blank text', () => {
    expect(splitIntoSentences('')).toEqual([]);
    expect(splitIntoSentences(' \n \n')).toEqual([]);
  });
});

describe('chunkForEngine', () => {
  it('never merges sentences', () => {
    expect(chunkForEngine({ sentences: ['A.', 'B.', 'C.'], maxLen: 100 })).toEqual(['A.', 'B.', 'C.']);
  });

  it('cuts a long sentence at the last whitespace at or before maxLen', () => {
    // 'aaaa bbbb cccc' with maxLen 9: the last space at or before index 9 is at 9 (after 'bbbb').
    expect(chunkForEngine({ sentences: ['aaaa bbbb cccc'], maxLen: 9 })).toEqual(['aaaa bbbb', 'cccc']);
    // maxLen 8: the space at index 4 is the last one at or before 8.
    expect(chunkForEngine({ sentences: ['aaaa bbbb cccc'], maxLen: 8 })).toEqual(['aaaa', 'bbbb', 'cccc']);
  });

  it('hard-cuts a sentence that has no whitespace', () => {
    expect(chunkForEngine({ sentences: ['abcdefghij'], maxLen: 4 })).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('processes the rest of a cut sentence the same way, in order', () => {
    const chunks = chunkForEngine({ sentences: ['one two three four five six seven eight nine ten.'], maxLen: 15 });
    expect(chunks).toEqual(['one two three', 'four five six', 'seven eight', 'nine ten.']);
    expect(chunks.every(c => c.length <= 15 && c === c.trim() && c.length > 0)).toBe(true);
  });

  it('does not split a surrogate pair on a hard cut', () => {
    const chunks = chunkForEngine({ sentences: ['ab\u{1F600}cd'], maxLen: 3 });
    expect(chunks.join('')).toBe('ab\u{1F600}cd');
    expect(chunks.every(c => !/[\ud800-\udbff]$/.test(c) && !/^[\udc00-\udfff]/.test(c))).toBe(true);
  });

  it('survives a maxLen below 1', () => {
    expect(chunkForEngine({ sentences: ['abc'], maxLen: 0 })).toEqual(['a', 'b', 'c']);
  });

  it('drops blank sentences', () => {
    expect(chunkForEngine({ sentences: ['', '  ', 'Hi.'], maxLen: 10 })).toEqual(['Hi.']);
  });
});

describe('stableSpeakablePrefix', () => {
  it('returns text with no open construct unchanged', () => {
    expect(stableSpeakablePrefix('Plain text. **Bold** and `code` and ```fence``` done.')).toBe('Plain text. **Bold** and `code` and ```fence``` done.');
  });

  it('cuts before an unclosed code fence', () => {
    expect(stableSpeakablePrefix('Intro. ```js\nfoo.bar(). b')).toBe('Intro. ');
    expect(stableSpeakablePrefix('A.\n```\ncode\n```\nB.\n```py\nx')).toBe('A.\n```\ncode\n```\nB.\n');
  });

  it('cuts before an unclosed ** or __', () => {
    expect(stableSpeakablePrefix('Said **loud and')).toBe('Said ');
    expect(stableSpeakablePrefix('**One** and **two')).toBe('**One** and ');
    expect(stableSpeakablePrefix('A __deep end')).toBe('A ');
  });

  it('cuts before an unclosed single backtick, but not one inside a closed fence', () => {
    expect(stableSpeakablePrefix('Call `foo(')).toBe('Call ');
    expect(stableSpeakablePrefix('Use `a` then `b')).toBe('Use `a` then ');
    expect(stableSpeakablePrefix('```\nit`s\n``` ok')).toBe('```\nit`s\n``` ok');
  });

  it('ignores ** and __ inside a closed fence', () => {
    expect(stableSpeakablePrefix('```\na ** b __ c\n``` after')).toBe('```\na ** b __ c\n``` after');
  });

  it('cuts at the earliest open construct', () => {
    expect(stableSpeakablePrefix('Go `x and **y')).toBe('Go ');
    expect(stableSpeakablePrefix('Go **y and `x ```z')).toBe('Go ');
  });

  it('returns an empty string for empty text', () => {
    expect(stableSpeakablePrefix('')).toBe('');
  });
});

describe('unreadSentences', () => {
  const sentences = ['A.', 'B.', 'C.', 'D.'];

  it('continues after the sentences that were read', () => {
    expect(unreadSentences({ sentences, spokenCount: 2, lastSpoken: 'B.' })).toEqual({ rest: ['C.', 'D.'], aligned: true });
    expect(unreadSentences({ sentences, spokenCount: 0, lastSpoken: null })).toEqual({ rest: sentences, aligned: true });
  });

  it('has nothing left when everything was read', () => {
    expect(unreadSentences({ sentences, spokenCount: 4, lastSpoken: 'D.' })).toEqual({ rest: [], aligned: true });
  });

  it('continues after the last occurrence of the last read sentence when the count no longer lines up', () => {
    expect(unreadSentences({ sentences: ['X.', 'A.', 'B.', 'C.'], spokenCount: 2, lastSpoken: 'B.' })).toEqual({ rest: ['C.'], aligned: false });
    expect(unreadSentences({ sentences: ['B.', 'A.', 'B.', 'C.'], spokenCount: 2, lastSpoken: 'B.' })).toEqual({ rest: ['C.'], aligned: false });
  });

  it('reads nothing when the last read sentence is gone', () => {
    expect(unreadSentences({ sentences: ['X.', 'Y.'], spokenCount: 2, lastSpoken: 'B.' })).toEqual({ rest: [], aligned: false });
  });
});
