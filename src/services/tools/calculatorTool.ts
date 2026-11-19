/**
 * calculator: arithmetic typed as a sum, for the assistant and for the Calculators screen. No dynamic code: a small
 * recursive-descent parser. Short decimals are worked in whole numbers, so 5 - 4.99 is 0.01 and not the
 * 0.00999999999999979 that binary fractions give; anything else is worked in binary and shown rounded.
 */

/**
 * Safe math expression evaluator using recursive descent parsing.
 * Supports: +, -, *, /, %, ^ (exponentiation), parentheses, decimals.
 * No dynamic code execution (no eval/new Function).
 */
function evaluateExpression(expr: string, note?: { exact: boolean }): number {
  let pos = 0;
  const str = expr.replaceAll(/\s/g, '');
  // Whether every step so far was worked as an exact decimal. One step in binary (1/3, a root, numbers too long)
  // and the answer is shown rounded, not in full.
  let allExact = true;

  // Whole numbers and binary fractions (halves, quarters, down to 1/1024ths) are held exactly, so a small
  // difference between two of them is real. A decimal fraction such as 0.1 is not, and sums of those leave dust.
  const exact = (x: number) => Number.isInteger(x * 1024);
  const bothExact = (a: number, b: number) => exact(a) && exact(b);

  // A step that overflows is refused where it happens: 1/10^400 would otherwise come out as 0.
  const finite = (x: number) => {
    if (x === Infinity || x === -Infinity) throw new Error('That is too large to work out.');
    return x;
  };

  function parseExpr(): number {
    let left = parseTerm();
    while (pos < str.length && (str[pos] === '+' || str[pos] === '-')) {
      const op = str[pos++];
      const right = parseTerm();
      const exactly = inDecimal(left, op, right);
      if (exactly !== undefined) { left = exactly; continue; }
      // Not two short decimals (one came from a division, say): work it in binary. 1/3+1/3-2/3 leaves dust
      // there, and a result that small beside what made it has no real digits: it is 0.
      allExact = false;
      const sum = op === '+' ? left + right : left - right;
      const dust = !bothExact(left, right) && Math.abs(sum) < 1e-14 * Math.max(Math.abs(left), Math.abs(right));
      left = finite(dust ? 0 : sum);
    }
    return left;
  }

  /**
   * The remainder, with the binary dust taken off: 1 % 0.1 is 0, not 0.09999999999999995. It is 0 only where
   * the first number is a whole number of the second as near as a double can say (1 / 0.1 is 10.000000000000002).
   * A remainder that is merely small beside the divisor is real: 0.18 % 1000000 is 0.18. And past a thousand
   * million divisors a double cannot tell a whole number of them from nearly one, so the remainder is left as
   * the numbers held give it.
   */
  function remainder(left: number, right: number): number {
    const rest = left % right;
    if (bothExact(left, right)) return rest;
    const times = left / right;
    const whole = Math.round(times);
    const wholeTimes = whole !== 0 && Math.abs(times) < 1e9 && Math.abs(times - whole) <= 4 * Number.EPSILON * Math.abs(times);
    return wholeTimes ? 0 : rest;
  }

  function parseTerm(): number {
    let left = parseUnary();
    while (pos < str.length && (str[pos] === '*' || str[pos] === '/' || str[pos] === '%')) {
      const op = str[pos++];
      const right = parseUnary();
      // Refused here, not only when the whole sum is infinite: 1/(1/0) would otherwise come out as 0.
      if (op !== '*' && right === 0) throw new Error('Cannot divide by zero.');
      const exactly = inDecimal(left, op, right);
      if (exactly === undefined) allExact = false;
      if (exactly !== undefined) left = exactly;
      else if (op === '*') left *= right;
      else if (op === '/') left /= right;
      else left = remainder(left, right);
      finite(left);
    }
    return left;
  }

  // A sign ranks below a power, as in arithmetic: -2^2 is -(2^2), not (-2)^2.
  function parseUnary(): number {
    if (str[pos] === '-') { pos++; return -parseUnary(); }
    if (str[pos] === '+') { pos++; return parseUnary(); }
    return parsePower();
  }

  function parsePower(): number {
    let base = parseAtom();
    if (pos < str.length && str[pos] === '^') {
      pos++;
      const exp = parseUnary(); // right-associative, and the exponent may carry a sign: 2^-1
      // 0 to a negative power is one over 0. Math.pow makes it Infinity, and anything over that is 0.
      if (base === 0 && exp < 0) throw new Error('Cannot divide by zero.');
      const exactly = exactPower(base, exp);
      if (exactly === undefined) allExact = false;
      base = exactly ?? finite(Math.pow(base, exp));
    }
    return base;
  }

  function parseAtom(): number {
    if (str[pos] === '(') {
      pos++; // skip '('
      const val = parseExpr();
      if (str[pos] !== ')') throw new Error('Mismatched parentheses');
      pos++; // skip ')'
      return val;
    }
    const start = pos;
    while (pos < str.length && (str[pos] >= '0' && str[pos] <= '9' || str[pos] === '.')) pos++;
    if (pos === start) throw new Error('Unexpected character');
    const digits = str.substring(start, pos);
    // "1.2.3" and a lone "." are not numbers; Number() would make them NaN and the message would be about infinity.
    if (!/^(\d+\.?\d*|\.\d+)$/.test(digits)) throw new Error(`That is not a number: ${digits}`);
    return Number(digits);
  }

  const result = parseExpr();
  if (pos < str.length) throw new Error('Unexpected character');
  if (note) note.exact = allExact;
  return result;
}

/** The most decimal places a number may have and still be worked in whole numbers of them. */
const MAX_PLACES = 15;
/** The largest whole number of those places worked with: two of them added are still exact in a double. */
const MAX_SCALED = 1e15;

/**
 * How many decimal places a number is written with, when it is a short decimal: 7 has 0, 0.1 has 1, 4.35 has 2.
 * -1 when it is not one (1/3, or a sum left in binary), or is too long or too large to scale to a whole number.
 */
function decimalPlaces(x: number): number {
  if (!Number.isFinite(x)) return -1;
  for (let places = 0; places <= MAX_PLACES; places++) {
    if (Math.abs(x) * 10 ** places > MAX_SCALED) return -1;
    if (Number(x.toFixed(places)) === x) return places;
  }
  return -1;
}

/**
 * A sum, difference, product, quotient or remainder of two short decimals, worked in whole numbers so that it
 * is the decimal answer: 5 - 4.99 is 0.01, where binary fractions make it 0.00999999999999979. Undefined when
 * either number is not a short decimal, or the whole numbers would be too large to be exact; the caller then
 * works it in binary. Dividing a whole number by a power of ten gives the double nearest the true decimal.
 */
function inDecimal(left: number, op: string, right: number): number | undefined {
  const [leftPlaces, rightPlaces] = [decimalPlaces(left), decimalPlaces(right)];
  if (leftPlaces < 0 || rightPlaces < 0) return undefined;
  if (op === '*') {
    const product = Math.round(left * 10 ** leftPlaces) * Math.round(right * 10 ** rightPlaces);
    // Powers of ten are exact in a double only up to 10^22.
    return Number.isSafeInteger(product) && leftPlaces + rightPlaces <= 22 ? product / 10 ** (leftPlaces + rightPlaces) : undefined;
  }
  const places = Math.max(leftPlaces, rightPlaces);
  const [a, b] = [Math.round(left * 10 ** places), Math.round(right * 10 ** places)];
  if (Math.abs(a) > MAX_SCALED || Math.abs(b) > MAX_SCALED) return undefined;
  if (op === '/') {
    // Only a quotient that comes out even in a few more places is a decimal: 1/8 is, 1/3 is not.
    for (let more = 0; more <= MAX_PLACES; more++) {
      const scaled = a * 10 ** more;
      if (!Number.isSafeInteger(scaled)) return undefined;
      if (scaled % b === 0) return scaled / b / 10 ** more;
    }
    return undefined;
  }
  if (op === '%') return (a % b) / 10 ** places;
  return (op === '+' ? a + b : a - b) / 10 ** places;
}

/** A short decimal to a whole power, by exact multiplying: 1.5^2 is 2.25, 2^-3 is 0.125. Undefined if not exact. */
function exactPower(base: number, exp: number): number | undefined {
  if (!Number.isInteger(exp) || Math.abs(exp) > 64) return undefined;
  let result: number | undefined = 1;
  for (let i = 0; i < Math.abs(exp) && result !== undefined; i++) result = inDecimal(result, '*', base);
  if (result === undefined || exp >= 0) return result;
  return inDecimal(1, '/', result);
}

/**
 * A result as people expect to read it. A whole number that a double holds exactly is printed as it is, and so
 * is a short decimal, in full (0.0000001, not 1e-7). Anything else under a hundred million million (1/3, a
 * root) is shown to twelve significant digits, as a pocket calculator shows it: a double is not sure of its
 * last few. From a hundred million million up the digits no longer reach the units, so the number is printed as
 * held, unrounded, and the answer says "about".
 */
function formatCalculated(result: number, exact = false): string {
  if (Number.isSafeInteger(result)) return String(result);
  if (Math.abs(result) >= 1e14) return `about ${result}`;
  const places = exact ? decimalPlaces(result) : -1;
  return places >= 0 ? result.toFixed(places) : String(Number(result.toPrecision(12)));
}

/** The multiply, divide and minus signs a phone keyboard offers, by code point, as the ones the parser knows. */
const KEYBOARD_SIGNS: Array<[number, string]> = [[0xd7, '*'], [0xf7, '/'], [0x2212, '-']];

export function calculate(sent: unknown): string {
  // A model may send a bare number where the sum should be.
  const typed = typeof sent === 'number' ? String(sent) : sent;
  if (typeof typed !== 'string' || !typed.trim()) throw new Error('Missing required parameter: expression');
  const expression = KEYBOARD_SIGNS.reduce((text, [code, sign]) => text.replaceAll(String.fromCodePoint(code), sign), typed);
  // A space is not an operator: "1 1/2" must not be read as 11/2. A person typing into the Calculators screen
  // writes it; a model rarely did.
  if (/[\d.)]\s+[\d.(]/.test(expression)) throw new Error('Put an operator between the numbers: a space is not one.');
  if (expression.includes(',')) throw new Error('Use a decimal point and no commas in numbers, for example 1.5 or 1000.');
  const sanitized = expression.replaceAll(/\s/g, '');
  if (!/^[0-9+\-*/().%^]+$/.test(sanitized)) {
    throw new Error('Invalid expression: only numbers and basic operators (+, -, *, /, ^, %, parentheses) are allowed');
  }

  const note = { exact: false };
  const result = evaluateExpression(sanitized, note);

  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new TypeError('Expression did not evaluate to a finite number');
  }

  return `${typed.trim()} = ${formatCalculated(result, note.exact)}`;
}
