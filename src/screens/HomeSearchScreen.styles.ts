import type { ThemeColors, ThemeShadows } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { createStyles as createGuideLibraryStyles } from './GuideLibraryScreen.styles';

/** The Guide library's header and field look, plus a result row with a title and its kind. */
export const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => {
  const base = createGuideLibraryStyles(colors, shadows);
  return {
    container: base.container,
    header: base.header,
    headerButton: base.headerButton,
    headerTitle: base.headerTitle,
    content: { ...base.content, paddingTop: SPACING.md },
    search: { ...base.search, marginTop: 0, marginBottom: SPACING.md },
    row: { ...base.row, minHeight: 44 },
    title: { ...TYPOGRAPHY.body, color: colors.text },
    kind: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary },
    empty: { ...TYPOGRAPHY.body, color: colors.textSecondary, paddingTop: SPACING.md },
  };
};
