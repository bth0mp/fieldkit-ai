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
    expect(await run('-2^0.5')).toBe('-2^0.5 = -1.41421356237');
    expect(await run('2^(1+1)')).toBe('2^(1+1) = 4');
  });

  it('does not show the dust of binary fractions', async () => {
    // These used to end ...99999999999994, ...0000000004 and so on.
    expect(await run('4.35*100')).toBe('4.35*100 = 435');
    expect(await run('0.1+0.2')).toBe('0.1+0.2 = 0.3');
    expect(await run('100*1.1')).toBe('100*1.1 = 110');
    // A result that is not a short decimal is shown to twelve digits, as a pocket calculator does: the
    // fifteenth was wrong about one time in three ((70-13)/13*100 printed ...539 for ...538).
    expect(await run('1/3')).toBe('1/3 = 0.333333333333');
    expect(await run('(70-13)/13*100')).toBe('(70-13)/13*100 = 438.461538462');
    // Twelve digits whenever a step was not exact, even where the answer happens to fit twelve decimal places.
    expect(await run('(269-63)/63*100')).toBe('(269-63)/63*100 = 326.984126984');
    expect(await run('885.85/3.1')).toBe('885.85/3.1 = 285.758064516');
    // An exact decimal answer is given in full however many digits it has.
    expect(await run('12345678901.23+0.01')).toBe('12345678901.23+0.01 = 12345678901.24');
    expect(await run('1/8')).toBe('1/8 = 0.125');
    expect(await run('1.5^2')).toBe('1.5^2 = 2.25');
    expect(await run('2^-3')).toBe('2^-3 = 0.125');
    expect(await run('500*321')).toBe('500*321 = 160500');
  });

  it('does sums of ordinary decimals exactly', async () => {
    // Binary fractions made these 0.00999999999999979, 0.0999999999999996, 0.100000000000023 and so on. A last
    // review, with exact arithmetic as the truth, found one subtraction of prices in thirty printed noise.
    const sums: Array<[string, string]> = [
      ['5-4.99', '0.01'], ['10-9.99', '0.01'], ['20-19.99', '0.01'], ['10.1-10', '0.1'], ['1.4-1.3', '0.1'],
      ['2-1.94', '0.06'], ['0.56-0.50', '0.06'], ['1000.1-1000', '0.1'], ['4.35*100-434', '1'],
      ['123456.789-123456.788', '0.001'], ['1.1*1.1', '1.21'], ['0.1*0.1', '0.01'], ['19.99*3', '59.97'],
      ['0.6/0.2', '3'], ['0.3/0.1', '3'], ['1.21/1.1', '1.1'], ['100.1-100-0.1+5', '5'],
      // Dust that an earlier step left used to slip past: the big number had already cancelled.
      ['16.1-16-0.1', '0'], ['2.01-2-0.01', '0'], ['2.75+0.01-2.75-0.01', '0'], ['254.01-253.52-0.49', '0'],
      ['3654.55-10.06-612.89-240.07-438.66-988.60-763.52-559.53-41.22', '0'],
      // A small decimal is written out, not as 1e-7.
      ['0.0000001+0', '0.0000001'], ['0.00000123*1', '0.00000123'],
      // A real difference in the fourteenth place is kept: the rule for binary dust used to call it 0.
      ['1.00000000000001-1', '0.00000000000001'], ['1.0000000000001-1', '0.0000000000001'],
      ['1.1-1.0999999999999', '0.0000000000001'], ['1.00000000000001%1', '0.00000000000001'],
    ];
    for (const [sum, answer] of sums) expect(await run(sum)).toBe(`${sum} = ${answer}`);
    expect(await run('1/(16.1-16-0.1)')).toBe('ERROR Cannot divide by zero.');
  });

  it('gives the remainder of ordinary decimals exactly', async () => {
    const sums: Array<[string, string]> = [
      ['8.3%0.7', '0.6'], ['0.7%0.2', '0.1'], ['1.2%1.1', '0.1'], ['1%0.07', '0.02'], ['10.15%0.1', '0.05'],
      ['100.3%0.25', '0.05'], ['-85.64%0.8', '-0.04'], ['1000000%0.001', '0'], ['100000000%0.1', '0'],
    ];
    for (const [sum, answer] of sums) expect(await run(sum)).toBe(`${sum} = ${answer}`);
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
    expect(await run('1.7976931348623157*10^308')).toBe('1.7976931348623157*10^308 = about 1.7976931348623157e+308');
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
    expect(await run('2.2%1.1')).toBe('2.2%1.1 = 0');
    expect(await run('-5.5%1.1')).toBe('-5.5%1.1 = 0');
  });

  it('keeps a small number whole when it is divided by a much larger one', async () => {
    // The first rule for the dust called any remainder far smaller than the divisor "dust", so these were 0.
    // Found by comparing the tool with a textbook evaluator on 20,000 random sums.
    expect(await run('0.18%831^6')).toBe('0.18%831^6 = 0.18');
    expect(await run('0.3%1000000000000000')).toBe('0.3%1000000000000000 = 0.3');
    expect(await run('308/915591187%26.1^8')).toBe('308/915591187%26.1^8 = 3.36394675236e-7');
    expect(await run('8+720%95.5^7')).toBe('8+720%95.5^7 = 728');
    // Nor is a remainder called 0 because the first number is so much the larger that no double can tell: it
    // is then the remainder of the numbers as held, as it always was.
    expect(await run('2^790%3.74')).toBe('2^790%3.74 = 1.97115562766');
  });

  it('refuses a step that overflows or divides by zero, though the end would be finite', async () => {
    // 0 to a negative power is a division by zero; it used to become Infinity, and 1/Infinity is 0.
    for (const sum of ['1/0^-1', '8/(5-5)^-1', '5/0^-2+3', '7%0^-1', '0^-1']) {
      expect({ sum, answer: await run(sum) }).toEqual({ sum, answer: 'ERROR Cannot divide by zero.' });
    }
    for (const sum of ['10^400', '1/10^400', '7.1%142^425', '10^200*10^200', '5-10^400']) {
      expect({ sum, answer: await run(sum) }).toEqual({ sum, answer: 'ERROR That is too large to work out.' });
    }
    expect(await run('(0-8)^(1/3)')).toBe('ERROR Expression did not evaluate to a finite number');
  });

  it('takes a number where a model sends one, and names a missing sum', async () => {
    const send = async (expression: unknown) => {
      const result = await executeToolCall({ name: 'calculator', arguments: { expression } });
      return result.error ? `ERROR ${result.error}` : result.content;
    };
    expect(await send(42)).toBe('42 = 42');
    expect(await send(undefined)).toBe('ERROR Missing required parameter: expression');
    expect(await send('   ')).toBe('ERROR Missing required parameter: expression');
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
    expect(await run('2*')).toBe('ERROR Unexpected character');
  });
});
