import type { ThemeColors, ThemeShadows } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';

export const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => ({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.small,
  },
  headerButton: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  headerTitle: { ...TYPOGRAPHY.h2, color: colors.text },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  yourPhone: { ...TYPOGRAPHY.body, color: colors.text, paddingBottom: SPACING.md },
  sectionTitle: { ...TYPOGRAPHY.h2, color: colors.text, paddingTop: SPACING.xl, paddingBottom: SPACING.sm },
  tier: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: SPACING.xs,
  },
  tierYours: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  tierTitle: { ...TYPOGRAPHY.body, color: colors.text },
  yoursBadge: { ...TYPOGRAPHY.bodySmall, color: colors.primary },
  detail: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary },
  note: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted, paddingTop: SPACING.md },
  entry: { paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: SPACING.xs },
  entryName: { ...TYPOGRAPHY.body, color: colors.text },
});
