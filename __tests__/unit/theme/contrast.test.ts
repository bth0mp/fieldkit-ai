import { COLORS_LIGHT, COLORS_DARK } from '../../../src/theme/palettes';

const luminance = (hex: string): number => {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

type Colors = typeof COLORS_LIGHT;
type Pair = [keyof Colors, keyof Colors, number];

const PAIRS: Pair[] = [
  ['text', 'background', 4.5],
  ['text', 'surface', 4.5],
  ['textSecondary', 'background', 4.5],
  ['textSecondary', 'surface', 4.5],
  ['primary', 'background', 4.5],
  ['primary', 'surface', 4.5],
  ['textMuted', 'background', 3],
  ['background', 'primary', 4.5],
];

describe.each([
  ['light', COLORS_LIGHT],
  ['dark', COLORS_DARK],
])('%s palette contrast', (_name, colors) => {
  it.each(PAIRS)('%s on %s is at least %s:1', (fg, bg, min) => {
    expect(ratio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(min);
  });
});
