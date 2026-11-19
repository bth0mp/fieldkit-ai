import type { ThemeColors, ThemeShadows } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { createStyles as createKiwixStyles } from './KiwixFilesScreen.styles';

/** The Guide library's look and the Kiwix screen's group headers, plus a two-column sign and meaning row. */
export const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => ({
  ...createKiwixStyles(colors, shadows),
  // A card's title is the thing to tap: body text that wraps, not the small label a Kiwix category gets.
  cardTitle: { ...TYPOGRAPHY.body, color: colors.text, flex: 1, paddingRight: SPACING.sm },
  referenceRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  // A share of the row, not a fixed width: the sign column grows with the screen and holds "Three of anything".
  sign: { ...TYPOGRAPHY.body, color: colors.text, flex: 2, minWidth: 96 },
  meaning: { ...TYPOGRAPHY.body, color: colors.textSecondary, flex: 5 },
  source: { ...TYPOGRAPHY.metaSmall, color: colors.textMuted, paddingTop: SPACING.sm },
  // What was typed, spelled out: body text, a line for the radio words and a line for the Morse.
  spelled: { ...TYPOGRAPHY.body, color: colors.text, paddingVertical: SPACING.xs },
});
