/**
 * speechText — pure sentence splitting and engine-size chunking for speech.
 */
import { chunkForEngine, splitIntoSentences } from '../../../src/utils/speechText';

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
