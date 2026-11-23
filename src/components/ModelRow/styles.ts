import { StyleSheet } from 'react-native';
import { TYPOGRAPHY, SPACING } from '../../constants';
import type { ThemeColors } from '../../theme';

/**
 * Canonical model row for "Your models" on the Models screen. Any restyle happens here once.
 */
export const createModelRowStyles = (colors: ThemeColors) => StyleSheet.create({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: colors.surface,
  },
  rowSelectedText: {
    backgroundColor: `${colors.primary}15`,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  rowSelectedImage: {
    backgroundColor: `${colors.info}15`,
    borderWidth: 1,
    borderColor: colors.info,
  },
  info: { flex: 1 },
  name: { ...TYPOGRAPHY.body, color: colors.text, marginBottom: 4 },
  nameSelectedText: { color: colors.primary },
  nameSelectedImage: { color: colors.info },
  nameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: SPACING.xs, marginBottom: 4 },
  nameBesideMark: { flexShrink: 1, marginBottom: 0 },
  meta: { flexDirection: 'row' as const, alignItems: 'center' as const },
  metaWrap: { flexWrap: 'wrap' as const },
  metaText: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary },
  metaMuted: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted },
  separator: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted, marginHorizontal: 6 },
  visionBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: `${colors.info}20`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  visionBadgeText: { ...TYPOGRAPHY.label, color: colors.info },
  ramHint: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted, marginTop: 4 },
  status: { ...TYPOGRAPHY.label, color: colors.textMuted, marginLeft: SPACING.sm },
  action: {
    minHeight: 32,
    justifyContent: 'center' as const,
    paddingHorizontal: SPACING.md,
    marginLeft: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: { ...TYPOGRAPHY.bodySmall, color: colors.text },
});
