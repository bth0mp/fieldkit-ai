import type { ThemeColors, ThemeShadows } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { createStyles as createKiwixStyles } from './KiwixFilesScreen.styles';

/** The Guide library's look and the Kiwix screen's group headers, plus a typing row and tick-box items. */
export const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => {
  const base = createKiwixStyles(colors, shadows);
  return {
    ...base,
    addRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: SPACING.sm, marginTop: SPACING.md },
    // The Guide library's search field, sharing a row with a button.
    field: { ...base.search, marginTop: 0, flex: 1, minHeight: 44 },
    starter: { marginTop: SPACING.md, alignItems: 'flex-start' as const },
    // A list's name is the user's own words and the thing to tap: body text that wraps, not a small label.
    listTitle: { ...TYPOGRAPHY.body, color: colors.text, flex: 1, paddingRight: SPACING.sm },
    itemRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    // The whole row ticks the item, not only the box: at least 44 high.
    itemTick: {
      flex: 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: SPACING.md,
      minHeight: 44,
      paddingVertical: SPACING.sm,
    },
    itemText: { ...TYPOGRAPHY.body, color: colors.text, flex: 1 },
    itemDone: { color: colors.textMuted, textDecorationLine: 'line-through' as const },
    listActions: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      marginTop: SPACING.sm,
      marginBottom: SPACING.md,
    },
  };
};
