import type { ThemeColors, ThemeShadows } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { createStyles as createLibraryStyles } from './GuideLibraryScreen.styles';

/** The Guide library's look, plus the Kiwix screen's buttons, group headers and category sheet. */
export const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => ({
  ...createLibraryStyles(colors, shadows),
  buttons: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: SPACING.sm, marginTop: SPACING.lg },
  groupHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: 44,
    backgroundColor: colors.background,
    paddingTop: SPACING.md,
  },
  groupTitle: { ...TYPOGRAPHY.label, color: colors.textMuted },
  removeButton: { minWidth: 44, minHeight: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  sheetList: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl },
  sheetRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: 44,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetLabel: { ...TYPOGRAPHY.body, color: colors.text },
});
