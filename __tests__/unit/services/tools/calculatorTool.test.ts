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

  it('says so when a result is too big to be exact', async () => {
    // The true product is 121932631112635269; a double cannot hold its last digits.
    expect(await run('123456789*987654321')).toBe('123456789*987654321 = about 121932631112635000');
    expect(await run('9007199254740991+0')).toBe('9007199254740991+0 = 9007199254740991');
  });

  it('says what is wrong with a comma', async () => {
    expect(await run('1,5+1')).toBe('ERROR Use a decimal point and no commas in numbers, for example 1.5 or 1000.');
    expect(await run('1,000+1')).toBe('ERROR Use a decimal point and no commas in numbers, for example 1.5 or 1000.');
  });

  it('keeps % as the remainder, and refuses what is not arithmetic', async () => {
    expect(await run('200 % 15')).toBe('200 % 15 = 5');
    expect(await run('2+abc')).toMatch(/^ERROR Invalid expression: only numbers and basic operators/);
    expect(await run('2*')).toMatch(/^ERROR /);
    expect(await run('1/0')).toBe('ERROR Expression did not evaluate to a finite number');
  });
});
