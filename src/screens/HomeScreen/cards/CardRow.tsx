import React from 'react';
import { View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { AnimatedPressable } from '../../../components/AnimatedPressable';
import { useTheme, useThemedStyles } from '../../../theme';
import type { ThemeColors } from '../../../theme';
import { TYPOGRAPHY, SPACING } from '../../../constants';

type Props = {
  testID: string;
  label: string;
  /** What the row counts or says, on the right. */
  value: string;
  /** A second, quieter line under the label. */
  note?: string;
  onPress: () => void;
};

/** One tappable line on a Home card: a label, its value and a chevron. Both texts stay on one line. */
export const CardRow: React.FC<Props> = ({ testID, label, value, note, onPress }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <AnimatedPressable testID={testID} style={styles.row} hapticType="selection" onPress={onPress}>
      <View style={styles.texts}>
        <View style={styles.line}>
          <Text style={styles.label} numberOfLines={1}>{label}</Text>
          <Text style={styles.value} numberOfLines={1}>{value}</Text>
        </View>
        {note ? <Text style={styles.note} numberOfLines={1}>{note}</Text> : null}
      </View>
      <Icon name="chevron-right" size={16} color={colors.textMuted} />
    </AnimatedPressable>
  );
};

const createStyles = (colors: ThemeColors) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.md,
    minHeight: 44,
  },
  texts: { flex: 1, minWidth: 0 },
  line: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.md,
  },
  label: { ...TYPOGRAPHY.body, color: colors.text },
  value: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted, flex: 1, textAlign: 'right' as const },
  note: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted },
});
