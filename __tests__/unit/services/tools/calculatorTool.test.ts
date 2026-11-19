/**
 * The calculator tool with what a person types into the Calculators screen, not only what a model sends. The
 * expected values are ordinary arithmetic. An independent review on 19 November 2026 found each of these wrong:
 * until that night only a model reached this tool, and a model does not type "1 1/2".
 */
import { executeToolCall } from '../../../../src/services/tools';

const run = async (expression: string) => {
  const result = await executeToolCall({ name: 'calculator', arguments: { expression } });
  return result.error ? `ERROR ${result.error}` : result.content;
};

describe('calculator', () => {
  it('does not glue two numbers together across a space', async () => {
    // "1 1/2" used to be read as 11/2 and answered 5.5.
    expect(await run('1 1/2')).toBe('ERROR Put an operator between the numbers: a space is not one.');
    expect(await run('5 5')).toBe('ERROR Put an operator between the numbers: a space is not one.');
    expect(await run('10 - 5 5')).toMatch(/^ERROR Put an operator between the numbers/);
    expect(await run('2 (3)')).toMatch(/^ERROR Put an operator between the numbers/);
    // Spaces round an operator are fine, and the answer repeats the sum without the spaces at its ends.
    expect(await run('7 * 7')).toBe('7 * 7 = 49');
    expect(await run('  1 + 1/2 ')).toBe('1 + 1/2 = 1.5');
  });

  it('ranks a leading minus below a power, as arithmetic does', async () => {
    // "-2^2" used to be 4, and "2*-2^2" 8.
    expect(await run('-2^2')).toBe('-2^2 = -4');
    expect(await run('2*-2^2')).toBe('2*-2^2 = -8');
    expect(await run('0-2^2')).toBe('0-2^2 = -4');
    expect(await run('(-2)^2')).toBe('(-2)^2 = 4');
    expect(await run('2^-1')).toBe('2^-1 = 0.5');
    // A tower of powers still works from the right: 2^(3^2).
    expect(await run('2^3^2')).toBe('2^3^2 = 512');
    expect(await run('-2^0.5')).toBe('-2^0.5 = -1.4142135623731');
    expect(await run('2^(1+1)')).toBe('2^(1+1) = 4');
  });

  it('does not show the dust of binary fractions', async () => {
    // These used to end ...99999999999994, ...0000000004 and so on.
    expect(await run('4.35*100')).toBe('4.35*100 = 435');
    expect(await run('0.1+0.2')).toBe('0.1+0.2 = 0.3');
    expect(await run('100*1.1')).toBe('100*1.1 = 110');
    expect(await run('1/3')).toBe('1/3 = 0.333333333333333');
    expect(await run('500*321')).toBe('500*321 = 160500');
  });

  it('says "about" when a result is too big to be exact, and never changes its whole-number part', async () => {
    // The true product is 121932631112635269; a double cannot hold its last digits.
    expect(await run('123456789*987654321')).toBe('123456789*987654321 = about 121932631112635260');
    expect(await run('9007199254740991+0')).toBe('9007199254740991+0 = 9007199254740991');
    // A second review found the first rounding shortened these to ...990 with no "about": a sum smaller than
    // its first term.
    expect(await run('2^53')).toBe('2^53 = about 9007199254740992');
    expect(await run('9007199254740991+1')).toBe('9007199254740991+1 = about 9007199254740992');
    expect(await run('9007199254740991/2')).toBe('9007199254740991/2 = about 4503599627370495.5');
    expect(await run('1234567890123456+0.5')).toBe('1234567890123456+0.5 = about 1234567890123456.5');
    // Below a thousand million million a result is rounded to fifteen digits and is plain.
    expect(await run('999999999999999+0.5')).toBe('999999999999999+0.5 = about 999999999999999.5');
    expect(await run('99999999999999+0.5')).toBe('99999999999999+0.5 = 99999999999999.5');
    // The largest numbers there are do not come out as "Infinity".
    expect(await run('1.7976931348623157*10^308')).toMatch(/= about 1\.7976931348623157e\+308$/);
  });

  it('gives the remainder of decimal fractions as arithmetic does', async () => {
    // These came out as the divisor itself (0.1, 1.1, 0.8): a remainder can never equal what was divided by.
    expect(await run('1%0.1')).toBe('1%0.1 = 0');
    expect(await run('0.3%0.1')).toBe('0.3%0.1 = 0');
    expect(await run('5.5%1.1')).toBe('5.5%1.1 = 0');
    expect(await run('2.4%0.8')).toBe('2.4%0.8 = 0');
    expect(await run('0.9%0.3')).toBe('0.9%0.3 = 0');
    expect(await run('7.5%2')).toBe('7.5%2 = 1.5');
    expect(await run('1%0.3')).toBe('1%0.3 = 0.1');
    expect(await run('17%5')).toBe('17%5 = 2');
  });

  it('gives zero where decimal fractions cancel, and keeps a real small difference', async () => {
    expect(await run('0.1+0.2-0.3')).toBe('0.1+0.2-0.3 = 0');
    expect(await run('1-0.9-0.1')).toBe('1-0.9-0.1 = 0');
    expect(await run('4.35*100-435')).toBe('4.35*100-435 = 0');
    expect(await run('1.1+2.2-3.3')).toBe('1.1+2.2-3.3 = 0');
    // Whole numbers and halves are exact: their small differences are real.
    expect(await run('1000000000000000-999999999999999')).toBe('1000000000000000-999999999999999 = 1');
    expect(await run('100000000000000.5-100000000000000')).toBe('100000000000000.5-100000000000000 = 0.5');
    expect(await run('0.5-0.25')).toBe('0.5-0.25 = 0.25');
    expect(await run('0.001-0.0001')).toBe('0.001-0.0001 = 0.0009');
  });

  it('refuses a division by zero wherever it is in the sum', async () => {
    // "1/(1/0)" used to answer 0, and "10/(5/0)+3" answered 3.
    for (const sum of ['1/0', '1/(1/0)', '10/(5/0)+3', '5%0', '5%(1/0)', '2^-(1/0)', '0/0']) {
      expect({ sum, answer: await run(sum) }).toEqual({ sum, answer: 'ERROR Cannot divide by zero.' });
    }
    expect(await run('0/5')).toBe('0/5 = 0');
  });

  it('names a number that is not one', async () => {
    expect(await run('1.2.3')).toBe('ERROR That is not a number: 1.2.3');
    expect(await run('2+.')).toBe('ERROR That is not a number: .');
    expect(await run('.5+.5')).toBe('.5+.5 = 1');
    expect(await run('5.')).toBe('5. = 5');
  });

  it('takes the multiply, divide and minus signs a phone keyboard offers', async () => {
    const [times, divide, minus] = [0xd7, 0xf7, 0x2212].map(code => String.fromCodePoint(code));
    expect(await run(`2${times}3`)).toBe(`2${times}3 = 6`);
    expect(await run(`10 ${divide} 4`)).toBe(`10 ${divide} 4 = 2.5`);
    expect(await run(`5${minus}7`)).toBe(`5${minus}7 = -2`);
  });

  it('says what is wrong with a comma', async () => {
    expect(await run('1,5+1')).toBe('ERROR Use a decimal point and no commas in numbers, for example 1.5 or 1000.');
    expect(await run('1,000+1')).toBe('ERROR Use a decimal point and no commas in numbers, for example 1.5 or 1000.');
  });

  it('keeps % as the remainder, and refuses what is not arithmetic', async () => {
    expect(await run('200 % 15')).toBe('200 % 15 = 5');
    expect(await run('2+abc')).toMatch(/^ERROR Invalid expression: only numbers and basic operators/);
    expect(await run('2*')).toMatch(/^ERROR /);
    expect(await run('10^400')).toBe('ERROR Expression did not evaluate to a finite number');
  });
});
