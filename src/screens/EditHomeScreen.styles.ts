import type { ThemeColors, ThemeShadows } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { createStyles as createGuideLibraryStyles } from './GuideLibraryScreen.styles';

/** The Guide library's header and row look, plus a row with move buttons and a switch. */
export const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => {
  const base = createGuideLibraryStyles(colors, shadows);
  return {
    container: base.container,
    header: base.header,
    headerButton: base.headerButton,
    headerTitle: base.headerTitle,
    content: { ...base.content, paddingTop: SPACING.lg },
    row: { ...base.row, flexDirection: 'row' as const, alignItems: 'center' as const, gap: SPACING.xs },
    name: { ...TYPOGRAPHY.body, color: colors.text, flex: 1 },
    note: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary },
    reset: { alignSelf: 'flex-start' as const, marginTop: SPACING.md },
  };
};
