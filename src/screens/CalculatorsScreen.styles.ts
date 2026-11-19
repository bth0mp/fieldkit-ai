import type { ThemeColors, ThemeShadows } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { createStyles as createKiwixStyles } from './KiwixFilesScreen.styles';

/** The Guide library's look and the Kiwix screen's group headers, plus labelled boxes and an answer. */
export const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => {
  const base = createKiwixStyles(colors, shadows);
  return {
    ...base,
    // A calculator's name is the thing to tap: body text, not the small label a Kiwix category gets.
    cardTitle: { ...TYPOGRAPHY.body, color: colors.text, flex: 1, paddingRight: SPACING.sm },
    label: { ...TYPOGRAPHY.body, color: colors.text, marginTop: SPACING.md },
    // The Guide library's search field, a full 44-high touch target.
    field: { ...base.search, marginTop: SPACING.xs, minHeight: 44 },
    go: { marginTop: SPACING.md, alignItems: 'flex-start' as const },
    tapTarget: { minHeight: 44 },
    answer: { ...TYPOGRAPHY.body, color: colors.text, marginTop: SPACING.md, marginBottom: SPACING.md },
  };
};
